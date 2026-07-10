import { listDocuments, listSchemas } from "@/lib/queries";
import { Library } from "@/components/Library";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function Home() {
  const docsResult = await listDocuments();

  if (docsResult.schemaMissing) {
    return <SetupNotice error={docsResult.error} />;
  }

  const schemas = await listSchemas();

  return <Library initialDocs={docsResult.data ?? []} schemas={schemas} />;
}
