import os
import json
import time
import threading
from azure.storage.queue import QueueServiceClient
from azure.storage.blob import BlobServiceClient
from azure.data.tables import TableServiceClient
from azure.ai.textanalytics import TextAnalyticsClient
from azure.core.credentials import AzureKeyCredential
import io
from pypdf import PdfReader


def get_text_from_blob(blob_service, blob_name: str) -> str:
    container_client = blob_service.get_container_client("documents")
    blob_client = container_client.get_blob_client(blob_name)
    content = blob_client.download_blob().readall()
    
    filename = blob_name.lower()
    
    # PDF extraction
    if filename.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text[:5000]
        except Exception as e:
            print(f"PDF extraction failed: {e}")
            return ""
    
    # Plain text files
    try:
        return content.decode("utf-8", errors="ignore")[:5000]
    except Exception:
        return ""


def process_document(text: str, ai_client: TextAnalyticsClient):
    summary = ""
    tags = []

    if not text.strip():
        return summary, tags

    try:
        # Extract key phrases (tags)
        kp_response = ai_client.extract_key_phrases([text])
        for doc in kp_response:
            if not doc.is_error:
                tags = list(doc.key_phrases)[:10]
    except Exception as e:
        print(f"Key phrase extraction failed: {e}")

    try:
        # Abstractive summarization
        poller = ai_client.begin_abstract_summary([text])
        results = poller.result()
        for result in results:
            if not result.is_error:
                summary = " ".join([s.text for s in result.summaries])
    except Exception as e:
        print(f"Summarization failed: {e}")

    return summary, tags


def worker_loop():
    conn = os.environ.get("AZURE_CONNECTION_STRING", "")
    language_key = os.environ.get("AZURE_LANGUAGE_KEY", "")
    language_endpoint = os.environ.get("AZURE_LANGUAGE_ENDPOINT", "")

    if not conn or not language_key or not language_endpoint:
        print("Worker: missing env variables, exiting.")
        return

    blob_service = BlobServiceClient.from_connection_string(conn)
    queue_service = QueueServiceClient.from_connection_string(conn)
    table_service = TableServiceClient.from_connection_string(conn)
    ai_client = TextAnalyticsClient(
        endpoint=language_endpoint,
        credential=AzureKeyCredential(language_key)
    )

    queue_client = queue_service.get_queue_client("process-queue")
    table_client = table_service.get_table_client("DocumentMetadata")

    print("Worker: starting queue polling loop...")

    while True:
        try:
            messages = queue_client.receive_messages(max_messages=5)
            for msg in messages:
                try:
                    data = json.loads(msg.content)
                    blob_name = data.get("blob_name", "")
                    filename = data.get("filename", "")
                    print(f"Worker: processing {filename}")

                    # Get text from blob
                    text = get_text_from_blob(blob_service, blob_name)

                    # Run AI processing
                    summary, tags = process_document(text, ai_client)

                    # Update table metadata
                    entities = list(table_client.query_entities(
                        f"blob_name eq '{blob_name}'"
                    ))
                    if entities:
                        entity = entities[0]
                        entity["summary"] = summary
                        entity["tags"] = json.dumps(tags)
                        entity["processed"] = True
                        table_client.update_entity(entity)
                        print(f"Worker: updated metadata for {filename}")

                    # Delete message from queue
                    queue_client.delete_message(msg)

                except Exception as e:
                    print(f"Worker: error processing message: {e}")
                    queue_client.delete_message(msg)

        except Exception as e:
            print(f"Worker: queue error: {e}")

        time.sleep(10)  # poll every 10 seconds


def start_worker():
    thread = threading.Thread(target=worker_loop, daemon=True)
    thread.start()
    print("Worker thread started.")