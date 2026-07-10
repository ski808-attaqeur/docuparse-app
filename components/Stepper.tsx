"use client";
import type { DocumentRow } from "@/lib/types";

// FR-30: Upload → Classify → OCR/Parse → Extract → Index progress indicator.
export function Stepper({ document, hasExtraction }: { document: DocumentRow; hasExtraction: boolean }) {
  const failed = document.status === "failed";
  const processed = document.status === "done";
  const steps = [
    { name: "Upload", done: true },
    { name: "Classify", done: processed || !!document.doc_type },
    { name: document.ocr_used ? "OCR / Parse" : "Parse", done: processed },
    { name: "Index", done: processed },
    { name: "Extract", done: hasExtraction },
  ];
  return (
    <div className="panel" style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`badge ${s.done ? "conf-high" : failed && i <= 3 ? "conf-low" : ""}`}
            style={{ fontSize: 11 }}
          >
            {s.done ? "✓" : failed && i <= 3 ? "✕" : "○"} {s.name}
          </span>
          {i < steps.length - 1 && <span style={{ color: "var(--border)" }}>—</span>}
        </div>
      ))}
      {failed && (
        <span className="badge conf-low" style={{ marginLeft: "auto" }} title={document.error ?? ""}>
          Failed: {document.error?.slice(0, 60)}
        </span>
      )}
    </div>
  );
}
