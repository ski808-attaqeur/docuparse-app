import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await adminClient().from("routing_rules").select("*, destinations(name)");
  return NextResponse.json({ routing_rules: data ?? [] });
}

// FR-33 / Sprint 6: map a doc type to a destination for auto-delivery.
export async function POST(req: NextRequest) {
  let body: { doc_type?: string; destination_id?: string; auto_deliver_on_approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  if (!body.doc_type || !body.destination_id) {
    return NextResponse.json({ error: "doc_type and destination_id required" }, { status: 400 });
  }
  const { data, error } = await adminClient()
    .from("routing_rules")
    .insert({
      doc_type: body.doc_type,
      destination_id: body.destination_id,
      auto_deliver_on_approve: body.auto_deliver_on_approve ?? true,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("routing_rule.created", "routing_rule", data.id, body as Record<string, unknown>);
  return NextResponse.json({ routing_rule: data });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await adminClient().from("routing_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
