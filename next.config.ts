import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { OCR_FILES_PATH, OCR_WORKER_CSP, SECURITY_HEADERS } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" header.
  poweredByHeader: false,
  // Security headers on every response, static files included. The full
  // Content-Security-Policy is added per request by src/proxy.ts (nonce).
  // The OCR worker's files get their own policy (later rules win for the same header).
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: `${OCR_FILES_PATH}/:path*`, headers: [{ key: "Content-Security-Policy", value: OCR_WORKER_CSP }] },
    ];
  },
};

// Keeps esbuild out of the server bundle; it builds the service worker.
export default withSerwist(nextConfig);
