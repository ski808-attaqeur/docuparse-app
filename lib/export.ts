/** Flatten an extraction's canonical data to CSV and JSON for export. */

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      out[key] = "";
    } else if (Array.isArray(v)) {
      // Serialize arrays of objects compactly; keep scalar arrays joined.
      if (v.length && typeof v[0] === "object") {
        out[key] = JSON.stringify(v);
      } else {
        out[key] = v.join("; ");
      }
    } else if (typeof v === "object") {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(data: Record<string, unknown>): string {
  const flat = flatten(data);
  const keys = Object.keys(flat);
  const header = keys.map(csvCell).join(",");
  const row = keys.map((k) => csvCell(flat[k])).join(",");
  return `${header}\n${row}\n`;
}

export function toJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}
