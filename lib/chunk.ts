import type { DocumentPage } from "./types";

export interface Chunk {
  page_number: number;
  chunk_index: number;
  content: string;
  token_count: number;
}

// Rough token estimate: ~4 chars/token.
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 512;
const OVERLAP_TOKENS = 64;

/** Chunk page text into overlapping windows for search/RAG indexing. */
export function chunkPages(pages: DocumentPage[]): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;
  const size = TARGET_TOKENS * CHARS_PER_TOKEN;
  const overlap = OVERLAP_TOKENS * CHARS_PER_TOKEN;
  for (const page of pages) {
    const text = (page.text_content ?? "").trim();
    if (!text) continue;
    if (text.length <= size) {
      chunks.push({
        page_number: page.page_number,
        chunk_index: idx++,
        content: text,
        token_count: Math.ceil(text.length / CHARS_PER_TOKEN),
      });
      continue;
    }
    for (let start = 0; start < text.length; start += size - overlap) {
      const slice = text.slice(start, start + size);
      if (!slice.trim()) continue;
      chunks.push({
        page_number: page.page_number,
        chunk_index: idx++,
        content: slice,
        token_count: Math.ceil(slice.length / CHARS_PER_TOKEN),
      });
      if (start + size >= text.length) break;
    }
  }
  return chunks;
}
