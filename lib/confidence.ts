export type ConfidenceLevel = "high" | "review" | "low";

export function confidenceLevel(c: number | null | undefined): ConfidenceLevel {
  const v = c ?? 0;
  if (v >= 0.9) return "high";
  if (v >= 0.7) return "review";
  return "low";
}

export const CONFIDENCE_META: Record<
  ConfidenceLevel,
  { emoji: string; label: string; className: string }
> = {
  high: { emoji: "🟢", label: "High", className: "conf-high" },
  review: { emoji: "🟡", label: "Review", className: "conf-review" },
  low: { emoji: "🔴", label: "Low", className: "conf-low" },
};

export function isFlagged(c: number | null | undefined): boolean {
  return confidenceLevel(c) !== "high";
}
