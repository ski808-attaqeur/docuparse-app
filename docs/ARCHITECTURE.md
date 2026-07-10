# Architecture

## Stack
| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query |
| Backend | Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic |
| Database | Supabase (Postgres 15 + pgvector + FTS tsvector) |
| Storage | Supabase Storage (original files) |
| Jobs | FastAPI BackgroundTasks (starter) → Celery + Redis (when needed) |
| AI | Claude Haiku (classify) · Claude Sonnet (extract/Q&A) · Voyage AI voyage-3.5 (embed) |
| Deploy | Docker Compose (dev) · Vercel (frontend) · Supabase (DB + storage) |

## What to build now vs later
**Now:** upload pipeline, OCR, classification, extraction with confidence, split-screen review, hybrid search, RAG Q&A, export, demo seed.  
**Next:** bounding-box overlays, click-to-extract, integration destinations, approve-to-deliver, keyboard review loop, auth lock-down.  
**Later:** local model mode, CRM/ERP connectors, evals harness, cost dashboard, bulk runs.

## Key action flow — upload an invoice and extract structured data
1. User drags PDF onto upload zone → `POST /documents` (multipart)
2. File written to Supabase Storage; document row inserted (`status=queued`)
3. BackgroundTask picks up: detect MIME → Haiku classifies `doc_type` → PyMuPDF extracts text + word_boxes per page → Tesseract OCR where needed → pages written to DB
4. Text chunked → Voyage embeds → chunks + HNSW index written; tsvector populated
5. `status=done`; frontend stepper reflects each completed step
6. User selects Invoice schema → `POST /documents/{id}/extract` → Sonnet tool-use returns typed fields + source_text per field → grounding matches source_text to word_boxes → `extractions` row written with `field_meta`
7. Split-screen review: source PDF rendered via pdf.js; fields grouped (Header / Line Items / Summary); low-confidence fields flagged
8. User corrects a field (marked `source:human, edited:true`) → clicks Approve → `PATCH /extractions/{id}` → `status=approved`, corrected_data canonical
9. Export as CSV

## Why the core runs without AI
Text extraction (PyMuPDF, python-docx, openpyxl, Tesseract) and all DB reads/writes are deterministic. AI adds confidence scores and field values — if the Claude API is down, documents still ingest, text is available, and the user can manually fill extraction fields. The review step is the safety net regardless.
