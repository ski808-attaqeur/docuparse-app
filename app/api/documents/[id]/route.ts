import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = adminClient();
  const { data: document } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: pages } = await db
    .from("document_pages")
    .select("*")
    .eq("document_id", id)
    .order("page_number");
  const { data: extractions } = await db
    .from("extractions")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ document, pages: pages ?? [], extractions: extractions ?? [] });
}

// FR-19: delete a document and cascade its derived data (cascade via FKs).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = adminClient();
  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("document.deleted", "document", id, {});
  return NextResponse.json({ ok: true });
}
