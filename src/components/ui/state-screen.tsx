import type { ReactNode } from "react";

const ORBS = {
  lilac: "bg-[radial-gradient(circle_at_30%_25%,#fff,#f5cfe1_30%,#aa97eb_75%)] text-[#5546ab]",
  grey: "bg-[radial-gradient(circle_at_30%_25%,#fff,#e6e0dd_40%,#bbb0c4)] text-[#4a4550]",
  peach: "bg-[radial-gradient(circle_at_30%_25%,#fff,#ffe2b7_35%,#d5bbef)] text-[#5546ab]",
} as const;

/** Full-screen message (offline, 404, ...): gradient orb, code, heading, text and actions. */
export function StateScreen({
  icon,
  orb = "lilac",
  code,
  title,
  children,
  actions,
}: {
  icon: ReactNode;
  orb?: keyof typeof ORBS;
  /** Small Space Mono label, e.g. "Error 404". */
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className={`mb-8 flex size-[145px] items-center justify-center rounded-full shadow-[0_25px_50px_rgb(101_76_155/0.18)] ${ORBS[orb]}`}
      >
        {icon}
      </span>
      <p className="eyebrow">{code}</p>
      <h1 className="mt-2 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-ink max-[359px]:text-[34px]">
        {title}
      </h1>
      <p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-muted">{children}</p>
      <div className="mt-7 w-full max-w-sm space-y-3">{actions}</div>
    </main>
  );
}
