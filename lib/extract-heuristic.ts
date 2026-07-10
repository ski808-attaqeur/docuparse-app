import type { DocumentPage, FieldMeta, JSONSchema, JSONSchemaProp } from "./types";
import { groundValue } from "./ground";

export interface HeuristicResult {
  data: Record<string, unknown>;
  field_meta: Record<string, FieldMeta>;
}

const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;
// Money: comma-grouped thousands OR a plain run of digits, optional decimals.
const MONEY_RE = /\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;

function fullText(pages: DocumentPage[]): string {
  return pages.map((p) => p.text_content ?? "").join("\n");
}

function findLabeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // \b prevents "total" from matching inside "subtotal".
    const re = new RegExp(`\\b${label}\\b\\s*[:#]?\\s*([^\\n]{1,60})`, "i");
    const m = text.match(re);
    if (m && m[1]) return m[1].trim().replace(/\s{2,}/g, " ");
  }
  return null;
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length > 1 && !/^page\s+\d/i.test(t)) return t;
  }
  return null;
}

function parseMoney(s: string | null): number | null {
  if (!s) return null;
  const matches = [...s.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2}|\d+)/g)].map((m) => m[1]);
  if (!matches.length) return null;
  // Prefer a proper currency amount (has decimals or thousands separators) over
  // a bare integer like a percentage — e.g. "(9%) 430.00" → 430.00.
  const preferred = matches.find((x) => /[.,]/.test(x)) ?? matches[matches.length - 1];
  return parseFloat(preferred.replace(/,/g, ""));
}

function toIsoDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(DATE_RE);
  if (!m) return null;
  const raw = m[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    // Build from local components to avoid a UTC timezone day-shift.
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return raw;
}

/**
 * Deterministic best-effort extraction against a JSON schema. Used when the AI
 * layer is off, and as the always-present grounding pass over AI output. Every
 * field is low/medium confidence so the reviewer verifies it — nothing is
 * silently trusted (docs/INTELLIGENCE_LAYER.md).
 */
export function heuristicExtract(
  schema: JSONSchema,
  pages: DocumentPage[],
): HeuristicResult {
  const text = fullText(pages);
  const data: Record<string, unknown> = {};
  const field_meta: Record<string, FieldMeta> = {};
  const props = schema.properties ?? {};

  const setField = (key: string, value: unknown, sourceText: string | null, conf: number) => {
    if (value === null || value === undefined || value === "") return;
    data[key] = value;
    const g = groundValue(sourceText, pages);
    field_meta[key] = {
      confidence: conf,
      page: g.page,
      bbox: g.bbox,
      source_text: g.source_text ?? sourceText,
      source: "heuristic",
      edited: false,
    };
  };

  for (const [key, prop] of Object.entries(props)) {
    const p = prop as JSONSchemaProp;
    const lname = key.toLowerCase();
    const isArray = p.type === "array" || (Array.isArray(p.type) && p.type.includes("array"));
    const isNumber = p.type === "number" || p.type === "integer";
    const isObject = p.type === "object";

    if (isArray && (lname.includes("line_item") || lname.includes("items"))) {
      const items = extractLineItems(text);
      if (items.length) {
        data[key] = items;
        const g = groundValue(items[0]?.description ?? null, pages);
        field_meta[key] = {
          confidence: 0.6,
          page: g.page,
          bbox: g.bbox,
          source_text: `${items.length} line item(s)`,
          source: "heuristic",
          edited: false,
        };
      }
      continue;
    }

    if (isObject && lname.includes("key_value")) {
      const kv = extractKeyValues(text);
      if (Object.keys(kv).length) {
        data[key] = kv;
        field_meta[key] = {
          confidence: 0.55,
          page: 1,
          bbox: null,
          source_text: `${Object.keys(kv).length} pair(s)`,
          source: "heuristic",
          edited: false,
        };
      }
      continue;
    }

    // Scalar heuristics keyed by common field names.
    if (/vendor|supplier|from|company/.test(lname)) {
      const v = findLabeled(text, ["vendor", "supplier", "from", "bill from"]) ?? firstNonEmptyLine(text);
      setField(key, v, v, 0.7);
    } else if (/merchant|store|shop/.test(lname)) {
      const v = findLabeled(text, ["merchant", "store"]) ?? firstNonEmptyLine(text);
      setField(key, v, v, 0.7);
    } else if (/invoice.*(number|no|#)|invoice_number|number$/.test(lname)) {
      const m = text.match(/\b(INV[-_ ]?\d+|[A-Z]{2,}[-_]\d{3,})\b/) ?? text.match(/(?:invoice\s*(?:number|no|#)\s*[:#]?\s*)([A-Za-z0-9-]+)/i);
      const v = m ? (m[1] ?? m[0]).trim() : null;
      setField(key, v, v, 0.85);
    } else if (isNumber && /total|amount|balance|due/.test(lname) && !/sub/.test(lname)) {
      const v = parseMoney(findLabeled(text, ["grand total", "total due", "total", "amount due", "balance due"]));
      const src = findLabeled(text, ["grand total", "total due", "total", "amount due"]);
      setField(key, v, src, 0.7);
    } else if (isNumber && /subtotal/.test(lname)) {
      const v = parseMoney(findLabeled(text, ["subtotal", "sub total"]));
      setField(key, v, findLabeled(text, ["subtotal"]), 0.72);
    } else if (isNumber && /tax|vat|gst/.test(lname)) {
      const v = parseMoney(findLabeled(text, ["tax", "vat", "gst", "sales tax"]));
      setField(key, v, findLabeled(text, ["tax"]), 0.72);
    } else if (isNumber) {
      const v = parseMoney(findLabeled(text, [lname.replace(/_/g, " ")]));
      setField(key, v, findLabeled(text, [lname.replace(/_/g, " ")]), 0.6);
    } else if (/due.*date|due_date/.test(lname)) {
      const v = toIsoDate(findLabeled(text, ["due date", "payment due"]));
      setField(key, v, findLabeled(text, ["due date"]), 0.75);
    } else if (/date/.test(lname)) {
      const v = toIsoDate(findLabeled(text, [lname.replace(/_/g, " "), "date"]) ?? text);
      const srcMatch = text.match(DATE_RE);
      setField(key, v, srcMatch ? srcMatch[0] : v, 0.75);
    } else if (/payment.*method|method/.test(lname)) {
      const v = findLabeled(text, ["payment method", "paid with", "payment"]);
      setField(key, v, v, 0.6);
    } else if (/title/.test(lname)) {
      const v = firstNonEmptyLine(text);
      setField(key, v, v, 0.65);
    } else if (isArray && /parties/.test(lname)) {
      const v = findLabeled(text, ["between", "parties"]);
      if (v) setField(key, [v], v, 0.5);
    } else {
      // Generic labeled lookup by the field name itself.
      const v = findLabeled(text, [key.replace(/_/g, " ")]);
      setField(key, v, v, 0.55);
    }
  }

  return { data, field_meta };
}

interface LineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  [k: string]: unknown;
}

function extractLineItems(text: string): LineItem[] {
  const lines = text.split("\n").map((l) => l.trim());
  // Constrain to the table region: from a header row (Description + a numeric
  // column label) down to the first totals row. Falls back to whole doc if no
  // header is found, but still skips totals/metadata lines.
  let start = 0;
  let end = lines.length;
  const headerIdx = lines.findIndex(
    (l) => /description|item|qty|quantity/i.test(l) && /amount|price|qty|quantity|total/i.test(l),
  );
  if (headerIdx >= 0) {
    start = headerIdx + 1;
    const totalsIdx = lines.findIndex((l, i) => i > headerIdx && /^\s*(sub\s*total|subtotal|total|tax|balance|amount due)\b/i.test(l));
    if (totalsIdx > headerIdx) end = totalsIdx;
  }

  const items: LineItem[] = [];
  const moneyGlobal = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2}|\d+/g;
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l.length < 4) continue;
    if (/^(sub\s*total|subtotal|total|tax|balance|amount due|invoice|date|bill to|payment)\b/i.test(l)) continue;
    if (/[:@]/.test(l)) continue; // skip labelled metadata / emails
    const nums = [...l.matchAll(moneyGlobal)].map((m) => parseFloat(m[0].replace(/,/g, "")));
    const desc = l.replace(moneyGlobal, " ").replace(/\s{2,}/g, " ").trim();
    // A line item needs a text description AND at least one monetary figure.
    if (nums.length >= 1 && desc.length >= 3 && /[a-z]/i.test(desc)) {
      const amount = nums[nums.length - 1];
      const unit = nums.length >= 3 ? nums[nums.length - 2] : nums.length === 2 ? nums[1] : undefined;
      const qty = nums.length >= 3 ? nums[0] : undefined;
      items.push({ description: desc, quantity: qty, unit_price: unit, amount });
    }
    if (items.length >= 25) break;
  }
  return items;
}

function extractKeyValues(text: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9 _/-]{1,30})\s*[:]\s*(.+?)\s*$/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim();
      if (k && v && v.length < 80 && Object.keys(kv).length < 30) kv[k] = v;
    }
  }
  return kv;
}

/** Merge AI-produced data with grounding from the page word-boxes. */
export function groundAiData(
  data: Record<string, unknown>,
  pages: DocumentPage[],
): Record<string, FieldMeta> {
  const meta: Record<string, FieldMeta> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    let sourceText: string | null = null;
    if (typeof value === "string" || typeof value === "number") sourceText = String(value);
    const g = groundValue(sourceText, pages);
    meta[key] = {
      confidence: g.bbox ? 0.9 : 0.78,
      page: g.page,
      bbox: g.bbox,
      source_text: g.source_text ?? sourceText,
      source: "ai",
      edited: false,
    };
  }
  return meta;
}

export function overallConfidence(meta: Record<string, FieldMeta>): number {
  const vals = Object.values(meta).map((m) => m.confidence);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}
