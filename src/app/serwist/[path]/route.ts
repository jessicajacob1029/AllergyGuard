import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// /emergency and /~offline aren't under _next/static, so they need an explicit
// revision. A fresh one per build makes every deploy re-fetch both pages
// (two small HTML files), so the cached copy never lags the deployed one.
const revision = randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  // Serwist's default globs plus woff2: without it the self-hosted font files (DM Sans, Space Mono)
  // are never precached and /emergency falls back to a system font offline.
  globPatterns: [
    ".next/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest,woff2}",
    "public/**/*",
  ],
  additionalPrecacheEntries: [
    { url: "/emergency", revision },
    { url: "/~offline", revision },
  ],
});
