"use client";
import { useEffect, useState } from "react";
import { fmtValue } from "@/lib/format";

// FR-25: editable spreadsheet-like grid for line items (add/remove rows).
export function LineItems({
  field,
  rows,
  onChange,
  busy,
}: {
  field: string;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  busy: boolean;
}) {
  const [local, setLocal] = useState<Record<string, unknown>[]>(rows);
  useEffect(() => setLocal(rows), [rows]);

  const columns = Array.from(
    local.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const cols = columns.length ? columns : ["description", "quantity", "unit_price", "amount"];

  function updateCell(ri: number, col: string, raw: string) {
    const numeric = /price|amount|qty|quantity|total|unit/i.test(col);
    const value: unknown = numeric ? (raw === "" ? "" : parseFloat(raw.replace(/[^0-9.-]/g, ""))) : raw;
    const next = local.map((r, i) => (i === ri ? { ...r, [col]: value } : r));
    setLocal(next);
  }
  function commit() {
    onChange(local);
  }
  function addRow() {
    const empty: Record<string, unknown> = {};
    cols.forEach((c) => (empty[c] = ""));
    const next = [...local, empty];
    setLocal(next);
    onChange(next);
  }
  function removeRow(ri: number) {
    const next = local.filter((_, i) => i !== ri);
    setLocal(next);
    onChange(next);
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 4 }}>
      <div style={{ overflowX: "auto" }}>
        <table className="grid" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={/price|amount|qty|quantity|total|unit/i.test(c) ? "num" : ""}>
                  {c.replace(/_/g, " ")}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {local.map((row, ri) => (
              <tr key={ri}>
                {cols.map((c) => {
                  const numeric = /price|amount|qty|quantity|total|unit/i.test(c);
                  return (
                    <td key={c} className={numeric ? "num" : ""} style={{ padding: 2 }}>
                      <input
                        className="input"
                        style={{ border: "none", background: "transparent", padding: "4px 6px", textAlign: numeric ? "right" : "left", fontVariantNumeric: numeric ? "tabular-nums" : undefined }}
                        value={row[c] === undefined || row[c] === null ? "" : String(fmtValue(row[c]))}
                        onChange={(e) => updateCell(ri, c, e.target.value)}
                        onBlur={commit}
                      />
                    </td>
                  );
                })}
                <td style={{ padding: 2 }}>
                  <button className="btn btn-sm" onClick={() => removeRow(ri)} title="Remove row">✕</button>
                </td>
              </tr>
            ))}
            {local.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="muted" style={{ fontSize: 12 }}>No line items.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="btn btn-sm" onClick={addRow} disabled={busy} style={{ marginTop: 6 }}>
        + Add row
      </button>
    </div>
  );
}
