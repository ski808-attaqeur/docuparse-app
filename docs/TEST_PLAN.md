# Test Plan

## v1 success scenario (manual walkthrough)
1. Open `http://localhost:3000` without logging in → demo library visible with 5 documents, no login prompt
2. Click **Upload** → drag `invoice_acme_may2026.pdf` → see per-file progress bar → modal shows file queued
3. Close modal → document appears in library with status **processing** → stepper shows Upload ✓ → Classify ✓ → OCR/Parse ✓ → Extract → Index
4. Wait for **done** status → open document → stepper fully green
5. Click **Run Extraction** → select **Invoice v1** → wait for extraction → split-screen renders: PDF left, fields right
6. Confirm: Vendor 🟢, Invoice # 🟢, Date 🟡⚠, Total 🟡⚠ — two fields flagged
7. Click **Next flagged** → focus jumps to Date field → correct value to `2026-05-01` → field shows 🟢, marked `human`
8. Click **Approve** → status changes to **approved** → edit summary shows 1 field corrected
9. Click **Export CSV** → download opens → open in spreadsheet → vendor, invoice_number, invoice_date, total all correct
10. Reload page → corrected_data still canonical; approved status persists

## Empty states
| State | How to trigger | Expected UI |
|---|---|---|
| Empty library | Delete all documents | "No documents yet" card with Upload CTA |
| Failed parse | Upload a zero-byte PDF | Document row shows **failed** + error reason + Retry button |
| Nothing extracted | Run extraction on a blank-page PDF | "Nothing was extracted" with reclassify / try another schema options |
| No search results | Search for `zzznomatch9999` | "No documents matched" — not an error |
| Empty review queue | Approve all pending docs | "All caught up" message |
| Failed delivery | Configure unreachable webhook, approve doc | Delivery row shows **failed** + Retry button; data not assumed sent |
| Unsupported file | Upload `.exe` | Rejected immediately with "Unsupported file type" message |
| Oversized file | Upload file > 50 MB | Rejected with "File exceeds 50 MB limit" |

## Error / edge cases
- Upload same PDF twice → second upload deduplicated (same checksum), no duplicate processing job
- Delete a document → confirm pages, chunks, extractions, jobs all removed from DB
- Correct a field then reject → status = flagged; corrected_data still stored; document appears in review queue
- Narrow viewport (< 768 px) → split-screen collapses to Source / Data tabs; tap a field → tab switches to Source and scrolls
- Keyword search `vendor:Acme` → returns invoice document; click hit → opens document at page 1
- Ask "What is the total?" in corpus Q&A → answer cites invoice page 1; ask "What is the launch date of Mars mission?" → "This information was not found in your documents"

## Extraction confidence checks
- A field the model is uncertain about (confidence < 0.70) → always shows 🔴 flag + ⚠ icon; never auto-approved
- A field with no matched word-box → shows "no source location" label; no rectangle drawn on source
- Approve with uncorrected 🔴 field → allowed but warning shown; field still flagged in export metadata

## Keyboard review loop
- Open a flagged document → press **F** → focus jumps to first 🟡/🔴 field
- Press **E** → field enters edit mode → type correction → press Enter → field saved
- Press **F** again → next flagged field (or "all fields reviewed" message)
- Press **A** → extraction approved → press **N** → next document in review queue opens
- Entire loop completed with zero mouse clicks
