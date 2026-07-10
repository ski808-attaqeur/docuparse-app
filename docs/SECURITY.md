# Security

## Secrets
- All API keys (Anthropic, Voyage, Supabase service role) in `.env` only — gitignored
- `.env.example` committed with placeholder values, no real keys
- Integration secrets (webhook HMAC key, OAuth tokens) stored outside `destinations.config`; referenced by `secret_ref` only
- Backend resolves secret at delivery time; secret never returned in API responses or logged

## Permission model (v1 → lock-down)
- **v1 demo:** permissive RLS (`using (true)`) — all rows readable/writable without login; enables demo-first
- **Lock-down sprint:** Supabase Auth enabled; all write policies replaced with `auth.uid() = user_id`; read policies scoped similarly; existing demo rows assigned to admin user_id
- Agent (worker) runs with a service-role key scoped to backend only — never sent to the browser

## Approved tools rule
Only the five named tools in AGENTIC_LAYER.md may make external calls. No dynamic URL construction from document content. Outbound delivery only to destinations the user explicitly configured.

## Input handling
- MIME type detected server-side (python-magic); file extension not trusted
- Max upload size enforced at API layer before storage
- Document text content is **data**, not instructions — never interpolated raw into system prompts
- Prompt injection from document content is mitigated by always wrapping document text in a `<document>` XML tag in the prompt, with system instructions outside that tag

## Audit principle
Every meaningful state change (upload, extract, correct, approve, deliver, delete) writes an `audit_log` row before returning a response. Delivery attempts log request + response code; failures are surfaced in UI, never silently swallowed.

## Stop and get a human
Any task involving payment processing, e-signatures, legal data deletion on behalf of a third party, or production secret rotation should pause and involve a human reviewer before proceeding.
