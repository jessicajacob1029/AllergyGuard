import Link from "next/link";
import type { ReactNode } from "react";
import { linkClass } from "@/components/form-styles";
import { frameClass } from "@/components/ui/frame";
import { HeaderBand } from "@/components/ui/header-band";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/constants";

export type LegalSection = { title: string; body: ReactNode };

/** The email address as a mailto link, for the pages' text. */
export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={`${linkClass} break-all`}>
      {CONTACT_EMAIL}
    </a>
  );
}

/** Shared frame for /privacy and /terms: a page intro and one glass card per section. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <main>
      <HeaderBand eyebrow={`Last updated ${LEGAL_UPDATED}`} title={title} subtitle={intro} />
      <div className={`${frameClass()} space-y-3.5 pb-10 desk:pb-14`}>
        {sections.map(({ title: heading, body }) => (
          <section key={heading} className="glass rounded-[26px] p-5">
            <h2 className="text-xl font-semibold leading-tight tracking-[-0.03em] text-ink">{heading}</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
              {body}
            </div>
          </section>
        ))}
        <p className="pt-1 text-center text-[15px] text-muted">
          <Link href="/privacy" className={`${linkClass} inline-flex min-h-11 items-center px-2`}>
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className={`${linkClass} inline-flex min-h-11 items-center px-2`}>
            Terms
          </Link>
        </p>
      </div>
    </main>
  );
}
