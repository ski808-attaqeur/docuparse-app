import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "type", "config", "enabled"]) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await adminClient()
    .from("destinations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("destination.updated", "destination", id, patch);
  return NextResponse.json({ destination: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await adminClient().from("destinations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("destination.deleted", "destination", id, {});
  return NextResponse.json({ ok: true });
}
