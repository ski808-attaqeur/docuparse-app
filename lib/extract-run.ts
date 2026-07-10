import { adminClient } from "./supabase/admin";
import { extractFields } from "./ai";
import { heuristicExtract, groundAiData, overallConfidence } from "./extract-heuristic";
import { audit } from "./pipeline";
import type { DocumentPage, ExtractionSchema, FieldMeta } from "./types";

/** Run a schema extraction against a document and persist an extraction row. */
export async function runExtraction(
  documentId: string,
  schemaId: string,
): Promise<string> {
  const db = adminClient();

  const { data: schema } = await db
    .from("extraction_schemas")
    .select("*")
    .eq("id", schemaId)
    .single<ExtractionSchema>();
  if (!schema) throw new Error("Schema not found");

  const { data: pages } = await db
    .from("document_pages")
    .select("*")
    .eq("document_id", documentId)
    .order("page_number");
  const pageList = (pages ?? []) as DocumentPage[];

  const documentText = pageList.map((p) => p.text_content ?? "").join("\n\n");

  let data: Record<string, unknown> = {};
  let field_meta: Record<string, FieldMeta> = {};
  let model = "heuristic-v1";
  let dataSource = "heuristic";

  const ai = await extractFields(schema.name, schema.json_schema as unknown as Record<string, unknown>, documentText);
  if (ai) {
    data = ai.data;
    field_meta = groundAiData(ai.data, pageList);
    model = ai.model;
    dataSource = "ai";
    // Fill any schema fields the model omitted using the heuristic pass.
    const h = heuristicExtract(schema.json_schema, pageList);
    for (const [k, v] of Object.entries(h.data)) {
      if (data[k] === undefined) {
        data[k] = v;
        field_meta[k] = h.field_meta[k];
      }
    }
  } else {
    const h = heuristicExtract(schema.json_schema, pageList);
    data = h.data;
    field_meta = h.field_meta;
  }

  const overall = overallConfidence(field_meta);

  const { data: inserted, error } = await db
    .from("extractions")
    .insert({
      document_id: documentId,
      schema_id: schemaId,
      data,
      data_source: dataSource,
      data_confidence: overall,
      data_review_status: "unreviewed",
      field_meta,
      overall_confidence: overall,
      model,
      status: "pending",
      reviewed: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Extraction insert failed: ${error.message}`);

  await audit("extraction.run", "extraction", inserted!.id, {
    document_id: documentId,
    schema_id: schemaId,
    model,
    overall_confidence: overall,
  });
  return inserted!.id as string;
}
