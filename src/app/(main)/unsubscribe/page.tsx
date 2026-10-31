import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { linkClass, primaryButtonClass } from "@/components/form-styles";
import { frameClass } from "@/components/ui/frame";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { isUnsubscribeToken, unsubscribeEmail } from "@/lib/reminders/unsubscribe";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Email reminders · ${APP_NAME}`,
  robots: { index: false },
};

/** Runs only when the button is pressed: mail scanners open links, but don't submit forms. */
async function turnOff(formData: FormData) {
  "use server";
  const token = formData.get("token");
  if (!isUnsubscribeToken(token)) redirect("/unsubscribe?result=invalid");
  let ok = false;
  try {
    ok = await unsubscribeEmail(await createClient(), token);
  } catch {
    redirect(`/unsubscribe?token=${token}&result=error`);
  }
  redirect(ok ? "/unsubscribe?result=done" : "/unsubscribe?result=invalid");
}

type Search = { token?: string | string[]; result?: string | string[] };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const result = typeof params.result === "string" ? params.result : "";

  let title = "Turn off email reminders?";
  let body: ReactNode;

  if (result === "done") {
    title = "Email reminders are off";
    body = (
      <p>
        You won&apos;t get medication reminder emails any more. You can turn them back on in your{" "}
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
        The link may be incomplete. Open it again from the email, or turn email reminders off in your{" "}
        <Link href="/profile#reminders" className={linkClass}>
          profile
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <>
        <p>You&apos;ll stop getting emails when a medication is about to expire. Notifications on your devices aren&apos;t affected.</p>
        {result === "error" && (
          <p role="alert" className="font-semibold text-unsafe-ink">
            Something went wrong. Check your connection and try again.
          </p>
        )}
        <form action={turnOff}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className={primaryButtonClass}>
            Turn off email reminders
          </button>
        </form>
      </>
    );
  }

  return (
    <main>
      <HeaderBand eyebrow="Medication reminders" title={title} />
      <div className={`${frameClass()} pb-10`}>
        <div className="glass space-y-4 rounded-[26px] p-5 text-[15px] leading-relaxed text-muted">{body}</div>
      </div>
    </main>
  );
}
