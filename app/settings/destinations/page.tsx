import { listDestinations } from "@/lib/queries";
import { adminClient } from "@/lib/supabase/admin";
import { DestinationsClient } from "@/components/DestinationsClient";

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const destinations = await listDestinations();
  const { data: rules } = await adminClient()
    .from("routing_rules")
    .select("*, destinations(name)");
  return <DestinationsClient initialDestinations={destinations} initialRules={rules ?? []} />;
}
