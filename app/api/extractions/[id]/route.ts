import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/pipeline";
import { maybeDeliverOnApprove } from "@/lib/deliver";
import type { ExtractionRow, FieldMeta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data } = await adminClient().from("extractions").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ extraction: data });
}

interface PatchBody {
  field_updates?: Record<string, unknown>; // human corrections keyed by field
  bbox_updates?: Record<string, { page: number; bbox: { x: number; y: number; w: number; h: number }; source_text?: string }>;
  status?: "approved" | "flagged" | "pending";
}

/**
 * Save corrections and/or move the extraction through review. Human edits are
 * recorded distinctly (source:human, edited:true) and merged into
 * corrected_data, which becomes canonical on approval (FR-12/FR-27/FR-29).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = adminClient();
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const { data: existing } = await db
    .from("extractions")
    .select("*")
    .eq("id", id)
    .maybeSingle<ExtractionRow>();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const aiData = (existing.data ?? {}) as Record<string, unknown>;
  const corrected: Record<string, unknown> = { ...aiData, ...(existing.corrected_data ?? {}) };
  const fieldMeta: Record<string, FieldMeta> = { ...(existing.field_meta ?? {}) };
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  if (body.field_updates) {
    for (const [field, value] of Object.entries(body.field_updates)) {
      const before = corrected[field];
      if (JSON.stringify(before) === JSON.stringify(value)) continue;
      changes.push({ field, from: aiData[field], to: value });
      corrected[field] = value;
      const prev = fieldMeta[field] ?? {
        confidence: 1,
        page: 1,
        bbox: null,
        source_text: null,
        source: "human" as const,
        edited: true,
      };
      fieldMeta[field] = { ...prev, source: "human", edited: true, confidence: 1 };
    }
  }

  if (body.bbox_updates) {
    for (const [field, upd] of Object.entries(body.bbox_updates)) {
      const prev = fieldMeta[field] ?? {
        confidence: 1,
        page: upd.page,
        bbox: null,
        source_text: null,
        source: "human" as const,
        edited: true,
      };
      fieldMeta[field] = {
        ...prev,
        page: upd.page,
        bbox: upd.bbox,
        source_text: upd.source_text ?? prev.source_text,
        source: "human",
        edited: true,
      };
    }
  }

  const patch: Record<string, unknown> = {
    corrected_data: corrected,
    field_meta: fieldMeta,
  };

  if (body.status) {
    patch.status = body.status;
    patch.reviewed = body.status !== "pending";
    patch.data_review_status =
      body.status === "approved" ? "approved" : body.status === "flagged" ? "flagged" : "unreviewed";
  }

  const { data: updated, error } = await db
    .from("extractions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single<ExtractionRow>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (changes.length) {
    await audit("extraction.corrected", "extraction", id, { changes });
  }

  let delivery = null;
  if (body.status === "approved") {
    await audit("extraction.approved", "extraction", id, { document_id: existing.document_id });
    try {
      delivery = await maybeDeliverOnApprove(updated!);
    } catch {
      /* delivery errors surface via the deliveries list, never block approval */
    }
  }
  if (body.status === "flagged") {
    await audit("extraction.flagged", "extraction", id, {});
  }

  return NextResponse.json({ extraction: updated, delivery });
}
