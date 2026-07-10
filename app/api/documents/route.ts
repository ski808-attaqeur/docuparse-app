import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";
import { ingestBuffer, audit } from "@/lib/pipeline";
import { runExtraction } from "@/lib/extract-run";
import { SUPPORTED_MIME, MAX_UPLOAD_BYTES } from "@/lib/parse";
import type { DocumentRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const db = adminClient();
  const { data, error } = await db
    .from("documents")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = adminClient();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  const schemaId = (form.get("schema_id") as string) || null;

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const blob = file as File;

  // Validation (FR-1/FR-2).
  const mime = blob.type || "application/octet-stream";
  const nameOk = /\.(pdf|docx|xlsx|xls|png|jpe?g|tiff?|txt|csv)$/i.test(blob.name);
  if (!SUPPORTED_MIME.includes(mime) && !nameOk) {
    return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 400 });
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "File is empty (zero bytes)" }, { status: 400 });
  }

  // Checksum dedupe (FR-3 / Sprint 2).
  const checksum = createHash("sha256").update(buf).digest("hex");
  const { data: dupe } = await db
    .from("documents")
    .select("*")
    .eq("checksum", checksum)
    .limit(1)
    .maybeSingle();
  if (dupe) {
    return NextResponse.json({ document: dupe, duplicate: true });
  }

  // Best-effort store the original for later download; non-fatal if it fails.
  const storagePath = `uploads/${checksum}-${sanitize(blob.name)}`;
  let storedPath: string | null = null;
  try {
    const { error: upErr } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, { contentType: mime, upsert: true });
    if (!upErr) storedPath = storagePath;
  } catch {
    /* storage unavailable — proceed without the original */
  }

  const { data: inserted, error } = await db
    .from("documents")
    .insert({
      filename: blob.name,
      mime_type: mime,
      file_size: buf.length,
      storage_path: storedPath,
      checksum,
      status: "queued",
    })
    .select("*")
    .single<DocumentRow>();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  await audit("document.uploaded", "document", inserted.id, {
    filename: blob.name,
    size: buf.length,
  });

  // Parse synchronously (fast for typical docs) so the library reflects results.
  try {
    await ingestBuffer(inserted, buf);
    if (schemaId) {
      try {
        await runExtraction(inserted.id, schemaId);
      } catch {
        /* extraction failure shouldn't fail the upload */
      }
    }
  } catch (e) {
    return NextResponse.json(
      { document: { ...inserted, status: "failed", error: (e as Error).message } },
      { status: 200 },
    );
  }

  const { data: fresh } = await db.from("documents").select("*").eq("id", inserted.id).single();
  return NextResponse.json({ document: fresh ?? inserted });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
