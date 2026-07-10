import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import type { DestinationRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Sprint 7: POST /destinations/{id}/test — send a signed test payload.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: dest } = await adminClient()
    .from("destinations")
    .select("*")
    .eq("id", id)
    .maybeSingle<DestinationRow>();
  if (!dest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = (dest.config as { url?: string } | null)?.url;
  if (dest.type !== "webhook" || !url) {
    return NextResponse.json({ ok: true, simulated: true, message: `Configured ${dest.type} target — no live call` });
  }
  const body = JSON.stringify({ test: true, destination: dest.name, at: new Date().toISOString() });
  const secret = process.env.DELIVERY_HMAC_SECRET || "docuparse-demo-signing-key";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-docuparse-signature": signature },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
