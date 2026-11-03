// What the service worker shows for a push message, and where a tap goes.
// Pure, so it is tested here and imported by src/app/sw.ts.
// The sender is supabase/functions/_shared/reminder-message.ts (PushPayload).

export type ShownNotification = {
  title: string;
  options: { body: string; tag: string; icon: string; badge: string; data: { url: string } };
};

const FALLBACK_URL = "/profile#medications";
const ICON = "/pwa-icon/192";

/** Only a path on this site: a push message must never open another website. */
export function safeAppPath(url: unknown): string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? url : FALLBACK_URL;
}

const text = (value: unknown, fallback: string, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

/** Turns the push message (JSON text, or nothing) into a notification. Never throws. */
export function notificationFromPush(raw: string | null): ShownNotification {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: show the generic reminder below.
  }
  return {
    title: text(data.title, "AllergyGuard", 120),
    options: {
      body: text(data.body, "You have a medication reminder.", 300),
      tag: text(data.tag, "allergyguard", 120),
      icon: ICON,
      badge: ICON,
      data: { url: safeAppPath(data.url) },
    },
  };
}

/** The page a tapped notification opens. */
export function clickTarget(data: unknown): string {
  return safeAppPath((data as { url?: unknown } | null)?.url);
}
