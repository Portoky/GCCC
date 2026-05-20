import { useState, useRef } from "react";

export default function Upload({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const getFileIcon = (f) => {
    if (!f) return "📄";
    const t = f.type;
    if (t.startsWith("image/")) return "🖼️";
    if (t === "application/pdf") return "📕";
    if (t.includes("word")) return "📝";
    if (t.includes("sheet") || t.includes("excel")) return "📊";
    if (t.includes("zip") || t.includes("compressed")) return "🗜️";
    return "📄";
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setStatus(null);

    const form = new FormData();
    form.append("file", file);
    form.append("is_public", isPublic);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      setStatus("success");
      setFile(null);
      setTimeout(() => onUploaded(), 1200);
    } catch {
      setStatus("error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 580 }}>
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "1.4rem", marginBottom: "1.5rem" }}>
        Upload a document
      </h2>

      <div
        className={`dropzone ${dragover ? "dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current.click()}
      >
        <div className="dropzone-icon">{getFileIcon(file)}</div>
        {file ? (
          <div className="dropzone-file">{file.name} — {formatSize(file.size)}</div>
        ) : (
          <div className="dropzone-text">
            <strong>Click to browse</strong> or drag & drop a file here
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => setFile(e.target.files[0])}
        />
      </div>

      <div className="form-group">
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Make file public</div>
            <div className="toggle-sub">Public files are visible to all users</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={!file || uploading}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {uploading ? "Uploading..." : "Upload file"}
      </button>

      {uploading && <div className="progress-bar"><div className="progress-fill" /></div>}
      {status === "success" && <div className="success-msg">✓ File uploaded successfully! Redirecting...</div>}
      {status === "error" && <div className="error-msg">✗ Upload failed. Please try again.</div>}
    </div>
  );
}
