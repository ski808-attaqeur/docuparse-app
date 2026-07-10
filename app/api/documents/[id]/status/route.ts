import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = adminClient();
  const { data: doc } = await db
    .from("documents")
    .select("id,status,error,page_count,doc_type")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: jobs } = await db
    .from("jobs")
    .select("type,status,progress,error")
    .eq("document_id", id);
  return NextResponse.json({ ...doc, jobs: jobs ?? [] });
}
