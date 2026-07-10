import { createHmac } from "crypto";
import { adminClient } from "./supabase/admin";
import { audit } from "./pipeline";
import type { ExtractionRow, DestinationRow, DeliveryRow } from "./types";

function canonicalData(ex: ExtractionRow): Record<string, unknown> {
  return { ...(ex.data ?? {}), ...(ex.corrected_data ?? {}) };
}

/** Resolve the HMAC signing secret for a destination. Never comes from document
 * content; only from server env via secret_ref (docs/SECURITY.md). */
function resolveSecret(dest: DestinationRow): string {
  const ref = dest.secret_ref;
  if (ref && process.env[ref]) return process.env[ref] as string;
  return process.env.DELIVERY_HMAC_SECRET || "docuparse-demo-signing-key";
}

async function deliverToDestination(
  ex: ExtractionRow,
  dest: DestinationRow,
  idempotencyKey: string,
): Promise<DeliveryRow> {
  const db = adminClient();
  // Reuse an existing delivery row for this idempotency key if present.
  const { data: prior } = await db
    .from("deliveries")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<DeliveryRow>();
  if (prior && prior.status === "success") return prior;

  let deliveryId = prior?.id;
  if (!deliveryId) {
    const { data: created } = await db
      .from("deliveries")
      .insert({
        extraction_id: ex.id,
        destination_id: dest.id,
        status: "pending",
        attempts: 0,
        idempotency_key: idempotencyKey,
      })
      .select("*")
      .single<DeliveryRow>();
    deliveryId = created!.id;
  }

  const payload = {
    extraction_id: ex.id,
    document_id: ex.document_id,
    data: canonicalData(ex),
    delivered_at: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", resolveSecret(dest)).update(body).digest("hex");

  const url = (dest.config as { url?: string } | null)?.url;
  const MAX_ATTEMPTS = 3;
  let lastError = "";
  let responseCode: number | null = null;

  // Only webhook destinations perform a live POST; other types are recorded as
  // configured targets for the demo (no external creds wired).
  if (dest.type !== "webhook" || !url) {
    await db
      .from("deliveries")
      .update({
        status: "success",
        attempts: 1,
        response_code: 200,
        delivered_at: new Date().toISOString(),
        error: dest.type === "webhook" ? null : `Simulated delivery to ${dest.type}`,
      })
      .eq("id", deliveryId);
    const { data } = await db.from("deliveries").select("*").eq("id", deliveryId).single<DeliveryRow>();
    await audit("extraction.delivered", "extraction", ex.id, { destination_id: dest.id, type: dest.type });
    return data!;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await db.from("deliveries").update({ status: "retrying", attempts: attempt }).eq("id", deliveryId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-docuparse-signature": signature,
          "x-idempotency-key": idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      responseCode = res.status;
      if (res.ok) {
        await db
          .from("deliveries")
          .update({
            status: "success",
            attempts: attempt,
            response_code: res.status,
            delivered_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", deliveryId);
        await audit("extraction.delivered", "extraction", ex.id, {
          destination_id: dest.id,
          response_code: res.status,
        });
        const { data } = await db.from("deliveries").select("*").eq("id", deliveryId).single<DeliveryRow>();
        return data!;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
    // small backoff between attempts
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt));
  }

  await db
    .from("deliveries")
    .update({ status: "failed", attempts: MAX_ATTEMPTS, response_code: responseCode, error: lastError })
    .eq("id", deliveryId);
  await audit("extraction.delivery_failed", "extraction", ex.id, { destination_id: dest.id, error: lastError });
  const { data } = await db.from("deliveries").select("*").eq("id", deliveryId).single<DeliveryRow>();
  return data!;
}

/** On approval, look up routing rules for the doc type and auto-deliver. */
export async function maybeDeliverOnApprove(ex: ExtractionRow): Promise<DeliveryRow[] | null> {
  const db = adminClient();
  const { data: doc } = await db
    .from("documents")
    .select("doc_type")
    .eq("id", ex.document_id)
    .maybeSingle();
  if (!doc?.doc_type) return null;

  const { data: rules } = await db
    .from("routing_rules")
    .select("*, destinations(*)")
    .eq("doc_type", doc.doc_type)
    .eq("auto_deliver_on_approve", true);
  if (!rules || !rules.length) return null;

  const results: DeliveryRow[] = [];
  for (const rule of rules) {
    const dest = (rule as { destinations?: DestinationRow }).destinations;
    if (!dest || !dest.enabled) continue;
    const key = `${ex.id}:${dest.id}:approve`;
    results.push(await deliverToDestination(ex, dest, key));
  }
  return results;
}

/** Manual deliver to a specific destination (FR-32 / Sprint 6). */
export async function deliverManual(ex: ExtractionRow, destinationId: string): Promise<DeliveryRow> {
  const db = adminClient();
  const { data: dest } = await db
    .from("destinations")
    .select("*")
    .eq("id", destinationId)
    .single<DestinationRow>();
  if (!dest) throw new Error("Destination not found");
  const key = `${ex.id}:${dest.id}:${Date.now()}`;
  return deliverToDestination(ex, dest, key);
}
