import { adminClient } from "./supabase/admin";

export interface Hit {
  document_id: string;
  filename: string;
  doc_type: string | null;
  page: number;
  snippet: string;
  score: number;
}

function snippet(text: string, query: string): string {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  let idx = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i >= 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return text.slice(0, 180).trim();
  const start = Math.max(0, idx - 70);
  return (start > 0 ? "…" : "") + text.slice(start, start + 200).trim() + "…";
}

function scoreText(text: string, query: string): number {
  const lower = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  let hits = 0;
  for (const w of words) {
    const matches = lower.split(w).length - 1;
    hits += matches;
  }
  return hits / Math.sqrt(text.length + 1);
}

/**
 * Hybrid retrieval over document pages. Uses Postgres full-text search when
 * available and falls back to ILIKE keyword matching, then re-ranks by term
 * frequency. Embeddings/semantic ranking are layered in later; the deterministic
 * path keeps search working with AI off (FR-14).
 */
export async function retrieve(
  query: string,
  opts: { documentId?: string; limit?: number } = {},
): Promise<Hit[]> {
  const db = adminClient();
  const limit = opts.limit ?? 20;

  interface Row {
    document_id: string;
    page_number: number;
    text_content: string | null;
    documents: { filename: string; doc_type: string | null } | { filename: string; doc_type: string | null }[] | null;
  }
  let rows: Row[] = [];

  // Attempt FTS on the generated tsv column.
  try {
    let q = db
      .from("document_pages")
      .select("document_id,page_number,text_content,documents(filename,doc_type)")
      .textSearch("tsv", query, { type: "websearch" })
      .limit(50);
    if (opts.documentId) q = q.eq("document_id", opts.documentId);
    const { data, error } = await q;
    if (!error && data) rows = data as unknown as Row[];
  } catch {
    /* fall through to ILIKE */
  }

  // Fallback: keyword ILIKE across page text.
  if (!rows.length) {
    const term = query.split(/\s+/).filter((w) => w.length > 2)[0] ?? query;
    let q = db
      .from("document_pages")
      .select("document_id,page_number,text_content,documents(filename,doc_type)")
      .ilike("text_content", `%${term}%`)
      .limit(50);
    if (opts.documentId) q = q.eq("document_id", opts.documentId);
    const { data } = await q;
    rows = (data as unknown as Row[]) ?? [];
  }

  const hits: Hit[] = rows
    .filter((r) => r.text_content)
    .map((r) => {
      const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
      return {
        document_id: r.document_id,
        filename: doc?.filename ?? "document",
        doc_type: doc?.doc_type ?? null,
        page: r.page_number,
        snippet: snippet(r.text_content ?? "", query),
        score: scoreText(r.text_content ?? "", query),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return hits;
}
