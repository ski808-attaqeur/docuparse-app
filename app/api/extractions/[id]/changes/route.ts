import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ExtractionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FR-34 / Sprint 6: field-level AI-vs-human diff.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: ex } = await adminClient()
    .from("extractions")
    .select("*")
    .eq("id", id)
    .maybeSingle<ExtractionRow>();
  if (!ex) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ai = (ex.data ?? {}) as Record<string, unknown>;
  const corrected = (ex.corrected_data ?? {}) as Record<string, unknown>;
  const changes: { field: string; ai: unknown; human: unknown }[] = [];
  for (const field of Object.keys(corrected)) {
    if (JSON.stringify(ai[field]) !== JSON.stringify(corrected[field])) {
      changes.push({ field, ai: ai[field] ?? null, human: corrected[field] });
    }
  }
  return NextResponse.json({ changes });
}
