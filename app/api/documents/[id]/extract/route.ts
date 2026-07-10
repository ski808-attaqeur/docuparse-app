import { NextRequest, NextResponse } from "next/server";
import { runExtraction } from "@/lib/extract-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sprint 3: POST /documents/{id}/extract { schema_id }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { schema_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body { schema_id }" }, { status: 400 });
  }
  if (!body.schema_id) {
    return NextResponse.json({ error: "schema_id is required" }, { status: 400 });
  }
  try {
    const extractionId = await runExtraction(id, body.schema_id);
    return NextResponse.json({ extraction_id: extractionId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
