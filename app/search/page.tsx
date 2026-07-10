"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  document_id: string;
  filename: string;
  doc_type: string | null;
  page: number;
  snippet: string;
  score: number;
}
interface Citation {
  document_id: string;
  page: number;
  filename: string;
}

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[]; ai: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setHits(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setHits(json.hits ?? []);
    setSearching(false);
  }

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, scope: "corpus" }),
    });
    const json = await res.json();
    setAnswer({ text: json.answer, citations: json.citations ?? [], ai: json.ai });
    setAsking(false);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Search &amp; Ask</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Find documents by keyword or meaning, and ask questions answered with citations.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="sa-split">
        {/* Search */}
        <div className="panel" style={{ padding: 16 }}>
          <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              className="input"
              placeholder='e.g. "Acme invoice" or "widget"'
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn btn-primary" disabled={searching}>{searching ? "…" : "Search"}</button>
          </form>
          {hits === null ? (
            <p className="muted" style={{ fontSize: 13 }}>Enter a query to search the corpus.</p>
          ) : hits.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No results found. Try different keywords.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {hits.map((h, i) => (
                <div
                  key={i}
                  className="card"
                  style={{ padding: 12, cursor: "pointer" }}
                  onClick={() => router.push(`/documents/${h.document_id}`)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{h.filename}</strong>
                    <span className="badge">{h.doc_type ?? "doc"}</span>
                    <span className="badge">page {h.page}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{h.snippet}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ask */}
        <div className="panel" style={{ padding: 16 }}>
          <form onSubmit={ask} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              className="input"
              placeholder='Ask: "what is the total on the Acme invoice?"'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button className="btn btn-primary" disabled={asking}>{asking ? "…" : "Ask"}</button>
          </form>
          {answer === null ? (
            <p className="muted" style={{ fontSize: 13 }}>Ask a question across all documents. Answers cite their source page.</p>
          ) : (
            <div>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{answer.text}</p>
              {answer.citations.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  {answer.citations.map((c, i) => (
                    <button
                      key={i}
                      className="badge"
                      style={{ cursor: "pointer" }}
                      onClick={() => router.push(`/documents/${c.document_id}`)}
                    >
                      📄 {c.filename} · p{c.page}
                    </button>
                  ))}
                </div>
              )}
              {!answer.ai && (
                <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                  Extractive answer (AI key not configured) — shows the best matching passage.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .sa-split{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
