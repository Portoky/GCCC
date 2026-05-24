import { useState, useEffect } from "react";
import Upload from "./components/Upload";
import FileList from "./components/FileList";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("files");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser("anonymous"));
  }, []);

  const fetchFiles = () => {
    setLoading(true);
    fetch("/api/files")
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this file?")) return;
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    fetchFiles();
  };

  const handleDownload = (id) => {
    window.location.href = `/api/download/${id}`;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">DocVault</span>
          </div>
          <div className="user-pill">
            <span className="user-dot" />
            <span>{user || "..."}</span>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <h1 className="hero-title">
            Your documents,<br />
            <em>secured in the cloud.</em>
          </h1>
          <p className="hero-sub">
            Upload, manage and share files — powered by Azure.
          </p>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "files" ? "active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            My Files
          </button>
          <button
            className={`tab ${activeTab === "shared" ? "active" : ""}`}
            onClick={() => setActiveTab("shared")}
          >
            Shared Files
          </button>
          <button
            className={`tab ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            Upload
          </button>
        </div>

        <div className="content">
          {activeTab === "upload" ? (
            <Upload onUploaded={() => { fetchFiles(); setActiveTab("files"); }} />
          ) : activeTab === "shared" ? (
            <FileList
              files={files.filter(f => !f.is_own && f.is_public)}
              loading={loading}
              onDelete={handleDelete}
              onDownload={handleDownload}
            />
          ) : (
            <FileList
              files={files.filter(f => f.is_own)}
              loading={loading}
              onDelete={handleDelete}
              onDownload={handleDownload}
            />
          )}
        </div>
      </main>
    </div>
  );
}
