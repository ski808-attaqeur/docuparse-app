# DocuParse — Product Requirements

## Problem
Extracting usable data from documents (invoices, receipts, contracts, reports) is manual and error-prone. Existing tools either lose document structure or require rigid per-layout templates that break on any design change. Neither can be trusted to feed data into downstream systems without human cleanup.

## Target user
Internal operator (you + small trusted circle) processing a steady stream of documents — primarily invoices, receipts, and contracts — who needs structured, trustworthy data in downstream tools without copy-paste grind.

## Core objects
- **Document** — uploaded file with type, status, page count, OCR flag
- **DocumentPage** — per-page text, word-boxes (normalized 0–1 coords), tsvector
- **ExtractionSchema** — named JSON Schema defining fields to extract
- **Extraction** — AI output against a schema: data + field_meta (confidence, page, bbox, source_text, source, edited) + review status
- **Chunk** — text segment with 1024-dim embedding for semantic search / RAG
- **ChatSession / ChatMessage** — Q&A thread scoped to doc or corpus, answers include citations
- **Destination / RoutingRule / Delivery** — integration target, doc-type → destination mapping, outbound push log

## MVP must-haves
- [ ] Upload PDF, DOCX, XLSX, PNG, JPG; detect MIME server-side; reject unsupported/oversized
- [ ] Async processing pipeline: classify → extract text → OCR fallback → word-box capture → chunk + embed
- [ ] Processing stepper UI (Upload → Classify → OCR/Parse → Extract → Index) with failed-step retry
- [ ] Structured extraction against built-in Invoice / Receipt / Generic schemas, per-field confidence
- [ ] Split-screen review: source PDF left, grouped fields right, confidence flags, direct editing, approve/reject
- [ ] Keyword + semantic hybrid search; corpus Q&A with page-level citations
- [ ] JSON / CSV export of extractions
- [ ] Demo documents visible without login

## Non-goals (v1)
Bounding-box overlays, click-to-extract, integration destinations, auth/login wall, CRM/ERP native connectors, local-model mode, bulk schema runs, handwriting guarantees.

## Success criterion
Upload a real invoice PDF → pipeline completes → extraction shows vendor, total, line items with confidence scores → operator corrects one wrong field → approves → corrected JSON exportable as CSV. All steps work against the live database; no dead buttons.
