import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await adminClient()
    .from("extraction_schemas")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name");
  return NextResponse.json({ schemas: data ?? [] });
}

// Sprint 7: custom schema builder (name + typed fields → JSON Schema).
export async function POST(req: NextRequest) {
  let body: { name?: string; description?: string; fields?: { name: string; type: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  if (!body.name || !body.fields?.length) {
    return NextResponse.json({ error: "name and at least one field required" }, { status: 400 });
  }
  const properties: Record<string, { type: string }> = {};
  for (const f of body.fields) {
    if (!f.name) continue;
    properties[f.name.trim().replace(/\s+/g, "_").toLowerCase()] = {
      type: ["string", "number", "integer", "boolean"].includes(f.type) ? f.type : "string",
    };
  }
  const json_schema = { type: "object", properties, required: [] };
  const { data, error } = await adminClient()
    .from("extraction_schemas")
    .insert({ name: body.name, description: body.description ?? null, json_schema, is_builtin: false })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit("schema.created", "extraction_schema", data.id, { name: body.name });
  return NextResponse.json({ schema: data });
}
