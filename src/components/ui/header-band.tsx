import type { ReactNode, Ref } from "react";
import { frameClass, type FrameWidth } from "./frame";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small Space Mono label above the title, e.g. "YOUR ACCOUNT". */
  eyebrow?: ReactNode;
  /** Centred layout (log in, sign up, 404). */
  centered?: boolean;
  /** Shown above the title, e.g. the app icon. */
  top?: ReactNode;
  /** Shown to the right of the title, e.g. an add button. */
  aside?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Column width from 900px; must match the content below so left edges line up. */
  width?: FrameWidth;
  /** No frame or outer spacing: for a grid that places the intro itself (Home). */
  bare?: boolean;
  children?: ReactNode;
};

/** Top of a screen (style v2): eyebrow, the page's <h1> and a short line under it. */
export function HeaderBand({
  title,
  subtitle,
  eyebrow,
  centered = false,
  top,
  aside,
  headingRef,
  width = "narrow",
  bare = false,
  children,
}: Props) {
  return (
    <div className={`${bare ? "" : "pb-5 pt-4 desk:pb-7 desk:pt-8"} ${centered ? "text-center" : ""}`}>
      <div className={bare ? "" : frameClass(width)}>
        {top && <div className={centered ? "mb-6 flex justify-center" : "mb-6"}>{top}</div>}
        <div className={`flex items-end gap-3 ${centered ? "justify-center" : "justify-between"}`}>
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h1
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
              className="break-words text-[38px] font-medium leading-[1.02] tracking-[-0.045em] text-ink outline-none max-[359px]:text-[34px] desk:text-[44px]"
            >
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}
