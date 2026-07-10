"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow, ExtractionSchema } from "@/lib/types";
import { StatusBadge, ConfidenceBadge } from "./Badges";
import { UploadModal } from "./UploadModal";
import { humanSize, timeAgo, docTypeEmoji } from "@/lib/format";

type Filter = "all" | "needs_review" | "failed";

export function Library({
  initialDocs,
  schemas,
}: {
  initialDocs: DocumentRow[];
  schemas: ExtractionSchema[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [showUpload, setShowUpload] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  async function refresh() {
    const res = await fetch("/api/documents", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setDocs(json.documents ?? []);
    }
    router.refresh();
  }

  // Poll while any document is still processing.
  useEffect(() => {
    const anyProcessing = docs.some((d) => d.status === "processing" || d.status === "queued");
    if (!anyProcessing) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  async function seed() {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    await refresh();
    setSeeding(false);
  }

  const filtered = useMemo(() => {
    if (filter === "failed") return docs.filter((d) => d.status === "failed");
    if (filter === "needs_review") return docs.filter((d) => d.status === "done");
    return docs;
  }, [docs, filter]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Document Library</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {docs.length} document{docs.length === 1 ? "" : "s"} · upload, extract, verify, approve
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {docs.length === 0 && (
            <button className="btn" onClick={seed} disabled={seeding}>
              {seeding ? "Loading…" : "Load demo data"}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            ⬆️ Upload
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["all", "needs_review", "failed"] as Filter[]).map((f) => (
          <button
            key={f}
            className="btn btn-sm"
            onClick={() => setFilter(f)}
            style={f === filter ? { borderColor: "var(--brand)", color: "var(--brand)" } : {}}
          >
            {f === "all" ? "All" : f === "needs_review" ? "Needs review" : "Failed"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasDocs={docs.length > 0} onSeed={seed} onUpload={() => setShowUpload(true)} seeding={seeding} />
      ) : (
        <div className="panel" style={{ overflow: "hidden" }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Status</th>
                <th>Classification</th>
                <th className="num">Pages</th>
                <th className="num">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/documents/${d.id}`)}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{docTypeEmoji(d.doc_type)}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.filename}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {humanSize(d.file_size)}
                          {d.ocr_used ? " · OCR" : ""}
                          {d.error ? ` · ${d.error}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{d.doc_type ?? "—"}</span>
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>{d.doc_type_confidence != null ? <ConfidenceBadge value={d.doc_type_confidence} /> : <span className="muted">—</span>}</td>
                  <td className="num">{d.page_count ?? "—"}</td>
                  <td className="num muted" style={{ fontSize: 12 }}>
                    {timeAgo(d.uploaded_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadModal
          schemas={schemas}
          onClose={() => setShowUpload(false)}
          onDone={async () => {
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({
  hasDocs,
  onSeed,
  onUpload,
  seeding,
}: {
  hasDocs: boolean;
  onSeed: () => void;
  onUpload: () => void;
  seeding: boolean;
}) {
  return (
    <div className="panel" style={{ padding: "56px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>📄</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginTop: 10 }}>
        {hasDocs ? "Nothing here" : "Your library is empty"}
      </h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 420, margin: "4px auto 0" }}>
        {hasDocs
          ? "No documents match this filter."
          : "Upload an invoice, receipt, contract or spreadsheet to extract structured data — or load the demo corpus to explore."}
      </p>
      {!hasDocs && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="btn" onClick={onSeed} disabled={seeding}>
            {seeding ? "Loading…" : "Load demo data"}
          </button>
          <button className="btn btn-primary" onClick={onUpload}>
            ⬆️ Upload a document
          </button>
        </div>
      )}
    </div>
  );
}
