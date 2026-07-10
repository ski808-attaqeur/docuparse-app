import { adminClient } from "./supabase/admin";
import {
  parseDocument,
  refineDocType,
  guessDocType,
  type ParseResult,
} from "./parse";
import { classifyDocument } from "./ai";
import { chunkPages } from "./chunk";
import type { DocumentRow, DocumentPage } from "./types";

/**
 * Persist a parsed document: classify → write pages (with word_boxes) → chunk
 * for search. Deterministic parts always run; AI classification applies only
 * when a key is present, else a filename/text heuristic. Storage is optional —
 * ingestion works even if the original bytes can't be stored, so the core is
 * fully functional without an elevated Supabase key.
 */
async function persistParsed(doc: DocumentRow, parsed: ParseResult): Promise<void> {
  const db = adminClient();
  const pages = parsed.pages;

  await logJob(doc.id, "parse", "done", 100);

  // Classify from first-page text.
  await logJob(doc.id, "classify", "running", 40);
  const firstText = pages[0]?.text_content ?? "";
  let docType = refineDocType(firstText, guessDocType(doc.filename, doc.mime_type));
  let docTypeSource = "heuristic";
  let docTypeConf = 0.72;
  const ai = await classifyDocument(firstText);
  if (ai) {
    docType = ai.doc_type;
    docTypeSource = "claude-haiku";
    docTypeConf = ai.confidence;
  }
  await logJob(doc.id, "classify", "done", 100);

  // Replace pages.
  await db.from("document_pages").delete().eq("document_id", doc.id);
  if (pages.length) {
    const rows = pages.map((p) => ({
      document_id: doc.id,
      page_number: p.page_number,
      text_content: p.text_content,
      ocr_used: p.ocr_used,
      width: p.width,
      height: p.height,
      word_boxes: p.word_boxes,
    }));
    const { error: pErr } = await db.from("document_pages").insert(rows);
    if (pErr) throw new Error(`Pages insert failed: ${pErr.message}`);
  }

  // Chunk + index (FTS always; embeddings optional/later).
  await logJob(doc.id, "index", "running", 60);
  await db.from("chunks").delete().eq("document_id", doc.id);
  const dbPages = pages.map(
    (p) => ({ ...p, id: "", document_id: doc.id, created_at: "" }) as unknown as DocumentPage,
  );
  const chunks = chunkPages(dbPages);
  if (chunks.length) {
    await db.from("chunks").insert(
      chunks.map((c) => ({
        document_id: doc.id,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        content: c.content,
        token_count: c.token_count,
        metadata: { filename: doc.filename },
      })),
    );
  }
  await logJob(doc.id, "index", "done", 100);

  await db
    .from("documents")
    .update({
      status: "done",
      doc_type: docType,
      doc_type_source: docTypeSource,
      doc_type_confidence: docTypeConf,
      page_count: pages.length,
      ocr_used: parsed.ocr_used,
      processed_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  await audit("document.processed", "document", doc.id, { pages: pages.length, docType });
}

/** Ingest freshly-uploaded bytes (parse happens here, at upload time). */
export async function ingestBuffer(
  doc: DocumentRow,
  buf: Buffer,
): Promise<void> {
  const db = adminClient();
  await db.from("documents").update({ status: "processing", error: null }).eq("id", doc.id);
  await logJob(doc.id, "parse", "running", 10);
  try {
    const parsed = await parseDocument(buf, doc.mime_type, doc.filename);
    await persistParsed(doc, parsed);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await db.from("documents").update({ status: "failed", error: msg }).eq("id", doc.id);
    await logJob(doc.id, "parse", "failed", 0, msg);
    throw e;
  }
}

/**
 * Reprocess an existing document. Re-downloads + re-parses from storage when
 * the original bytes are available, otherwise re-classifies and re-chunks from
 * the already-stored pages (retry from failed step, FR-30 / Sprint 2).
 */
export async function processDocument(documentId: string): Promise<void> {
  const db = adminClient();
  const { data: doc } = await db.from("documents").select("*").eq("id", documentId).single<DocumentRow>();
  if (!doc) throw new Error("Document not found");

  await db.from("documents").update({ status: "processing", error: null }).eq("id", documentId);
  try {
    if (doc.storage_path && !doc.storage_path.startsWith("demo/")) {
      const { data: blob, error } = await db.storage.from("documents").download(doc.storage_path);
      if (!error && blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        const parsed = await parseDocument(buf, doc.mime_type, doc.filename);
        await persistParsed(doc, parsed);
        return;
      }
    }
    // Fallback: re-chunk/reclassify from existing pages.
    const { data: pages } = await db
      .from("document_pages")
      .select("*")
      .eq("document_id", documentId)
      .order("page_number");
    const pageList = (pages ?? []) as DocumentPage[];
    await persistParsed(doc, {
      pages: pageList.map((p) => ({
        page_number: p.page_number,
        text_content: p.text_content ?? "",
        width: p.width ?? 612,
        height: p.height ?? 792,
        word_boxes: p.word_boxes ?? [],
        ocr_used: p.ocr_used,
      })),
      ocr_used: doc.ocr_used,
    });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await db.from("documents").update({ status: "failed", error: msg }).eq("id", documentId);
    throw e;
  }
}

async function logJob(
  documentId: string,
  type: string,
  status: string,
  progress: number,
  errorMsg?: string,
) {
  const db = adminClient();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("jobs")
    .select("id")
    .eq("document_id", documentId)
    .eq("type", type)
    .limit(1);
  const patch = {
    status,
    progress,
    error: errorMsg ?? null,
    ...(status === "running" ? { started_at: now } : {}),
    ...(status === "done" || status === "failed" ? { finished_at: now } : {}),
  };
  if (existing && existing.length) {
    await db.from("jobs").update(patch).eq("id", existing[0].id);
  } else {
    await db.from("jobs").insert({ document_id: documentId, type, ...patch });
  }
}

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Record<string, unknown>,
) {
  try {
    await adminClient().from("audit_log").insert({ action, entity, entity_id: entityId, metadata });
  } catch {
    /* audit failures never block the primary operation */
  }
}
