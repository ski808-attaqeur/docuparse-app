import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { toCsv, toJson } from "@/lib/export";
import type { ExtractionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FR-17 / Sprint 3: GET /documents/{id}/export?format=json|csv
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = (new URL(req.url).searchParams.get("format") || "json").toLowerCase();
  const db = adminClient();

  const { data: doc } = await db.from("documents").select("filename").eq("id", id).maybeSingle();
  const { data: extractions } = await db
    .from("extractions")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  const list = (extractions ?? []) as ExtractionRow[];
  if (!list.length) {
    return NextResponse.json({ error: "No extractions to export" }, { status: 404 });
  }
  // Prefer the most recent approved extraction; else the latest.
  const chosen = list.find((e) => e.status === "approved") ?? list[0];
  const canonical = { ...(chosen.data ?? {}), ...(chosen.corrected_data ?? {}) };
  const base = (doc?.filename ?? "export").replace(/\.[^.]+$/, "");

  if (format === "csv") {
    return new NextResponse(toCsv(canonical), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }
  return new NextResponse(toJson(canonical), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${base}.json"`,
    },
  });
}
