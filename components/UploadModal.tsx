"use client";
import { useCallback, useRef, useState } from "react";
import type { ExtractionSchema } from "@/lib/types";

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  message?: string;
  documentId?: string;
}

export function UploadModal({
  schemas,
  onClose,
  onDone,
}: {
  schemas: ExtractionSchema[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [schemaId, setSchemaId] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    setItems((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({ file, status: "pending" as const })),
    ]);
  }, []);

  async function startUpload() {
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done") continue;
      await uploadOne(i);
    }
    setBusy(false);
    onDone();
  }

  async function uploadOne(index: number) {
    setItems((p) => p.map((it, i) => (i === index ? { ...it, status: "uploading" } : it)));
    const it = items[index];
    try {
      const fd = new FormData();
      fd.append("file", it.file);
      if (schemaId) fd.append("schema_id", schemaId);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      const documentId = json.document.id;
      if (json.duplicate) {
        setItems((p) =>
          p.map((x, i) => (i === index ? { ...x, status: "done", message: "Duplicate — skipped", documentId } : x)),
        );
        return;
      }
      // POST /api/documents parses + indexes synchronously; the returned doc is ready.
      const failed = json.document?.status === "failed";
      setItems((p) =>
        p.map((x, i) =>
          i === index
            ? {
                ...x,
                status: failed ? "error" : "done",
                message: failed ? json.document?.error : undefined,
                documentId,
              }
            : x,
        ),
      );
    } catch (e) {
      setItems((p) =>
        p.map((x, i) => (i === index ? { ...x, status: "error", message: (e as Error).message } : x)),
      );
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "100%", padding: 20, maxHeight: "90vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Upload documents</h2>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={onClose}>
            Close
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--brand)" : "var(--border)"}`,
            borderRadius: 12,
            padding: "28px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: dragging ? "var(--panel-2)" : "transparent",
          }}
        >
          <div style={{ fontSize: 28 }}>⬆️</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>Drop files here or click to browse</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            PDF, DOCX, XLSX, PNG, JPG, TXT · up to 50 MB
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.tif,.tiff,.txt,.csv"
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            Extraction schema (optional — runs automatically after processing)
          </label>
          <select className="input" value={schemaId} onChange={(e) => setSchemaId(e.target.value)} style={{ marginTop: 4 }}>
            <option value="">Don&apos;t extract yet</option>
            {schemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {items.length > 0 && (
          <ul style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it, i) => (
              <li
                key={i}
                className="card"
                style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.file.name}
                </span>
                <StatusPill item={it} />
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy || items.length === 0} onClick={startUpload}>
            {busy ? "Uploading…" : `Upload ${items.length || ""}`}
          </button>
          {items.some((i) => i.status === "done") && (
            <button className="btn" onClick={onDone}>
              Refresh library
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ item }: { item: UploadItem }) {
  if (item.status === "done")
    return (
      <a className="badge conf-high" href={item.documentId ? `/documents/${item.documentId}` : "#"}>
        ✓ {item.message ?? "Ready"}
      </a>
    );
  if (item.status === "error") return <span className="badge conf-low" title={item.message}>Failed</span>;
  if (item.status === "uploading") return <span className="badge conf-review pulsing">Uploading…</span>;
  if (item.status === "processing") return <span className="badge conf-review pulsing">Processing…</span>;
  return <span className="badge">Ready</span>;
}
