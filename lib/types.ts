// Shared domain types — mirror supabase/migrations/0001_init.sql

export type DocStatus = "queued" | "processing" | "done" | "failed";
export type ReviewStatus = "unreviewed" | "approved" | "flagged" | "overridden";
export type ExtractionStatus = "pending" | "approved" | "flagged";
export type DeliveryStatus = "pending" | "success" | "failed" | "retrying";

export interface WordBox {
  text: string;
  x: number; // normalized 0..1 (left)
  y: number; // normalized 0..1 (top)
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  i: number; // reading-order index on page
}

export interface DocumentRow {
  id: string;
  user_id: string | null;
  filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string | null;
  checksum: string | null;
  doc_type: string | null;
  doc_type_source: string | null;
  doc_type_confidence: number | null;
  doc_type_review_status: string | null;
  page_count: number | null;
  status: DocStatus;
  error: string | null;
  ocr_used: boolean;
  uploaded_at: string;
  processed_at: string | null;
  created_at: string;
}

export interface DocumentPage {
  id: string;
  document_id: string;
  page_number: number;
  text_content: string | null;
  ocr_used: boolean;
  width: number | null;
  height: number | null;
  word_boxes: WordBox[] | null;
  created_at: string;
}

export interface ExtractionSchema {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  json_schema: JSONSchema;
  is_builtin: boolean;
  created_at: string;
}

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchemaProp>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProp;
}

export interface JSONSchemaProp {
  type?: string | string[];
  format?: string;
  items?: JSONSchemaProp;
  properties?: Record<string, JSONSchemaProp>;
  additionalProperties?: boolean | JSONSchemaProp;
  description?: string;
}

export interface FieldMeta {
  confidence: number;
  page: number;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  source_text: string | null;
  source: "ai" | "human" | "heuristic";
  edited: boolean;
}

export interface ExtractionRow {
  id: string;
  user_id: string | null;
  document_id: string;
  schema_id: string;
  data: Record<string, unknown> | null;
  data_source: string | null;
  data_confidence: number | null;
  data_review_status: string | null;
  field_meta: Record<string, FieldMeta> | null;
  overall_confidence: number | null;
  model: string | null;
  status: ExtractionStatus;
  reviewed: boolean;
  reviewed_by: string | null;
  corrected_data: Record<string, unknown> | null;
  created_at: string;
}

export interface DestinationRow {
  id: string;
  user_id: string | null;
  name: string;
  type: "webhook" | "google_sheets" | "crm" | "erp";
  config: Record<string, unknown> | null;
  secret_ref: string | null;
  enabled: boolean;
  created_at: string;
}

export interface RoutingRule {
  id: string;
  user_id: string | null;
  doc_type: string;
  destination_id: string;
  auto_deliver_on_approve: boolean;
  created_at: string;
}

export interface DeliveryRow {
  id: string;
  user_id: string | null;
  extraction_id: string;
  destination_id: string;
  status: DeliveryStatus;
  attempts: number;
  idempotency_key: string | null;
  response_code: number | null;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  scope: "document" | "corpus";
  scope_document_id: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations: { document_id: string; page: number; filename?: string }[] | null;
  created_at: string;
}
