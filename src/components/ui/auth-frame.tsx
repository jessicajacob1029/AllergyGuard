import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/constants";
import { AppIconTile } from "./icons";

/** Log in and sign up (style v2): violet orb, app name, big heading, then the glass form. */
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col pb-10">
      <div className="mx-auto w-full max-w-sm px-5 pt-6">
        <AppIconTile size="lg" />
        <p className="eyebrow mt-7">{APP_NAME}</p>
        <h1 className="mt-2 text-[46px] font-medium leading-[0.98] tracking-[-0.05em] text-ink max-[359px]:text-[40px]">
          {title}
        </h1>
        <p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-muted">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

/** "OR" divider between the main action and the alternative. */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-ink/15" />
      <span className="eyebrow">or</span>
      <span className="h-px flex-1 bg-ink/15" />
    </div>
  );
}
