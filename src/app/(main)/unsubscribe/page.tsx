import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { linkClass, primaryButtonClass } from "@/components/form-styles";
import { frameClass } from "@/components/ui/frame";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { isUnsubscribeToken, parseUnsubscribeKind, unsubscribe, type UnsubscribeKind } from "@/lib/reminders/unsubscribe";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Email settings · ${APP_NAME}`,
  robots: { index: false },
};

/** The words for each kind of link. Product alert links never touch medication reminders, and back. */
const COPY: Record<UnsubscribeKind, { eyebrow: string; what: string; ask: string; done: string; doneBody: string; explain: string; button: string }> = {
  reminders: {
    eyebrow: "Medication reminders",
    what: "email reminders",
    ask: "Turn off email reminders?",
    done: "Email reminders are off",
    doneBody: "You won't get medication reminder emails any more.",
    explain: "You'll stop getting emails when a medication is about to expire. Notifications on your devices aren't affected.",
    button: "Turn off email reminders",
  },
  "product-alerts": {
    eyebrow: "Product change alerts",
    what: "product change alerts",
    ask: "Turn off product change alerts?",
    done: "Product change alerts are off",
    doneBody: "We won't tell you when a product you scanned changes any more. Medication reminders aren't affected.",
    explain:
      "We'll stop re-checking the products you scanned for changes, by email and on your devices. Medication reminders aren't affected.",
    button: "Turn off product change alerts",
  },
};

function query(kind: UnsubscribeKind, params: Record<string, string>): string {
  const q = new URLSearchParams(kind === "product-alerts" ? { kind, ...params } : params);
  return `/unsubscribe?${q.toString()}`;
}

/** Runs only when the button is pressed: mail scanners open links, but don't submit forms. */
async function turnOff(formData: FormData) {
  "use server";
  const token = formData.get("token");
  const kind = parseUnsubscribeKind(formData.get("kind"));
  if (!isUnsubscribeToken(token)) redirect(query(kind, { result: "invalid" }));
  let ok = false;
  try {
    ok = await unsubscribe(await createClient(), token, kind);
  } catch {
    redirect(query(kind, { token, result: "error" }));
  }
  redirect(query(kind, { result: ok ? "done" : "invalid" }));
}

type Search = { token?: string | string[]; result?: string | string[]; kind?: string | string[] };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const result = typeof params.result === "string" ? params.result : "";
  const kind = parseUnsubscribeKind(params.kind);
  const copy = COPY[kind];

  let title = copy.ask;
  let body: ReactNode;

  if (result === "done") {
    title = copy.done;
    body = (
      <p>
        {copy.doneBody} You can turn them back on in your{" "}
        <Link href="/profile#reminders" className={linkClass}>
          profile
        </Link>
        .
      </p>
    );
  } else if (result === "invalid" || !isUnsubscribeToken(token)) {
    title = "This link doesn't work";
    body = (
      <p>
        The link may be incomplete. Open it again from the email, or turn {copy.what} off in your{" "}
        <Link href="/profile#reminders" className={linkClass}>
          profile
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <>
        <p>{copy.explain}</p>
        {result === "error" && (
          <p role="alert" className="font-semibold text-unsafe-ink">
            Something went wrong. Check your connection and try again.
          </p>
        )}
        <form action={turnOff}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className={primaryButtonClass}>
            {copy.button}
          </button>
        </form>
      </>
    );
  }

  return (
    <main>
      <HeaderBand eyebrow={copy.eyebrow} title={title} />
      <div className={`${frameClass()} pb-10`}>
        <div className="glass space-y-4 rounded-[26px] p-5 text-[15px] leading-relaxed text-muted">{body}</div>
      </div>
    </main>
  );
}
