"use client";
import { useRef, useState } from "react";
import type { DocumentPage, WordBox } from "@/lib/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Renders a document page reconstructed from its word_boxes (normalized 0..1),
 * so the source view works without the original binary and stays aligned at any
 * zoom. Supports a highlight overlay for the focused field's bbox and
 * drag-to-select regions for click-to-extract (Sprint 5).
 */
export function SourcePane({
  page,
  scale,
  highlight,
  regionMode,
  onRegion,
  onWordClick,
}: {
  page: DocumentPage;
  scale: number;
  highlight?: { page: number; bbox: Rect | null } | null;
  regionMode: boolean;
  onRegion?: (rect: Rect, words: WordBox[]) => void;
  onWordClick?: (word: WordBox) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const baseWidth = 640;
  const W = baseWidth * scale;
  const H = W * ((page.height || 792) / (page.width || 612));
  const boxes = (page.word_boxes ?? []) as WordBox[];

  function toNorm(e: React.MouseEvent): { nx: number; ny: number } {
    const rect = ref.current!.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!regionMode) return;
    const { nx, ny } = toNorm(e);
    setDrag({ x0: nx, y0: ny, x1: nx, y1: ny });
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!regionMode || !drag) return;
    const { nx, ny } = toNorm(e);
    setDrag({ ...drag, x1: nx, y1: ny });
  }
  function onMouseUp() {
    if (!regionMode || !drag) return;
    const rect: Rect = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      w: Math.abs(drag.x1 - drag.x0),
      h: Math.abs(drag.y1 - drag.y0),
    };
    const selected = boxes.filter((b) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
    });
    if (rect.w > 0.01 && rect.h > 0.005) onRegion?.(rect, selected);
    setDrag(null);
  }

  const showHighlight = highlight && highlight.page === page.page_number && highlight.bbox;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        ref={ref}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={{
          position: "relative",
          width: W,
          height: H,
          background: "#fff",
          color: "#111",
          boxShadow: "0 1px 8px rgba(0,0,0,.18)",
          borderRadius: 4,
          cursor: regionMode ? "crosshair" : "default",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {boxes.map((b) => (
          <span
            key={b.i}
            onClick={() => onWordClick?.(b)}
            style={{
              position: "absolute",
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              height: `${b.h * 100}%`,
              fontSize: Math.max(6, b.h * H * 0.92),
              lineHeight: 1,
              whiteSpace: "nowrap",
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              color: "#1a1a1a",
            }}
          >
            {b.text}
          </span>
        ))}

        {showHighlight && (
          <div
            style={{
              position: "absolute",
              left: `${highlight!.bbox!.x * 100}%`,
              top: `${highlight!.bbox!.y * 100}%`,
              width: `${highlight!.bbox!.w * 100}%`,
              height: `${highlight!.bbox!.h * 100}%`,
              background: "rgba(79,70,229,.22)",
              border: "2px solid #4f46e5",
              borderRadius: 3,
              pointerEvents: "none",
              transition: "all .15s ease",
            }}
          />
        )}

        {drag && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(drag.x0, drag.x1) * 100}%`,
              top: `${Math.min(drag.y0, drag.y1) * 100}%`,
              width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
              height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
              background: "rgba(16,185,129,.18)",
              border: "1.5px dashed #059669",
              pointerEvents: "none",
            }}
          />
        )}

        {boxes.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
              fontSize: 13,
              textAlign: "center",
              padding: 24,
            }}
          >
            {page.ocr_used
              ? "Image page — no OCR text layer in this build. Fill fields manually on the right."
              : "No text on this page."}
          </div>
        )}
      </div>
    </div>
  );
}
