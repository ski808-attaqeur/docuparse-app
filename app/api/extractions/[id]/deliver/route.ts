import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { deliverManual } from "@/lib/deliver";
import type { ExtractionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data } = await adminClient()
    .from("deliveries")
    .select("*, destinations(name,type)")
    .eq("extraction_id", id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ deliveries: data ?? [] });
}

// FR-32 / Sprint 6: manual deliver + retry.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { destination_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body { destination_id }" }, { status: 400 });
  }
  if (!body.destination_id) {
    return NextResponse.json({ error: "destination_id required" }, { status: 400 });
  }
  const { data: ex } = await adminClient()
    .from("extractions")
    .select("*")
    .eq("id", id)
    .maybeSingle<ExtractionRow>();
  if (!ex) return NextResponse.json({ error: "Extraction not found" }, { status: 404 });

  try {
    const delivery = await deliverManual(ex, body.destination_id);
    return NextResponse.json({ delivery });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
