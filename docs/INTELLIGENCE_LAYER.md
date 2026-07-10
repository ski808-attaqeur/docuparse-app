# Intelligence Layer

## Messy inputs
- Scanned PDFs with skew, stamps, low DPI
- Invoices from 50+ different vendors with no consistent layout
- Receipts with handwritten totals or partial OCR
- Contracts with clause text that looks like key-value data
- Spreadsheets with merged cells, multiple sheets, formula-only cells

## Auto-structure schema (extraction output)
```json
{
  "vendor": "Acme Corp",
  "invoice_date": "2026-05-01",
  "total": 5230.00,
  "line_items": [
    {"description": "Widget A", "quantity": 20, "unit_price": 150.00, "amount": 3000.00}
  ],
  "_meta": {
    "vendor":       {"confidence": 0.97, "page": 1, "source_text": "ACME CORP", "source": "ai", "edited": false},
    "total":        {"confidence": 0.72, "page": 1, "source_text": "$5,230.00",  "source": "ai", "edited": false},
    "invoice_date": {"confidence": 0.88, "page": 1, "source_text": "May 1, 2026", "source": "ai", "edited": false}
  }
}
```

## Events to track
- Document uploaded, classified, parsed, extraction run, field corrected, approved, rejected, delivered, delivery failed
- Per-call: model used, token count, latency, cost estimate

## Scoring rules (v1 — rule-based thresholds)
| Confidence | Signal | Action |
|---|---|---|
| ≥ 0.90 | 🟢 high | Auto-accept in UI; still shown for inspection |
| 0.70–0.89 | 🟡 review | Flagged with ⚠; "next flagged" jumps here |
| < 0.70 | 🔴 low | Strong flag; blocks auto-export |

No field is silently trusted. Confidence is always stored (`data_confidence`, `field_meta[field].confidence`) and always visible.

## What gets ranked
- Search hits: hybrid score (keyword BM25 + cosine similarity)
- Extraction fields: confidence score drives review order
- RAG chunks: cosine + keyword relevance before context assembly

## v1 vs later
**v1:** Rule-based confidence thresholds; Haiku for classify, Sonnet for extract/Q&A.  
**Later:** Calibrated confidence from evals golden set; Opus escalation when Sonnet < 0.70; cost-per-document logging; local model swap for PII-sensitive runs.
