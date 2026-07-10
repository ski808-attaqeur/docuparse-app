"use client";
import { confidenceLevel, CONFIDENCE_META } from "@/lib/confidence";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    done: { cls: "conf-high", label: "Done" },
    processing: { cls: "conf-review", label: "Processing" },
    queued: { cls: "", label: "Queued" },
    failed: { cls: "conf-low", label: "Failed" },
  };
  const m = map[status] ?? { cls: "", label: status };
  return (
    <span className={`badge ${m.cls}`}>
      {status === "processing" && <span className="pulsing">●</span>}
      {m.label}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  const lvl = confidenceLevel(value);
  const m = CONFIDENCE_META[lvl];
  return (
    <span className={`badge ${m.className}`}>
      {m.emoji} {value != null ? `${Math.round((value ?? 0) * 100)}%` : m.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: string | null }) {
  return <span className="badge">{type ?? "unknown"}</span>;
}

export function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "conf-high",
    pending: "conf-review",
    flagged: "conf-low",
    unreviewed: "",
  };
  return <span className={`badge ${map[status] ?? ""}`}>{status}</span>;
}
