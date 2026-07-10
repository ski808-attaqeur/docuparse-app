import { adminClient } from "./supabase/admin";
import type {
  DocumentRow,
  DocumentPage,
  ExtractionRow,
  ExtractionSchema,
  DestinationRow,
  DeliveryRow,
} from "./types";

export interface DbResult<T> {
  data: T | null;
  schemaMissing: boolean;
  error: string | null;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "PGRST205" ||
    err.code === "42P01" ||
    /does not exist|schema cache|Could not find the table/i.test(err.message ?? "")
  );
}

export async function listDocuments(): Promise<DbResult<DocumentRow[]>> {
  try {
    const { data, error } = await adminClient()
      .from("documents")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) {
      return { data: null, schemaMissing: isMissingTable(error), error: error.message };
    }
    return { data: (data ?? []) as DocumentRow[], schemaMissing: false, error: null };
  } catch (e) {
    return { data: null, schemaMissing: false, error: (e as Error).message };
  }
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data } = await adminClient().from("documents").select("*").eq("id", id).maybeSingle();
  return (data as DocumentRow) ?? null;
}

export async function getPages(documentId: string): Promise<DocumentPage[]> {
  const { data } = await adminClient()
    .from("document_pages")
    .select("*")
    .eq("document_id", documentId)
    .order("page_number");
  return (data ?? []) as DocumentPage[];
}

export async function getExtractions(documentId: string): Promise<ExtractionRow[]> {
  const { data } = await adminClient()
    .from("extractions")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ExtractionRow[];
}

export async function getExtraction(id: string): Promise<ExtractionRow | null> {
  const { data } = await adminClient().from("extractions").select("*").eq("id", id).maybeSingle();
  return (data as ExtractionRow) ?? null;
}

export async function listSchemas(): Promise<ExtractionSchema[]> {
  const { data } = await adminClient()
    .from("extraction_schemas")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name");
  return (data ?? []) as ExtractionSchema[];
}

export async function listDestinations(): Promise<DestinationRow[]> {
  const { data } = await adminClient().from("destinations").select("*").order("created_at");
  return (data ?? []) as DestinationRow[];
}

export async function getDeliveries(extractionId: string): Promise<DeliveryRow[]> {
  const { data } = await adminClient()
    .from("deliveries")
    .select("*")
    .eq("extraction_id", extractionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DeliveryRow[];
}
