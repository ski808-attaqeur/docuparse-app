import { notFound } from "next/navigation";
import { getDocument, getPages, getExtractions, listSchemas, listDestinations } from "@/lib/queries";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  const [pages, extractions, schemas, destinations] = await Promise.all([
    getPages(id),
    getExtractions(id),
    listSchemas(),
    listDestinations(),
  ]);

  return (
    <ReviewWorkspace
      document={document}
      pages={pages}
      extractions={extractions}
      schemas={schemas}
      destinations={destinations}
    />
  );
}
