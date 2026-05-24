from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueServiceClient
from azure.data.tables import TableServiceClient
from datetime import datetime, timezone
import uuid
import json
import os
from worker import start_worker

blob_service, queue_service, table_service = None, None, None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global blob_service, queue_service, table_service
    conn = os.environ.get("AZURE_CONNECTION_STRING", "")
    blob_service = BlobServiceClient.from_connection_string(conn)
    queue_service = QueueServiceClient.from_connection_string(conn)
    table_service = TableServiceClient.from_connection_string(conn)
    start_worker()  # start background worker
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BLOB_CONTAINER = "documents"
QUEUE_NAME = "process-queue"
TABLE_NAME = "DocumentMetadata"



def get_user(request: Request) -> str:
    # Azure Easy Auth injects the logged-in user's email here
    return request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME", "anonymous")


@app.get("/api/me")
async def me(request: Request):
    return {"user": get_user(request)}


@app.post("/api/upload")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    is_public: bool = Form(False),
):
    user = get_user(request)
    content = await file.read()
    file_size = len(content)
    blob_name = f"{uuid.uuid4()}_{file.filename}"

    # 1. Upload file to Blob Storage
    container_client = blob_service.get_container_client(BLOB_CONTAINER)
    container_client.upload_blob(blob_name, content)

    # 2. Push job to Queue for async processing
    queue_client = queue_service.get_queue_client(QUEUE_NAME)
    queue_client.send_message(json.dumps({
        "blob_name": blob_name,
        "filename": file.filename,
        "uploader": user,
    }))

    # 3. Save metadata to Table Storage
    table_client = table_service.get_table_client(TABLE_NAME)
    entity = {
        "PartitionKey": "docs",
        "RowKey": str(uuid.uuid4()),
        "filename": file.filename,
        "blob_name": blob_name,
        "size": file_size,
        "content_type": file.content_type or "application/octet-stream",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploader": user,
        "is_public": is_public,
        "processed": False,
    }
    table_client.create_entity(entity)

    return {"message": "Uploaded successfully", "blob_name": blob_name}


@app.get("/api/files")
async def list_files(request: Request):
    user = get_user(request)
    table_client = table_service.get_table_client(TABLE_NAME)
    entities = list(table_client.list_entities())

    # Show own files + public files from others
    visible = [
        e for e in entities
        if e.get("uploader") == user or e.get("is_public", False)
    ]
    visible.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)

    return {"files": [
        {
            "id": e["RowKey"],
            "filename": e.get("filename", ""),
            "size": e.get("size", 0),
            "content_type": e.get("content_type", ""),
            "uploaded_at": e.get("uploaded_at", ""),
            "uploader": e.get("uploader", ""),
            "is_public": e.get("is_public", False),
            "is_own": e.get("uploader") == user,
            "processed": e.get("processed", False),
            "blob_name": e.get("blob_name", ""),
            "tags": e.get("tags", "[]"),
            "summary": e.get("summary", ""),
        }
        for e in visible
    ]}


@app.get("/api/download/{row_key}")
async def download(row_key: str, request: Request):
    user = get_user(request)
    table_client = table_service.get_table_client(TABLE_NAME)

    entities = list(table_client.query_entities(f"RowKey eq '{row_key}'"))
    if not entities:
        raise HTTPException(status_code=404, detail="File not found")

    entity = entities[0]
    if entity.get("uploader") != user and not entity.get("is_public", False):
        raise HTTPException(status_code=403, detail="Access denied")

    blob_name = entity["blob_name"]
    container_client = blob_service.get_container_client(BLOB_CONTAINER)
    blob_client = container_client.get_blob_client(blob_name)
    stream = blob_client.download_blob()

    return StreamingResponse(
        stream.chunks(),
        media_type=entity.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename={entity['filename']}"}
    )


@app.delete("/api/files/{row_key}")
async def delete_file(row_key: str, request: Request):
    user = get_user(request)
    table_client = table_service.get_table_client(TABLE_NAME)

    entities = list(table_client.query_entities(f"RowKey eq '{row_key}'"))
    if not entities:
        raise HTTPException(status_code=404, detail="File not found")

    entity = entities[0]
    if entity.get("uploader") != user:
        raise HTTPException(status_code=403, detail="Only the owner can delete this file")

    # Delete from Blob Storage
    container_client = blob_service.get_container_client(BLOB_CONTAINER)
    container_client.delete_blob(entity["blob_name"])

    # Delete from Table Storage
    table_client.delete_entity(partition_key="docs", row_key=row_key)

    return {"message": "Deleted successfully"}


# Serve React build as static files
frontend_build = os.path.join(os.path.dirname(__file__), "frontend", "build")
if os.path.exists(frontend_build):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_build, "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(os.path.join(frontend_build, "index.html"))