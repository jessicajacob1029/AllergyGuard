import type { Metadata } from "next";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { isUuid } from "@/lib/diary/reactions";
import { requireDiaryProfile } from "../load";
import { ReactionForm } from "../reaction-form";

export const metadata: Metadata = { title: `Log a reaction · ${APP_NAME}` };

// /diary/new?scan=<id> starts from a scan result: food and link filled in.
export default async function NewReactionPage({ searchParams }: PageProps<"/diary/new">) {
  const { scan } = await searchParams;
  const scanParam = typeof scan === "string" && isUuid(scan) ? scan : null;
  const { supabase } = await requireDiaryProfile(scanParam ? `/diary/new?scan=${scanParam}` : "/diary/new");

  let linked: { id: string; label: string | null } | null = null;
  if (scanParam) {
    // RLS: someone else's scan id finds nothing, and the form starts empty.
    const { data } = await supabase
      .from("scans")
      .select("id, product_name, brands, barcode")
      .eq("id", scanParam)
      .maybeSingle();
    if (data) {
      const label = [data.product_name, data.brands].filter(Boolean).join(", ") || null;
      linked = { id: data.id, label: label ?? `barcode ${data.barcode}` };
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand tone="medication" title="Log a reaction" emoji="📖" subtitle="Write down what happened while you remember." />
      <div className="mx-auto w-full max-w-sm px-4 py-6">
        <ReactionForm
          reactionId={null}
          initial={linked ? { food: linked.label?.slice(0, 200) ?? "", scanId: linked.id } : {}}
          scanLabel={linked?.label}
          cancelHref={linked ? `/scans/${linked.id}` : "/diary"}
        />
      </div>
    </main>
  );
}
