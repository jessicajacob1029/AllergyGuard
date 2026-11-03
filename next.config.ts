import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { SECURITY_HEADERS } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" header.
  poweredByHeader: false,
  // Security headers on every response, static files included. The full
  // Content-Security-Policy is added per request by src/proxy.ts (nonce).
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

// Keeps esbuild out of the server bundle; it builds the service worker.
export default withSerwist(nextConfig);
