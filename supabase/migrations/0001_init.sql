create extension if not exists vector;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  filename text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  storage_path text,
  checksum text,
  doc_type text,
  doc_type_source text,
  doc_type_confidence numeric,
  doc_type_review_status text default 'unreviewed',
  page_count int,
  status text not null default 'queued',
  error text,
  ocr_used boolean not null default false,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table documents enable row level security;
drop policy if exists "documents_v1_read" on documents;
create policy "documents_v1_read" on documents for select using (true);
drop policy if exists "documents_v1_write" on documents;
create policy "documents_v1_write" on documents for all using (true) with check (true);

create table if not exists document_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  document_id uuid references documents(id) on delete cascade,
  page_number int not null,
  text_content text,
  ocr_used boolean not null default false,
  width int,
  height int,
  word_boxes jsonb,
  tsv tsvector generated always as (to_tsvector('english', coalesce(text_content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);
alter table document_pages enable row level security;
drop policy if exists "document_pages_v1_read" on document_pages;
create policy "document_pages_v1_read" on document_pages for select using (true);
drop policy if exists "document_pages_v1_write" on document_pages;
create policy "document_pages_v1_write" on document_pages for all using (true) with check (true);
create index if not exists document_pages_tsv_idx on document_pages using gin(tsv);

create table if not exists extraction_schemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  description text,
  json_schema jsonb not null,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table extraction_schemas enable row level security;
drop policy if exists "extraction_schemas_v1_read" on extraction_schemas;
create policy "extraction_schemas_v1_read" on extraction_schemas for select using (true);
drop policy if exists "extraction_schemas_v1_write" on extraction_schemas;
create policy "extraction_schemas_v1_write" on extraction_schemas for all using (true) with check (true);

create table if not exists extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  document_id uuid references documents(id) on delete cascade,
  schema_id uuid references extraction_schemas(id),
  data jsonb,
  data_source text,
  data_confidence numeric,
  data_review_status text default 'unreviewed',
  field_meta jsonb,
  overall_confidence numeric,
  model text,
  status text not null default 'pending',
  reviewed boolean not null default false,
  reviewed_by uuid,
  corrected_data jsonb,
  created_at timestamptz not null default now()
);
alter table extractions enable row level security;
drop policy if exists "extractions_v1_read" on extractions;
create policy "extractions_v1_read" on extractions for select using (true);
drop policy if exists "extractions_v1_write" on extractions;
create policy "extractions_v1_write" on extractions for all using (true) with check (true);
create index if not exists extractions_document_schema_idx on extractions(document_id, schema_id);
create index if not exists extractions_status_idx on extractions(status);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  document_id uuid references documents(id) on delete cascade,
  page_number int not null,
  chunk_index int not null,
  content text not null,
  token_count int,
  embedding vector(1024),
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table chunks enable row level security;
drop policy if exists "chunks_v1_read" on chunks;
create policy "chunks_v1_read" on chunks for select using (true);
drop policy if exists "chunks_v1_write" on chunks;
create policy "chunks_v1_write" on chunks for all using (true) with check (true);
create index if not exists chunks_document_idx on chunks(document_id);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  scope text not null default 'corpus',
  scope_document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table chat_sessions enable row level security;
drop policy if exists "chat_sessions_v1_read" on chat_sessions;
create policy "chat_sessions_v1_read" on chat_sessions for select using (true);
drop policy if exists "chat_sessions_v1_write" on chat_sessions;
create policy "chat_sessions_v1_write" on chat_sessions for all using (true) with check (true);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
alter table chat_messages enable row level security;
drop policy if exists "chat_messages_v1_read" on chat_messages;
create policy "chat_messages_v1_read" on chat_messages for select using (true);
drop policy if exists "chat_messages_v1_write" on chat_messages;
create policy "chat_messages_v1_write" on chat_messages for all using (true) with check (true);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  document_id uuid references documents(id) on delete cascade,
  type text not null,
  status text not null default 'queued',
  progress int not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
alter table jobs enable row level security;
drop policy if exists "jobs_v1_read" on jobs;
create policy "jobs_v1_read" on jobs for select using (true);
drop policy if exists "jobs_v1_write" on jobs;
create policy "jobs_v1_write" on jobs for all using (true) with check (true);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table audit_log enable row level security;
drop policy if exists "audit_log_v1_read" on audit_log;
create policy "audit_log_v1_read" on audit_log for select using (true);
drop policy if exists "audit_log_v1_write" on audit_log;
create policy "audit_log_v1_write" on audit_log for all using (true) with check (true);

create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  type text not null,
  config jsonb,
  secret_ref text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table destinations enable row level security;
drop policy if exists "destinations_v1_read" on destinations;
create policy "destinations_v1_read" on destinations for select using (true);
drop policy if exists "destinations_v1_write" on destinations;
create policy "destinations_v1_write" on destinations for all using (true) with check (true);

create table if not exists routing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  doc_type text not null,
  destination_id uuid references destinations(id) on delete cascade,
  auto_deliver_on_approve boolean not null default false,
  created_at timestamptz not null default now()
);
alter table routing_rules enable row level security;
drop policy if exists "routing_rules_v1_read" on routing_rules;
create policy "routing_rules_v1_read" on routing_rules for select using (true);
drop policy if exists "routing_rules_v1_write" on routing_rules;
create policy "routing_rules_v1_write" on routing_rules for all using (true) with check (true);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  extraction_id uuid references extractions(id) on delete cascade,
  destination_id uuid references destinations(id),
  status text not null default 'pending',
  attempts int not null default 0,
  idempotency_key text,
  response_code int,
  error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table deliveries enable row level security;
drop policy if exists "deliveries_v1_read" on deliveries;
create policy "deliveries_v1_read" on deliveries for select using (true);
drop policy if exists "deliveries_v1_write" on deliveries;
create policy "deliveries_v1_write" on deliveries for all using (true) with check (true);
create index if not exists deliveries_extraction_idx on deliveries(extraction_id);
create index if not exists deliveries_status_idx on deliveries(status);

insert into extraction_schemas (id, name, description, json_schema, is_builtin) values
  (gen_random_uuid(), 'Invoice v1', 'Standard vendor invoice fields', '{"type":"object","properties":{"vendor":{"type":"string"},"invoice_number":{"type":"string"},"invoice_date":{"type":"string","format":"date"},"due_date":{"type":"string","format":"date"},"total":{"type":"number"},"subtotal":{"type":"number"},"tax":{"type":"number"},"line_items":{"type":"array","items":{"type":"object","properties":{"description":{"type":"string"},"quantity":{"type":"number"},"unit_price":{"type":"number"},"amount":{"type":"number"}}}}},"required":["vendor","total"]}', true),
  (gen_random_uuid(), 'Receipt v1', 'Point-of-sale receipt fields', '{"type":"object","properties":{"merchant":{"type":"string"},"date":{"type":"string","format":"date"},"total":{"type":"number"},"tax":{"type":"number"},"payment_method":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"number"}}}}},"required":["merchant","total"]}', true),
  (gen_random_uuid(), 'Generic Key-Values', 'Extract any key-value pairs from any document', '{"type":"object","properties":{"title":{"type":"string"},"date":{"type":"string"},"parties":{"type":"array","items":{"type":"string"}},"key_values":{"type":"object","additionalProperties":{"type":"string"}}},"required":[]}', true)
on conflict do nothing;

insert into documents (id, filename, mime_type, file_size, storage_path, checksum, doc_type, doc_type_source, doc_type_confidence, doc_type_review_status, page_count, status, ocr_used, uploaded_at, processed_at) values
  (gen_random_uuid(), 'invoice_acme_may2026.pdf', 'application/pdf', 184320, 'demo/invoice_acme_may2026.pdf', 'abc123demo01', 'invoice', 'claude-haiku', 0.97, 'unreviewed', 2, 'done', false, now() - interval '2 days', now() - interval '2 days' + interval '12 seconds'),
  (gen_random_uuid(), 'scan_receipt_coffee.jpg', 'image/jpeg', 512000, 'demo/scan_receipt_coffee.jpg', 'abc123demo02', 'receipt', 'claude-haiku', 0.91, 'unreviewed', 1, 'done', true, now() - interval '1 day', now() - interval '1 day' + interval '28 seconds'),
  (gen_random_uuid(), 'q1_2026_report.pdf', 'application/pdf', 2097152, 'demo/q1_2026_report.pdf', 'abc123demo03', 'report', 'claude-haiku', 0.88, 'unreviewed', 14, 'done', false, now() - interval '3 days', now() - interval '3 days' + interval '45 seconds'),
  (gen_random_uuid(), 'vendor_contract_draft.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 98304, 'demo/vendor_contract_draft.docx', 'abc123demo04', 'contract', 'claude-haiku', 0.85, 'unreviewed', 8, 'done', false, now() - interval '4 days', now() - interval '4 days' + interval '9 seconds'),
  (gen_random_uuid(), 'expenses_march.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 45056, 'demo/expenses_march.xlsx', 'abc123demo05', 'spreadsheet', 'claude-haiku', 0.79, 'unreviewed', 1, 'done', false, now() - interval '5 days', now() - interval '5 days' + interval '6 seconds');

insert into extractions (id, document_id, schema_id, data, data_source, data_confidence, data_review_status, field_meta, overall_confidence, model, status, reviewed, corrected_data)
select
  gen_random_uuid(),
  d.id,
  s.id,
  '{"vendor":"Acme Corp","invoice_number":"INV-0042","invoice_date":"2026-05-01","due_date":"2026-05-31","total":5230.00,"subtotal":4800.00,"tax":430.00,"line_items":[{"description":"Widget A","quantity":20,"unit_price":150.00,"amount":3000.00},{"description":"Widget B","quantity":12,"unit_price":150.00,"amount":1800.00}]}',
  'claude-sonnet-5',
  0.91,
  'unreviewed',
  '{"vendor":{"confidence":0.97,"page":1,"source_text":"ACME CORP","source":"ai","edited":false},"invoice_number":{"confidence":0.95,"page":1,"source_text":"INV-0042","source":"ai","edited":false},"total":{"confidence":0.72,"page":1,"source_text":"$5,230.00","source":"ai","edited":false},"invoice_date":{"confidence":0.88,"page":1,"source_text":"May 1, 2026","source":"ai","edited":false}}',
  0.91,
  'claude-sonnet-5',
  'pending',
  false,
  null
from documents d, extraction_schemas s
where d.filename = 'invoice_acme_may2026.pdf' and s.name = 'Invoice v1'
limit 1;

insert into destinations (id, name, type, config, enabled) values
  (gen_random_uuid(), 'Invoices → Google Sheet', 'google_sheets', '{"sheet_id":"demo_sheet_id_1","tab":"Invoices","column_map":{"vendor":"A","invoice_date":"B","total":"C","invoice_number":"D"}}', true),
  (gen_random_uuid(), 'All Approvals Webhook', 'webhook', '{"url":"https://hooks.example.com/docuparse","method":"POST"}', true)
on conflict do nothing;