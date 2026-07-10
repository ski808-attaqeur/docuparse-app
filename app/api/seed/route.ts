import { NextResponse } from "next/server";
import { adminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";
import { DEMO_DOCS } from "@/lib/demo";
import { layoutTextToPage } from "@/lib/parse";
import { chunkPages } from "@/lib/chunk";
import type { DocumentPage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotently ensure the demo corpus is fully usable: demo documents exist
 * (matching the SQL seed), each has document_pages with word_boxes + chunks,
 * built-in schemas are present, and a sample invoice extraction exists. Safe to
 * call repeatedly — it fills gaps rather than duplicating.
 */
export async function POST() {
  const db = adminClient();
  const result: Record<string, unknown> = {};

  // Ensure a storage bucket exists (best-effort; needs elevated key).
  try {
    await db.storage.createBucket(STORAGE_BUCKET, { public: false });
  } catch {
    /* already exists or insufficient privileges — non-fatal */
  }

  // Ensure built-in schemas.
  const { data: schemas } = await db.from("extraction_schemas").select("id,name");
  const haveSchema = new Set((schemas ?? []).map((s) => s.name));
  const builtins = [
    {
      name: "Invoice v1",
      description: "Standard vendor invoice fields",
      json_schema: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          invoice_number: { type: "string" },
          invoice_date: { type: "string", format: "date" },
          due_date: { type: "string", format: "date" },
          total: { type: "number" },
          subtotal: { type: "number" },
          tax: { type: "number" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                amount: { type: "number" },
              },
            },
          },
        },
        required: ["vendor", "total"],
      },
    },
    {
      name: "Receipt v1",
      description: "Point-of-sale receipt fields",
      json_schema: {
        type: "object",
        properties: {
          merchant: { type: "string" },
          date: { type: "string", format: "date" },
          total: { type: "number" },
          tax: { type: "number" },
          payment_method: { type: "string" },
          items: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, price: { type: "number" } } },
          },
        },
        required: ["merchant", "total"],
      },
    },
    {
      name: "Generic Key-Values",
      description: "Extract any key-value pairs from any document",
      json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          parties: { type: "array", items: { type: "string" } },
          key_values: { type: "object", additionalProperties: { type: "string" } },
        },
        required: [],
      },
    },
  ];
  for (const b of builtins) {
    if (!haveSchema.has(b.name)) {
      await db.from("extraction_schemas").insert({ ...b, is_builtin: true });
    }
  }

  // Ensure demo documents + pages + chunks.
  let docsCreated = 0;
  let pagesCreated = 0;
  for (const demo of DEMO_DOCS) {
    let { data: existing } = await db
      .from("documents")
      .select("id,page_count")
      .eq("filename", demo.filename)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: inserted } = await db
        .from("documents")
        .insert({
          filename: demo.filename,
          mime_type: demo.mime_type,
          file_size: demo.file_size,
          storage_path: `demo/${demo.filename}`,
          checksum: `demo-${demo.filename}`,
          doc_type: demo.doc_type,
          doc_type_source: "claude-haiku",
          doc_type_confidence: demo.doc_type_confidence,
          doc_type_review_status: "unreviewed",
          page_count: demo.pages.length,
          status: "done",
          ocr_used: demo.ocr_used,
          processed_at: new Date().toISOString(),
        })
        .select("id,page_count")
        .single();
      existing = inserted;
      docsCreated++;
    }
    if (!existing) continue;

    // Ensure pages.
    const { count } = await db
      .from("document_pages")
      .select("id", { count: "exact", head: true })
      .eq("document_id", existing.id);
    if (!count) {
      const pageRows = demo.pages.map((text, i) => {
        const layout = layoutTextToPage(text, i + 1);
        return {
          document_id: existing!.id,
          page_number: layout.page_number,
          text_content: layout.text_content,
          ocr_used: demo.ocr_used,
          width: layout.width,
          height: layout.height,
          word_boxes: layout.word_boxes,
        };
      });
      await db.from("document_pages").insert(pageRows);
      pagesCreated += pageRows.length;

      // Ensure chunks for search.
      const dbPages = demo.pages.map(
        (text, i) => ({ ...layoutTextToPage(text, i + 1), id: "", document_id: existing!.id, created_at: "" }) as unknown as DocumentPage,
      );
      const chunks = chunkPages(dbPages);
      if (chunks.length) {
        await db.from("chunks").insert(
          chunks.map((c) => ({
            document_id: existing!.id,
            page_number: c.page_number,
            chunk_index: c.chunk_index,
            content: c.content,
            token_count: c.token_count,
            metadata: { filename: demo.filename },
          })),
        );
      }
    }
  }

  // Ensure destinations exist (for the delivery demo).
  const { count: destCount } = await db
    .from("destinations")
    .select("id", { count: "exact", head: true });
  if (!destCount) {
    await db.from("destinations").insert([
      {
        name: "Invoices → Google Sheet",
        type: "google_sheets",
        config: { sheet_id: "demo_sheet_id_1", tab: "Invoices", column_map: { vendor: "A", invoice_date: "B", total: "C", invoice_number: "D" } },
        enabled: true,
      },
      {
        name: "All Approvals Webhook",
        type: "webhook",
        config: { url: "https://webhook.site/demo-docuparse", method: "POST" },
        enabled: true,
      },
    ]);
  }

  result.docsCreated = docsCreated;
  result.pagesCreated = pagesCreated;
  result.ok = true;
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ hint: "POST to seed demo data" });
}
