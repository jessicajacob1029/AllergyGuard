// Content-Security-Policy for every page (added by src/proxy.ts) and the
// other security headers (next.config.ts). Pure functions, tested.
//
// - Dynamic pages get a fresh nonce per request: only scripts Next.js stamps
//   with it (plus what they load, 'strict-dynamic') can run.
// - /emergency and /~offline are prerendered once and served from the service
//   worker offline, so they can't carry a per-request nonce. They allow inline
//   scripts instead; neither shows user-supplied text (the emergency card is
//   drawn from the device's own IndexedDB).
// - Label photo OCR (Tesseract.js) runs in a Web Worker loaded from our own
//   /tesseract/ files. A worker follows the policy sent with its own script,
//   so those files get OCR_WORKER_CSP (next.config.ts) instead of the page
//   policy: the only place 'wasm-unsafe-eval' is allowed. Pages need nothing
//   extra (measured 2026-11-03, enforced, Chromium and WebKit).

/** "report-only" while checking for violations; "enforce" once there are none. */
export type CspMode = "report-only" | "enforce";
export const CSP_MODE: CspMode = "enforce";

/** Prerendered pages that can't carry a nonce (see above). */
export const STATIC_PAGES = ["/emergency", "/~offline"] as const;

export function isStaticPage(pathname: string): boolean {
  return (STATIC_PAGES as readonly string[]).includes(pathname);
}

export function cspHeaderName(mode: CspMode): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** A random nonce for one response (base64, 128 bits). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({
  nonce,
  supabaseUrl,
  dev = false,
}: {
  /** Null for the prerendered pages (inline scripts allowed instead). */
  nonce: string | null;
  /** NEXT_PUBLIC_SUPABASE_URL: REST, Auth and Edge Functions are all on it. */
  supabaseUrl: string | undefined;
  /** next dev needs eval for fast refresh. */
  dev?: boolean;
}): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const script = nonce
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
    : ["'self'", "'unsafe-inline'"];
  if (dev) script.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    // next/font and Tailwind: self-hosted fonts, inline style attributes.
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    // The app icon is drawn from data: URLs; the camera preview may use blob:.
    "img-src": ["'self'", "data:", "blob:"],
    "media-src": ["'self'", "blob:"],
    // Supabase REST, Auth (incl. starting Google sign-in) and Edge Functions.
    "connect-src": ["'self'", ...(supabase ? [supabase] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Path of the self-hosted Tesseract.js files (scripts/copy-tesseract.mjs). */
export const OCR_FILES_PATH = "/tesseract";

/**
 * Policy for the Tesseract.js worker and its files. The worker loads its core
 * script and language data from this site and compiles WebAssembly; nothing
 * else (no eval, no inline script, no other site, no images or frames).
 */
export const OCR_WORKER_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Headers for every response, including static files (next.config.ts).
 * frame-ancestors is enforced on its own from day one: it is only honoured in an
 * enforced policy, and blocking framing can't break anything.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
