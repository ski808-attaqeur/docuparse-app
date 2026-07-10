# Tasks & Sprints

## Sprint 1 — Database, storage, demo seed
**Goal:** library page renders with realistic demo documents, no login required.
- [ ] Run migration SQL: all domain tables, permissive v1 RLS policies, pgvector extension
- [ ] Seed 5 demo documents (invoice, receipt, report, contract, spreadsheet) + 1 extraction with field_meta
- [ ] Seed 3 built-in extraction schemas (Invoice v1, Receipt v1, Generic Key-Values)
- [ ] Supabase Storage bucket created; demo files referenced in storage_path
- [ ] Frontend document library page: list view with filename, type badge, status badge, page count, date
- [ ] Empty state: first-run message + upload CTA when no documents exist

**Definition of Done:** `http://localhost:3000` shows the demo document library without any login prompt; all 5 documents visible with correct status badges.

---

## Sprint 2 — Upload + async processing pipeline ★ core engine
**Goal:** real file upload flows through the full pipeline end-to-end.
- [ ] FastAPI `POST /documents` multipart → Supabase Storage → `documents` row (status=queued)
- [ ] BackgroundTask: detect MIME (python-magic), Haiku classify doc_type, PyMuPDF/docx/openpyxl text extract, Tesseract OCR fallback, word_boxes normalized 0–1 written to `document_pages`
- [ ] Chunk text (512 tokens, 64 overlap), embed via Voyage AI, write `chunks` + HNSW index, populate `tsvector`
- [ ] `status=done`; `GET /documents/{id}/status` for polling
- [ ] Frontend stepper: Upload → Classify → OCR/Parse → Extract → Index — each step turns green on completion; failed step shows retry button
- [ ] `POST /documents/{id}/reprocess` retries from failed step
- [ ] Upload modal: drag-and-drop zone, file list with per-file progress, optional schema pre-select
- [ ] Error states: unsupported type (400), oversized (413), corrupt/zero-byte (doc marked failed with reason)
- [ ] Checksum dedupe: identical file re-upload skips processing

**Definition of Done:** upload a real multi-page invoice PDF, watch all stepper steps turn green, confirm `document_pages` rows in Supabase with non-empty `text_content`.

---

## Sprint 3 — Structured extraction + review workspace ★ v1 functional milestone
**Goal:** extract fields from a document, review side-by-side, correct, approve — all persisted.
- [ ] `POST /documents/{id}/extract {schema_id}` → Sonnet tool-use against schema → field values + source_text per field → ground to word_boxes → write `extractions` row with `field_meta`
- [ ] `GET /documents/{id}/extractions` + `GET /extractions/{id}`
- [ ] `PATCH /extractions/{id}` — save corrections (`source:human`, `edited:true`), approve/flag status transition
- [ ] Split-screen review UI: pdf.js source pane left + grouped fields right (Header / Line Items / Summary sections)
- [ ] Confidence badges 🟢/🟡/🔴 + ⚠ flag on low-confidence fields; "Next flagged" control
- [ ] Direct click-to-edit any field; line-item table with add/remove row, right-aligned numbers
- [ ] Classification badge shown + override dropdown (re-runs schema)
- [ ] Approve / Reject-Flag buttons; edit summary shows AI value → human correction per changed field
- [ ] Progress stepper for extraction phase; empty extraction state with reclassify option
- [ ] `GET /documents/{id}/export?format=json|csv` and `GET /documents/{id}/export?format=csv`
- [ ] `DELETE /documents/{id}` cascades pages, chunks, extractions

**Definition of Done (v1 success scenario):** upload invoice PDF → pipeline completes → run Invoice v1 extraction → split-screen shows fields with confidence → correct one wrong field → approve → reload page → corrected_data is canonical → export as CSV downloads a parseable file with correct values.

---

## Sprint 4 — Search and Q&A
**Goal:** find documents by keyword and meaning; ask questions with cited answers.
- [ ] `GET /search?q=…&mode=hybrid` — combine tsvector FTS + pgvector cosine, return ranked hits with doc/page/snippet/score
- [ ] `POST /chat/sessions` + `POST /chat/sessions/{id}/messages` — RAG: retrieve chunks, assemble context, Sonnet answer + citations
- [ ] Single-doc scope (session tied to one document) and corpus scope (all documents)
- [ ] Streaming SSE for Q&A token output
- [ ] Frontend: search results page with ranked cards, clickable to open document at cited page
- [ ] Chat UI: session list, message thread, citation chips that scroll to source page
- [ ] Empty state: no results message (not an error); unanswerable question returns "not found in documents"

**Definition of Done:** ask "what is the total on the Acme invoice?" → answer cites invoice_acme_may2026.pdf page 1 → clicking citation scrolls PDF to that page.

---

## Sprint 5 — Bounding-box overlays + click-to-extract
**Goal:** split-screen panes linked bidirectionally via visual highlights.
- [ ] Frontend overlay layer: absolute-positioned `<div>` rects over pdf.js canvas, driven by `field_meta[field].bbox` in normalized coords; zoom/pan safe
- [ ] Click field on right → source scrolls + zooms to bbox, rect highlighted
- [ ] Click/hover bbox on source → matching field focused on right
- [ ] Fields with no bbox → "no source location" label; **no fake rectangle drawn**
- [ ] Click-to-extract: drag region on source → collect word_boxes inside region → type-coerce to field type → PATCH extraction with user-set bbox
- [ ] `GET /documents/{id}/pages/{n}/layout` returns word_boxes for page n

**Definition of Done:** click Invoice # field → source scrolls to and highlights "INV-0042"; drag over Total amount → focused field populates with "5230.00"; zoom to 200% and bounding boxes stay aligned.

---

## Sprint 6 — Integrations + approve-to-deliver
**Goal:** approving a document automatically pushes data to a configured destination.
- [ ] CRUD: `POST/GET/PUT/DELETE /destinations` and `POST/GET /routing-rules`
- [ ] On `PATCH /extractions/{id}` status=approved: look up routing rules → if auto_deliver_on_approve → enqueue delivery (idempotency_key)
- [ ] Delivery worker: sign payload HMAC, POST to destination, write `deliveries` row
- [ ] Retry with exponential backoff (3 attempts max); delivery stays `retrying` between attempts; `failed` after exhaustion
- [ ] `GET /extractions/{id}/deliveries` + manual `POST /extractions/{id}/deliver`
- [ ] `GET /extractions/{id}/changes` — field-level AI-vs-human diff
- [ ] Frontend: destinations settings page; delivery status badge on extraction; retry button on failure
- [ ] Security: never deliver to a URL from document content; HMAC key via secret_ref only

**Definition of Done:** configure a webhook URL → approve the Acme invoice → within 5 s the webhook receives a signed payload with vendor, total, invoice_date → delivery shows "success" in UI.

---

## Sprint 7 — Polish, error states, keyboard review
**Goal:** every state handled; review loop usable without a mouse.
- [ ] All empty/error states implemented: empty library, failed parse + retry, nothing extracted, no search results, empty queue, failed delivery + retry
- [ ] Review queue: `GET /documents?status=needs_review` filter; bulk approve/export
- [ ] Keyboard shortcuts: Tab next field, F next flagged, E edit, A approve, R reject, N next document, ← → page
- [ ] Responsive: below breakpoint, split-screen collapses to Source/Data tabs with tap-to-jump
- [ ] Custom schema builder UI: create schema with name + typed fields
- [ ] `POST /destinations/{id}/test` — send test payload
- [ ] a11y: focus management, ARIA labels on all controls, screen-reader-friendly confidence cues

**Definition of Done:** complete a full invoice review — open flagged document, jump to next flagged field (F), correct it (E), approve (A), open next document (N) — using keyboard only, zero mouse clicks.

---

## Sprint 8 — Lock it down (auth + per-user RLS)
**Goal:** real users can log in; data is owner-scoped.
- [ ] Supabase Auth: email/password + magic link; login and logout pages
- [ ] Replace all v1 permissive RLS policies with `auth.uid() = user_id` write policies; read policies scoped to owner
- [ ] user_id stamped on all new rows from auth context
- [ ] Demo documents remain accessible to authenticated admin user
- [ ] Anonymous visitors see demo library (read-only); upload / extract / approve require login
- [ ] Session token propagated to FastAPI via Supabase JWT verification

**Definition of Done:** logged-out visitor sees demo library but upload button redirects to login; after login, user uploads a private document visible only to them; logging out hides private documents.

---

## Gantt (sprint → deliverable)
```
Sprint 1  DB + seed + library UI
Sprint 2  Upload pipeline (core engine)
Sprint 3  Extraction + review workspace  ← v1 functional milestone
Sprint 4  Search + Q&A
Sprint 5  Bounding-box overlays + click-to-extract
Sprint 6  Integrations + approve-to-deliver
Sprint 7  Polish + keyboard review loop
Sprint 8  Auth + per-user lock-down
```
