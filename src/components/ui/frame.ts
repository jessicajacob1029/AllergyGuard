// Page column widths. Phones keep the 384px column (max-w-sm); from 900px wide
// (`desk:`) a page uses one of three widths. The page intro and the content use
// the same class, so their left edges always line up.
export type FrameWidth = "wide" | "medium" | "narrow";

// Full class strings so Tailwind finds them. Each adds 2 × 32px of padding:
// wide 1120px of content (Home, Profile), medium 760px (lists), narrow 640px (forms, details).
const DESK: Record<FrameWidth, string> = {
  wide: "desk:max-w-[1184px]",
  medium: "desk:max-w-[824px]",
  narrow: "desk:max-w-[704px]",
};

export function frameClass(width: FrameWidth = "narrow"): string {
  return `mx-auto w-full max-w-sm px-4 desk:px-8 ${DESK[width]}`;
}
