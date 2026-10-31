/// <reference lib="webworker" />
// Service worker, bundled by @serwist/turbopack (see app/serwist/[path]).
//
// Caching rules (Phase 2):
// - Precached at install, served cache-first: /emergency, /~offline, and the
//   build's static files (_next/static JS/CSS/fonts, public/). None of these
//   contain user data; /emergency reads its data from Dexie.
// - Every other page: network only. Signed-in HTML and RSC payloads are never
//   stored, so no cache holds user content. Offline, a page load falls back
//   to /~offline, which links to /emergency.
// - Supabase and other cross-origin requests aren't intercepted at all.
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { clickTarget, notificationFromPush } from "../lib/push/notification";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    {
      // Static chunks from a newer deploy than the precache. Content-hashed
      // file names, so cache-first is safe.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// Phase 7: medication expiry reminders (web push). Shows the notification the
// server sent, and opens the app on a tap. Nothing here caches anything or
// touches /emergency or its offline data.
self.addEventListener("push", (event) => {
  const { title, options } = notificationFromPush(event.data?.text() ?? null);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(clickTarget(event.notification.data), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        await open.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
