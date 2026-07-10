import type { DocumentPage, WordBox } from "./types";

export interface Grounded {
  page: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  source_text: string | null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find where a value's source text appears in the page word-boxes and return a
 * merged bounding box in normalized coords. Returns bbox=null when no location
 * can be found — callers must NOT draw a fake rectangle (docs/TASKS Sprint 5).
 */
export function groundValue(
  sourceText: string | null,
  pages: DocumentPage[],
): Grounded {
  if (!sourceText) return { page: pages[0]?.page_number ?? 1, bbox: null, source_text: null };
  const target = norm(sourceText);
  if (!target) return { page: pages[0]?.page_number ?? 1, bbox: null, source_text: sourceText };

  for (const page of pages) {
    const boxes = (page.word_boxes ?? []) as WordBox[];
    if (!boxes.length) continue;
    // Try to find a contiguous run of words whose concatenation contains target.
    for (let start = 0; start < boxes.length; start++) {
      let acc = "";
      const run: WordBox[] = [];
      for (let end = start; end < Math.min(start + 12, boxes.length); end++) {
        acc += norm(boxes[end].text);
        run.push(boxes[end]);
        if (acc === target || acc.includes(target)) {
          return {
            page: page.page_number,
            bbox: mergeBoxes(run),
            source_text: run.map((b) => b.text).join(" "),
          };
        }
        if (acc.length > target.length + 8) break;
      }
    }
    // Single-word contains match.
    const single = boxes.find((b) => norm(b.text).includes(target) || target.includes(norm(b.text)));
    if (single && norm(single.text).length >= 2) {
      return { page: page.page_number, bbox: mergeBoxes([single]), source_text: single.text };
    }
  }
  return { page: pages[0]?.page_number ?? 1, bbox: null, source_text: sourceText };
}

function mergeBoxes(boxes: WordBox[]): { x: number; y: number; w: number; h: number } {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Collect the word-boxes fully inside a normalized rectangle (click-to-extract). */
export function wordsInRegion(
  page: DocumentPage,
  rect: { x: number; y: number; w: number; h: number },
): WordBox[] {
  const boxes = (page.word_boxes ?? []) as WordBox[];
  const rx1 = rect.x + rect.w;
  const ry1 = rect.y + rect.h;
  return boxes
    .filter((b) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return cx >= rect.x && cx <= rx1 && cy >= rect.y && cy <= ry1;
    })
    .sort((a, b) => a.i - b.i);
}
