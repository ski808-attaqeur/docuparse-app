# Agentic Layer

## Risk levels and actions

### Low risk — auto-execute, log only
- Classify document type (Haiku, on ingest)
- Generate text summary / title for a chat session
- Score extraction confidence per field
- Tag document with detected doc_type

### Medium risk — draft shown to user, one click to apply
- Run structured extraction against a schema (Sonnet tool-use)
- Suggest a better-matching schema when classification confidence < 0.80
- Propose corrected field value when user triggers re-extract on a flagged field

### High risk — explicit user approval required
- Approve an extraction and mark it canonical
- Trigger delivery to a destination (webhook / Google Sheets)
- Reclassify a document (re-runs schema, discards previous extraction)

### Critical — human-only, never automated
- Delete a document and all derived data
- Add or modify a destination (integration target)
- Change a routing rule (which doc type goes where)
- Any action that sends data to an external URL not pre-configured by the user

## Named tools (v1)
| Tool | What it does | Risk |
|---|---|---|
| `classify_document` | Haiku: detect doc_type from first-page text | Low |
| `extract_fields` | Sonnet tool-use: typed fields + source_text against JSON schema | Medium |
| `answer_question` | Sonnet RAG: answer from retrieved chunks + citations | Low |
| `embed_chunk` | Voyage: generate 1024-dim embedding for a text chunk | Low |
| `deliver_extraction` | HTTP POST signed payload to user-configured destination | High |

No `run_any`, no `send_any`, no URL from document content ever used as a delivery target.

## Audit log fields
action, entity, entity_id, user_id, metadata {model, tokens, old_value, new_value, destination_id}, created_at.

## v1 vs later
**v1:** extract_fields, answer_question, classify_document, embed_chunk.  
**Later:** deliver_extraction (Sprint 6), Opus escalation, bulk schema runs, programmatic ingestion via API token.
