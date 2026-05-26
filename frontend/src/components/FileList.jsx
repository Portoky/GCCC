import { useState } from "react";

export default function FileList({ files, loading, onDelete, onDownload, activeTab }) {
  const [expanded, setExpanded] = useState({});

  const toggleSummary = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getFileIcon = (contentType) => {
    if (!contentType) return "📄";
    if (contentType.startsWith("image/")) return "🖼️";
    if (contentType === "application/pdf") return "📕";
    if (contentType.includes("word")) return "📝";
    if (contentType.includes("sheet") || contentType.includes("excel")) return "📊";
    if (contentType.includes("zip")) return "🗜️";
    return "📄";
  };

  const formatSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const isPreviewable = (type) => {
    return (
      type?.startsWith("image/") ||
      type === "application/pdf" ||
      type?.startsWith("text/")
    );
  };

  if (loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!files.length) {
    return activeTab === "shared" ? (
      <div className="empty">
        <div className="empty-icon">👥</div>
        <div className="empty-text">No shared files yet. Collaborate with others to see shared documents here.</div>
      </div>
    ) : (
      <div className="empty">
        <div className="empty-icon">🗂️</div>
        <div className="empty-text">No files yet. Upload your first document.</div>
      </div>
    );
  }

  return (
    <div className="file-grid">
      {files.map((f) => {
        const previewable = isPreviewable(f.content_type);
        return (
          <div className="file-card" key={f.id}>
            <div className="file-icon">{getFileIcon(f.content_type)}</div>
            <div className="file-info">
               <div className="file-name">
                  {previewable ? (
                  <a
                    href={`/api/preview/${f.id}`}
                    className="file-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Preview file"
                  >
                    {f.filename}
                  </a>
                ) : (
                  <button
                    className="file-link file-link-button"
                    onClick={() => onDownload(f.id, f.filename)}
                    title="Download file"
                  >
                    {f.filename}
                  </button>
                )}
              </div>
            <div className="file-meta">
              <span>{formatSize(f.size)}</span>
              <span>{formatDate(f.uploaded_at)}</span>
              {!f.is_own && <span>by {f.uploader}</span>}
              <span className={`badge ${f.is_public ? "badge-public" : "badge-private"}`}>
                {f.is_public ? "● public" : "○ private"}
              </span>
              {!f.is_own && <span className="badge badge-shared">shared</span>}
              {f.processed ? (
                <span className="badge badge-processed">✓ analysed</span>
              ) : (
                <span className="badge badge-pending">⏳ processing</span>
              )}
            </div>

            {(() => {
              const tags = f.tags ? JSON.parse(f.tags) : [];
              return tags.length > 0 ? (
                <div className="file-tags">
                  {tags.map((tag, i) => (
                    <span key={i} className="tag">{tag}</span>
                  ))}
                </div>
              ) : null;
            })()}

            {f.summary && (
              <div>
                <button
                  className="summary-toggle"
                  onClick={() => toggleSummary(f.id)}
                >
                  {expanded[f.id] ? "▲ Hide summary" : "▼ Show summary"}
                </button>
                {expanded[f.id] && (
                  <div className="file-summary">{f.summary}</div>
                )}
              </div>
            )}
          </div>

          <div className="file-actions">
            <button
              className="btn btn-ghost"
              onClick={() => onDownload(f.id, f.filename)}
              title="Download"
            >
              ↓
            </button>
            {f.is_own && (
              <button
                className="btn btn-danger"
                onClick={() => onDelete(f.id)}
                title="Delete"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
