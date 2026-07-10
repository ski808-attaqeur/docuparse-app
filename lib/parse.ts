import type { WordBox } from "./types";

export interface ParsedPage {
  page_number: number;
  text_content: string;
  width: number;
  height: number;
  word_boxes: WordBox[];
  ocr_used: boolean;
}

export interface ParseResult {
  pages: ParsedPage[];
  ocr_used: boolean;
}

/** Detect a friendly doc-type hint from mime + filename (used when AI is off). */
export function guessDocType(filename: string, mime: string): string {
  const f = filename.toLowerCase();
  if (mime.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(f)) return "spreadsheet";
  if (/invoice|inv[-_]/.test(f)) return "invoice";
  if (/receipt|rcpt/.test(f)) return "receipt";
  if (/contract|agreement|nda/.test(f)) return "contract";
  if (/report|summary|q[1-4]/.test(f)) return "report";
  if (mime.startsWith("image/")) return "receipt";
  return "other";
}

/** Refine the doc-type guess using the extracted first-page text. */
export function refineDocType(text: string, fallback: string): string {
  const t = text.toLowerCase();
  if (/invoice\s*(number|no|#)|bill to|invoice date/.test(t)) return "invoice";
  if (/receipt|subtotal|change due|thank you for your/.test(t) && /total/.test(t))
    return fallback === "invoice" ? "invoice" : "receipt";
  if (/agreement|hereby|party of the|terms and conditions|shall/.test(t)) return "contract";
  return fallback;
}

function normalizeWords(
  words: { text: string; x: number; y: number; w: number; h: number }[],
  width: number,
  height: number,
): WordBox[] {
  return words
    .filter((w) => w.text.trim().length > 0)
    .map((w, i) => ({
      text: w.text,
      x: clamp(w.x / width),
      y: clamp(w.y / height),
      w: clamp(w.w / width),
      h: clamp(w.h / height),
      i,
    }));
}

function clamp(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function parsePdf(buf: Buffer): Promise<ParseResult> {
  // pdfjs-dist legacy build runs in Node.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const pages: ParsedPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;
    const content = await page.getTextContent();
    const words: { text: string; x: number; y: number; w: number; h: number }[] = [];
    let textContent = "";
    for (const item of content.items as PdfTextItem[]) {
      if (!("str" in item) || !item.str) continue;
      const tx = item.transform; // [a,b,c,d,e,f]
      const x = tx[4];
      const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 10;
      // pdf.js origin is bottom-left; flip to top-left.
      const yTop = height - tx[5] - fontHeight;
      const wWidth = item.width || item.str.length * fontHeight * 0.5;
      words.push({ text: item.str, x, y: yTop, w: wWidth, h: fontHeight });
      textContent += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push({
      page_number: p,
      text_content: textContent.trim(),
      width: Math.round(width),
      height: Math.round(height),
      word_boxes: normalizeWords(words, width, height),
      ocr_used: false,
    });
  }
  return { pages, ocr_used: false };
}

async function parseDocx(buf: Buffer): Promise<ParseResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return { pages: paginateText(value), ocr_used: false };
}

async function parseXlsx(buf: Buffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  let text = "";
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    text += `# ${sheetName}\n`;
    text += XLSX.utils.sheet_to_csv(sheet) + "\n\n";
  }
  return { pages: paginateText(text), ocr_used: false };
}

async function parsePlainText(buf: Buffer): Promise<ParseResult> {
  return { pages: paginateText(buf.toString("utf-8")), ocr_used: false };
}

/** Lay text out into a synthetic page with word boxes so the source pane can
 * render and support bounding-box highlighting without the original binary. */
function paginateText(text: string): ParsedPage[] {
  const LINES_PER_PAGE = 52;
  const PAGE_W = 612; // US Letter @ 72dpi
  const PAGE_H = 792;
  const MARGIN_X = 56;
  const MARGIN_Y = 56;
  const LINE_H = (PAGE_H - MARGIN_Y * 2) / LINES_PER_PAGE;
  const CHAR_W = 6.2;
  const rawLines = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  const maxChars = Math.floor((PAGE_W - MARGIN_X * 2) / CHAR_W);
  for (const l of rawLines) {
    if (l.length <= maxChars) {
      lines.push(l);
    } else {
      for (let i = 0; i < l.length; i += maxChars) lines.push(l.slice(i, i + maxChars));
    }
  }
  const pages: ParsedPage[] = [];
  for (let pi = 0; pi * LINES_PER_PAGE < Math.max(lines.length, 1); pi++) {
    const pageLines = lines.slice(pi * LINES_PER_PAGE, (pi + 1) * LINES_PER_PAGE);
    const words: WordBox[] = [];
    let idx = 0;
    let textContent = "";
    pageLines.forEach((line, li) => {
      textContent += line + "\n";
      const yTop = MARGIN_Y + li * LINE_H;
      let col = 0;
      for (const token of line.split(/(\s+)/)) {
        if (token.trim().length === 0) {
          col += token.length;
          continue;
        }
        const x = MARGIN_X + col * CHAR_W;
        const w = token.length * CHAR_W;
        words.push({
          text: token,
          x: x / PAGE_W,
          y: yTop / PAGE_H,
          w: w / PAGE_W,
          h: (LINE_H * 0.8) / PAGE_H,
          i: idx++,
        });
        col += token.length;
      }
    });
    pages.push({
      page_number: pi + 1,
      text_content: textContent.trim(),
      width: PAGE_W,
      height: PAGE_H,
      word_boxes: words,
      ocr_used: false,
    });
  }
  return pages.length ? pages : [emptyPage()];
}

/** Lay a single text block onto one synthetic page with word boxes. Used to
 * build source-pane layouts for the demo corpus and for non-PDF sources. */
export function layoutTextToPage(text: string, pageNumber: number): ParsedPage {
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN_X = 56;
  const MARGIN_Y = 56;
  const CHAR_W = 6.2;
  const LINE_H = 15;
  const maxChars = Math.floor((PAGE_W - MARGIN_X * 2) / CHAR_W);
  const rawLines = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const l of rawLines) {
    if (l.length <= maxChars) lines.push(l);
    else for (let i = 0; i < l.length; i += maxChars) lines.push(l.slice(i, i + maxChars));
  }
  const words: WordBox[] = [];
  let idx = 0;
  lines.forEach((line, li) => {
    const yTop = MARGIN_Y + li * LINE_H;
    let col = 0;
    for (const token of line.split(/(\s+)/)) {
      if (token.trim().length === 0) {
        col += token.length;
        continue;
      }
      const x = MARGIN_X + col * CHAR_W;
      const w = token.length * CHAR_W;
      words.push({
        text: token,
        x: x / PAGE_W,
        y: yTop / PAGE_H,
        w: w / PAGE_W,
        h: (LINE_H * 0.78) / PAGE_H,
        i: idx++,
      });
      col += token.length;
    }
  });
  return {
    page_number: pageNumber,
    text_content: text.trim(),
    width: PAGE_W,
    height: PAGE_H,
    word_boxes: words,
    ocr_used: false,
  };
}

function emptyPage(): ParsedPage {
  return {
    page_number: 1,
    text_content: "",
    width: 612,
    height: 792,
    word_boxes: [],
    ocr_used: false,
  };
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

const OFFICE_DOC =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const OFFICE_SHEET =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Parse any supported file into pages. Images have no server-side OCR in this
 * serverless build, so they return a single empty page flagged ocr_used=true;
 * the user can still fill extraction fields manually (core works AI-off).
 */
export async function parseDocument(
  buf: Buffer,
  mime: string,
  filename: string,
): Promise<ParseResult> {
  const f = filename.toLowerCase();
  try {
    if (mime === "application/pdf" || f.endsWith(".pdf")) return await parsePdf(buf);
    if (mime === OFFICE_DOC || f.endsWith(".docx")) return await parseDocx(buf);
    if (mime === OFFICE_SHEET || /\.(xlsx|xls)$/.test(f)) return await parseXlsx(buf);
    if (mime.startsWith("text/") || /\.(txt|csv|md)$/.test(f))
      return await parsePlainText(buf);
    if (mime.startsWith("image/")) {
      return {
        pages: [{ ...emptyPage(), ocr_used: true }],
        ocr_used: true,
      };
    }
    // Unknown: try plain text as a last resort.
    return await parsePlainText(buf);
  } catch (e) {
    throw new Error(`Parse failed: ${(e as Error).message}`);
  }
}

export const SUPPORTED_MIME = [
  "application/pdf",
  OFFICE_DOC,
  OFFICE_SHEET,
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "text/plain",
  "text/csv",
];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
