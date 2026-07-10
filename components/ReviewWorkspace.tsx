"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DocumentRow,
  DocumentPage,
  ExtractionRow,
  ExtractionSchema,
  DestinationRow,
  FieldMeta,
  WordBox,
} from "@/lib/types";
import { SourcePane, type Rect } from "./SourcePane";
import { StatusBadge, ConfidenceBadge } from "./Badges";
import { confidenceLevel, isFlagged } from "@/lib/confidence";
import { docTypeEmoji, fmtValue } from "@/lib/format";
import { Stepper } from "./Stepper";
import { LineItems } from "./LineItems";

const SUMMARY_KEYS = /total|subtotal|tax|amount|balance|due|vat|gst/i;

export function ReviewWorkspace({
  document,
  pages,
  extractions,
  schemas,
  destinations,
}: {
  document: DocumentRow;
  pages: DocumentPage[];
  extractions: ExtractionRow[];
  schemas: ExtractionSchema[];
  destinations: DestinationRow[];
}) {
  const router = useRouter();
  const [extraction, setExtraction] = useState<ExtractionRow | null>(extractions[0] ?? null);
  const [schemaId, setSchemaId] = useState(schemas[0]?.id ?? "");
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ field: string; value: string } | null>(null);
  const [regionMode, setRegionMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const schema = useMemo(
    () => schemas.find((s) => s.id === extraction?.schema_id) ?? null,
    [schemas, extraction],
  );

  const canonical: Record<string, unknown> = useMemo(
    () => ({ ...(extraction?.data ?? {}), ...(extraction?.corrected_data ?? {}) }),
    [extraction],
  );
  const fieldMeta: Record<string, FieldMeta> = extraction?.field_meta ?? {};

  const page = pages.find((p) => p.page_number === currentPage) ?? pages[0];

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const loadDeliveries = useCallback(async () => {
    if (!extraction) return;
    const res = await fetch(`/api/extractions/${extraction.id}/deliver`);
    if (res.ok) setDeliveries((await res.json()).deliveries ?? []);
  }, [extraction]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  async function refreshExtraction(id: string) {
    const res = await fetch(`/api/extractions/${id}`, { cache: "no-store" });
    if (res.ok) setExtraction((await res.json()).extraction);
  }

  // ---- actions ----
  async function runExtraction(sid: string) {
    setBusy("extract");
    try {
      const res = await fetch(`/api/documents/${document.id}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema_id: sid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await refreshExtraction(json.extraction_id);
      notify("Extraction complete");
    } catch (e) {
      notify(`Extraction failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveField(field: string, value: unknown) {
    if (!extraction) return;
    setBusy(field);
    try {
      const res = await fetch(`/api/extractions/${extraction.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field_updates: { [field]: value } }),
      });
      const json = await res.json();
      if (res.ok) setExtraction(json.extraction);
    } finally {
      setBusy(null);
      setEditing(null);
    }
  }

  async function setStatus(status: "approved" | "flagged" | "pending") {
    if (!extraction) return;
    setBusy(status);
    try {
      const res = await fetch(`/api/extractions/${extraction.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok) {
        setExtraction(json.extraction);
        if (status === "approved") {
          const delivered = json.delivery?.length;
          notify(delivered ? `Approved · delivered to ${delivered} destination(s)` : "Approved");
          loadDeliveries();
        } else if (status === "flagged") {
          notify("Flagged for review");
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const focusField = useCallback(
    (field: string) => {
      setFocusedField(field);
      const m = fieldMeta[field];
      if (m?.page) setCurrentPage(m.page);
    },
    [fieldMeta],
  );

  const flaggedFields = useMemo(
    () => Object.keys(canonical).filter((k) => isFlagged(fieldMeta[k]?.confidence)),
    [canonical, fieldMeta],
  );

  const nextFlagged = useCallback(() => {
    if (!flaggedFields.length) {
      notify("No flagged fields 🎉");
      return;
    }
    const idx = focusedField ? flaggedFields.indexOf(focusedField) : -1;
    const next = flaggedFields[(idx + 1) % flaggedFields.length];
    focusField(next);
  }, [flaggedFields, focusedField, focusField]);

  async function onRegion(rect: Rect, words: WordBox[]) {
    if (!focusedField || !extraction) {
      notify("Select a field first, then drag on the source");
      return;
    }
    const text = words.map((w) => w.text).join(" ").trim();
    const prop = schema?.json_schema.properties?.[focusedField];
    const isNum = prop?.type === "number" || prop?.type === "integer";
    const value: unknown = isNum ? parseFloat(text.replace(/[^0-9.-]/g, "")) : text;
    setBusy(focusedField);
    try {
      await fetch(`/api/extractions/${extraction.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          field_updates: { [focusedField]: value },
          bbox_updates: { [focusedField]: { page: currentPage, bbox: rect, source_text: text } },
        }),
      }).then((r) => r.json().then((j) => r.ok && setExtraction(j.extraction)));
      notify(`Set ${focusedField} from source`);
    } finally {
      setBusy(null);
      setRegionMode(false);
    }
  }

  async function deleteDoc() {
    if (!confirm("Delete this document and all its data? This cannot be undone.")) return;
    await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    router.push("/");
  }

  async function deliver(destId: string) {
    if (!extraction) return;
    setBusy("deliver");
    try {
      await fetch(`/api/extractions/${extraction.id}/deliver`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination_id: destId }),
      });
      await loadDeliveries();
      notify("Delivery attempted");
    } finally {
      setBusy(null);
    }
  }

  // ---- keyboard shortcuts (FR-36) ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        nextFlagged();
      } else if (e.key === "e" || e.key === "E") {
        if (focusedField && canonical[focusedField] !== undefined) {
          e.preventDefault();
          setEditing({ field: focusedField, value: fmtValue(canonical[focusedField]) });
        }
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setStatus("approved");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setStatus("flagged");
      } else if (e.key === "ArrowRight") {
        setCurrentPage((p) => Math.min(pages.length, p + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentPage((p) => Math.max(1, p - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, focusedField, canonical, nextFlagged, pages.length]);

  const highlight = focusedField
    ? { page: fieldMeta[focusedField]?.page ?? 1, bbox: fieldMeta[focusedField]?.bbox ?? null }
    : null;

  // group fields
  const groups = useMemo(() => groupFields(canonical, schema), [canonical, schema]);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <a href="/" className="btn btn-sm">← Library</a>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{docTypeEmoji(document.doc_type)}</span>
          <strong style={{ fontSize: 16 }}>{document.filename}</strong>
          <StatusBadge status={document.status} />
          {document.doc_type && (
            <span className="badge">
              {document.doc_type}
              {document.doc_type_confidence != null ? ` · ${Math.round(document.doc_type_confidence * 100)}%` : ""}
            </span>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {extraction && (
            <>
              <a className="btn btn-sm" href={`/api/documents/${document.id}/export?format=csv`}>⬇ CSV</a>
              <a className="btn btn-sm" href={`/api/documents/${document.id}/export?format=json`}>⬇ JSON</a>
            </>
          )}
          <button className="btn btn-sm btn-danger" onClick={deleteDoc}>Delete</button>
        </div>
      </div>

      <Stepper document={document} hasExtraction={!!extraction} />

      {/* Split screen */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 16, marginTop: 16 }} className="split">
        {/* Source */}
        <div className="panel" style={{ padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>Source</strong>
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 4 }}>
              <button className="btn btn-sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>‹</button>
              <span className="muted" style={{ fontSize: 12 }}>Page {currentPage}/{pages.length || 1}</span>
              <button className="btn btn-sm" onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))} disabled={currentPage >= pages.length}>›</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
              <button className="btn btn-sm" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>−</button>
              <span className="muted" style={{ fontSize: 12 }}>{Math.round(scale * 100)}%</span>
              <button className="btn btn-sm" onClick={() => setScale((s) => Math.min(2.2, s + 0.2))}>+</button>
              <button
                className="btn btn-sm"
                onClick={() => setRegionMode((v) => !v)}
                style={regionMode ? { borderColor: "var(--brand)", color: "var(--brand)" } : {}}
                title="Drag a region on the source to fill the focused field"
              >
                {regionMode ? "◉ Selecting" : "⬚ Click-to-extract"}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 620, overflow: "auto", background: "var(--panel-2)", borderRadius: 8, padding: 12 }}>
            {page ? (
              <SourcePane
                page={page}
                scale={scale}
                highlight={highlight}
                regionMode={regionMode}
                onRegion={onRegion}
              />
            ) : (
              <div className="muted" style={{ textAlign: "center", padding: 40, fontSize: 13 }}>
                No source pages. {document.status === "failed" ? `Processing failed: ${document.error}` : ""}
              </div>
            )}
          </div>
        </div>

        {/* Data */}
        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column" }}>
          {!extraction ? (
            <ExtractionEmpty
              schemas={schemas}
              schemaId={schemaId}
              setSchemaId={setSchemaId}
              onRun={() => runExtraction(schemaId)}
              busy={busy === "extract"}
              docReady={document.status === "done"}
            />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>Extracted data</strong>
                <ConfidenceBadge value={extraction.overall_confidence} />
                <span className="badge">{extraction.model}</span>
                <span className={`badge ${extraction.status === "approved" ? "conf-high" : extraction.status === "flagged" ? "conf-low" : "conf-review"}`}>
                  {extraction.status}
                </span>
                <select
                  className="input"
                  style={{ width: "auto", marginLeft: "auto", fontSize: 12, padding: "4px 8px" }}
                  value={extraction.schema_id}
                  onChange={(e) => runExtraction(e.target.value)}
                  title="Re-run against a different schema"
                >
                  {schemas.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button className="btn btn-sm" onClick={nextFlagged} title="Jump to next flagged field (F)">
                  ⚠ Next flagged {flaggedFields.length ? `(${flaggedFields.length})` : ""}
                </button>
              </div>

              <div style={{ flex: 1, overflow: "auto", maxHeight: 520 }}>
                {groups.map((g) =>
                  g.fields.length === 0 && g.arrays.length === 0 ? null : (
                    <div key={g.name} style={{ marginBottom: 16 }}>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                        {g.name}
                      </div>
                      {g.fields.map((field) => (
                        <FieldRow
                          key={field}
                          field={field}
                          value={canonical[field]}
                          meta={fieldMeta[field]}
                          focused={focusedField === field}
                          editing={editing?.field === field}
                          editValue={editing?.value ?? ""}
                          busy={busy === field}
                          numeric={isNumeric(schema, field)}
                          onFocus={() => focusField(field)}
                          onStartEdit={() => setEditing({ field, value: fmtValue(canonical[field]) })}
                          onChange={(v) => setEditing({ field, value: v })}
                          onSave={(v) => saveField(field, coerce(schema, field, v))}
                          onCancel={() => setEditing(null)}
                        />
                      ))}
                      {g.arrays.map((field) => (
                        <LineItems
                          key={field}
                          field={field}
                          rows={(canonical[field] as Record<string, unknown>[]) ?? []}
                          onChange={(rows) => saveField(field, rows)}
                          busy={busy === field}
                        />
                      ))}
                    </div>
                  ),
                )}
                {Object.keys(canonical).length === 0 && (
                  <div className="muted" style={{ fontSize: 13, padding: "20px 0" }}>
                    Nothing was extracted. Try a different schema, or use click-to-extract to fill fields from the source.
                  </div>
                )}
              </div>

              {/* Review actions */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setStatus("approved")} disabled={busy === "approved"} title="Approve (A)">
                  ✓ Approve
                </button>
                <button className="btn btn-danger" onClick={() => setStatus("flagged")} disabled={busy === "flagged"} title="Reject / flag (R)">
                  ⚑ Reject &amp; flag
                </button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {destinations.map((d) => (
                    <button key={d.id} className="btn btn-sm" onClick={() => deliver(d.id)} disabled={busy === "deliver"} title={`Deliver to ${d.name}`}>
                      → {d.name}
                    </button>
                  ))}
                </div>
              </div>

              <ChangesAndDeliveries extraction={extraction} deliveries={deliveries} />
            </>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Keyboard: <b>F</b> next flagged · <b>E</b> edit focused · <b>A</b> approve · <b>R</b> reject · <b>← →</b> page
      </p>

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text)", color: "var(--bg)", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 200 }}>
          {toast}
        </div>
      )}

      <style>{`@media (max-width: 900px){ .split{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

interface DeliveryView {
  id: string;
  status: string;
  attempts: number;
  response_code: number | null;
  error: string | null;
  destinations?: { name: string; type: string } | null;
}

function FieldRow({
  field,
  value,
  meta,
  focused,
  editing,
  editValue,
  busy,
  numeric,
  onFocus,
  onStartEdit,
  onChange,
  onSave,
  onCancel,
}: {
  field: string;
  value: unknown;
  meta: FieldMeta | undefined;
  focused: boolean;
  editing: boolean;
  editValue: string;
  busy: boolean;
  numeric: boolean;
  onFocus: () => void;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const flagged = isFlagged(meta?.confidence);
  const lvl = confidenceLevel(meta?.confidence);
  return (
    <div
      onClick={onFocus}
      className={focused ? "field-focus" : ""}
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "6px 8px",
        borderRadius: 6,
        cursor: "pointer",
        background: focused ? "var(--panel-2)" : "transparent",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
        {prettyLabel(field)}
        {meta?.edited && <span title="Edited by you" style={{ color: "var(--brand)" }}> ✎</span>}
      </div>
      {editing ? (
        <input
          autoFocus
          className="input"
          value={editValue}
          inputMode={numeric ? "decimal" : "text"}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(editValue);
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => onSave(editValue)}
        />
      ) : (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
            onStartEdit();
          }}
          style={{
            fontSize: 13,
            textAlign: numeric ? "right" : "left",
            fontVariantNumeric: numeric ? "tabular-nums" : undefined,
            color: value === undefined || value === "" ? "var(--muted)" : "var(--text)",
            padding: "3px 4px",
            minHeight: 22,
          }}
          title="Click to edit"
        >
          {value === undefined || value === "" ? "—" : fmtValue(value)}
          {busy && <span className="pulsing"> …</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
        {flagged && <span title="Low/medium confidence — verify">⚠</span>}
        <span className={`badge conf-${lvl}`} style={{ fontSize: 10, padding: "2px 6px" }}>
          {Math.round((meta?.confidence ?? 0) * 100)}%
        </span>
      </div>
    </div>
  );
}

function ExtractionEmpty({
  schemas,
  schemaId,
  setSchemaId,
  onRun,
  busy,
  docReady,
}: {
  schemas: ExtractionSchema[];
  schemaId: string;
  setSchemaId: (v: string) => void;
  onRun: () => void;
  busy: boolean;
  docReady: boolean;
}) {
  return (
    <div style={{ textAlign: "center", padding: "40px 16px", margin: "auto" }}>
      <div style={{ fontSize: 32 }}>🧠</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>No extraction yet</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Pick a schema and extract structured fields from this document.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
        <select className="input" style={{ width: "auto" }} value={schemaId} onChange={(e) => setSchemaId(e.target.value)}>
          {schemas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={onRun} disabled={busy || !docReady || !schemaId}>
          {busy ? "Extracting…" : "Run extraction"}
        </button>
      </div>
      {!docReady && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Document is still processing…</p>}
    </div>
  );
}

function ChangesAndDeliveries({
  extraction,
  deliveries,
}: {
  extraction: ExtractionRow;
  deliveries: DeliveryView[];
}) {
  const ai = (extraction.data ?? {}) as Record<string, unknown>;
  const corrected = (extraction.corrected_data ?? {}) as Record<string, unknown>;
  const changes = Object.keys(corrected).filter(
    (f) => JSON.stringify(ai[f]) !== JSON.stringify(corrected[f]),
  );
  if (!changes.length && !deliveries.length) return null;
  return (
    <div style={{ marginTop: 12, fontSize: 12 }}>
      {changes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Your corrections</div>
          {changes.map((f) => (
            <div key={f} style={{ display: "flex", gap: 6 }}>
              <span className="muted">{prettyLabel(f)}:</span>
              <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{fmtValue(ai[f]) || "—"}</span>
              <span>→</span>
              <strong>{fmtValue(corrected[f])}</strong>
            </div>
          ))}
        </div>
      )}
      {deliveries.length > 0 && (
        <div>
          <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Deliveries</div>
          {deliveries.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className={`badge ${d.status === "success" ? "conf-high" : d.status === "failed" ? "conf-low" : "conf-review"}`}>
                {d.status}
              </span>
              <span className="muted">{d.destinations?.name ?? "destination"}</span>
              {d.response_code && <span className="muted">· {d.response_code}</span>}
              {d.error && <span className="muted" style={{ opacity: 0.7 }}>· {d.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- helpers ----
function prettyLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isNumeric(schema: ExtractionSchema | null, field: string): boolean {
  const t = schema?.json_schema.properties?.[field]?.type;
  return t === "number" || t === "integer";
}

function coerce(schema: ExtractionSchema | null, field: string, raw: string): unknown {
  if (isNumeric(schema, field)) {
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? raw : n;
  }
  return raw;
}

interface FieldGroup {
  name: string;
  fields: string[];
  arrays: string[];
}

function groupFields(
  data: Record<string, unknown>,
  schema: ExtractionSchema | null,
): FieldGroup[] {
  const header: string[] = [];
  const summary: string[] = [];
  const arrays: string[] = [];
  const props = schema?.json_schema.properties ?? {};
  const keys = new Set([...Object.keys(props), ...Object.keys(data)]);
  for (const key of keys) {
    const val = data[key];
    const propType = props[key]?.type;
    if (Array.isArray(val) || propType === "array") {
      arrays.push(key);
    } else if (SUMMARY_KEYS.test(key)) {
      summary.push(key);
    } else if (typeof val === "object" && val !== null) {
      // objects (e.g. key_values) shown as header JSON
      header.push(key);
    } else {
      header.push(key);
    }
  }
  return [
    { name: "Document Header", fields: header, arrays: [] },
    { name: "Line Items", fields: [], arrays },
    { name: "Summary", fields: summary, arrays: [] },
  ];
}
