import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FR-14 / Sprint 4: GET /search?q=…
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const documentId = url.searchParams.get("document_id") || undefined;
  if (!q) return NextResponse.json({ hits: [] });
  const hits = await retrieve(q, { documentId, limit: 25 });
  return NextResponse.json({ hits });
}
