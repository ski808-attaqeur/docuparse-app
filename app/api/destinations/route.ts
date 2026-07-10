import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = adminClient();
  const { data: destinations } = await db.from("destinations").select("*").order("created_at");
  const { data: rules } = await db.from("routing_rules").select("*");
  return NextResponse.json({ destinations: destinations ?? [], routing_rules: rules ?? [] });
}

// FR-33 / Sprint 6: create a destination.
export async function POST(req: NextRequest) {
  let body: { name?: string; type?: string; config?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  if (!body.name || !body.type) {
    return NextResponse.json({ error: "name and type required" }, { status: 400 });
  }
  const { data, error } = await adminClient()
    .from("destinations")
    .insert({ name: body.name, type: body.type, config: body.config ?? {}, enabled: true })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("destination.created", "destination", data.id, { name: body.name, type: body.type });
  return NextResponse.json({ destination: data });
}
