// Shared Tailwind classes for forms and buttons (style v2), built on the tokens
// in app/globals.css. Buttons are 50px tall (taps ≥ 44px) with a small press
// scale that reduced motion turns off.

export const inputClass =
  "mt-1 block h-[50px] w-full rounded-field border border-field-line bg-white/80 px-4 text-base text-ink " +
  "placeholder:text-placeholder outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/25 " +
  "aria-[invalid=true]:border-unsafe-ink";

/** Field label: small uppercase Space Mono, like the design's eyebrows. */
export const labelClass = "eyebrow block";

export const fieldErrorClass = "mt-1 text-sm font-semibold text-unsafe-ink";

const buttonBase =
  "flex min-h-[50px] w-full items-center justify-center gap-2 rounded-button px-[18px] text-center text-[15px] " +
  "font-bold transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none " +
  "motion-reduce:active:scale-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary";

/** Main action: dark ink fill. */
export const primaryButtonClass = `${buttonBase} bg-ink text-white shadow-button`;

/** Second action: light glass. */
export const secondaryButtonClass = `${buttonBase} border border-ink/15 bg-white/75 text-ink`;

/** Low-emphasis actions such as Back and Cancel. */
export const tertiaryButtonClass = `${buttonBase} border border-line bg-white/50 text-muted`;

/** Final "you're done" actions (Finish). */
export const successButtonClass = `${buttonBase} bg-safe text-white`;

export const emergencyButtonClass = `${buttonBase} bg-emergency text-white shadow-[0_8px_18px_rgb(160_27_27/0.21)]`;

export const formAlertClass =
  "rounded-field border border-unsafe-ink/25 bg-unsafe-band p-3 text-sm font-semibold text-unsafe-ink";

export const formSuccessClass =
  "rounded-field border border-safe-ink/25 bg-safe-band p-3 text-sm font-semibold text-safe-ink";

export const linkClass = "font-bold text-primary-ink underline underline-offset-2";

/** A button class at its natural width instead of full width (e.g. beside another element). */
export function autoWidth(buttonClass: string): string {
  return buttonClass.replace("w-full", "w-auto");
}
