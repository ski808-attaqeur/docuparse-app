# Data Model

## documents
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable until lock-down |
| filename | text | original name |
| mime_type | text | detected server-side |
| file_size | bigint | bytes |
| storage_path | text | Supabase Storage key |
| checksum | text | sha256 for dedupe |
| doc_type | text | classified value |
| doc_type_source | text | AI field: model used |
| doc_type_confidence | numeric | AI field: 0–1 |
| doc_type_review_status | text | unreviewed / approved / overridden |
| page_count | int | |
| status | text | queued / processing / done / failed |
| error | text | reason if failed |
| ocr_used | bool | any page OCR'd |
| uploaded_at / processed_at | timestamptz | |

## document_pages
| Field | Type | Notes |
|---|---|---|
| document_id | uuid FK → documents (cascade) | |
| page_number | int | 1-based |
| text_content | text | native or OCR'd |
| ocr_used | bool | |
| width / height | int | rendered size for coord mapping |
| word_boxes | jsonb | [{text,x,y,w,h,i}] normalized 0–1 |
| tsv | tsvector generated | GIN index for FTS |

Unique: (document_id, page_number)

## extraction_schemas
id, user_id (null = built-in), name, description, json_schema (jsonb), is_builtin, created_at.

## extractions
| Field | Type | Notes |
|---|---|---|
| document_id | uuid FK (cascade) | |
| schema_id | uuid FK | |
| data | jsonb | AI extracted fields |
| data_source | text | AI field: model |
| data_confidence | numeric | AI field: overall 0–1 |
| data_review_status | text | unreviewed / approved / flagged |
| field_meta | jsonb | per-field: {confidence, page, bbox, source_text, source, edited} |
| overall_confidence | numeric | |
| model | text | |
| status | text | pending / approved / flagged |
| reviewed | bool | |
| reviewed_by | uuid | |
| corrected_data | jsonb | canonical after edits |

Index: (document_id, schema_id), (status)

## chunks
id, user_id, document_id FK (cascade), page_number, chunk_index, content, token_count, embedding vector(1024), metadata jsonb.  
HNSW index on embedding (cosine); index on document_id.

## chat_sessions
id, user_id, title, scope (document|corpus), scope_document_id FK nullable, created_at.

## chat_messages
id, user_id, session_id FK (cascade), role (user|assistant), content, citations jsonb [{document_id, page}], created_at.

## jobs
id, user_id, document_id FK (cascade), type (parse|ocr|extract|embed), status, progress int, error, started_at, finished_at, created_at.

## audit_log
id, user_id, action, entity, entity_id, metadata jsonb, created_at. Append-only.

## destinations
id, user_id, name, type (webhook|google_sheets|crm|erp), config jsonb (non-secret), secret_ref text, enabled bool, created_at.

## routing_rules
id, user_id, doc_type, destination_id FK, auto_deliver_on_approve bool, created_at.

## deliveries
id, user_id, extraction_id FK, destination_id FK, status (pending|success|failed|retrying), attempts int, idempotency_key, response_code, error, delivered_at, created_at.

## RLS
All tables: permissive v1 policies (select/all using true) for demo-first. Lock-down sprint replaces with `auth.uid() = user_id`.
