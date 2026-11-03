// Turning push on and off for this browser. Browser only: called from a tap
// (Profile → Reminders), never on page load.

import type { SupabaseClient } from "@supabase/supabase-js";

/** VAPID public key (base64url) → the bytes PushManager.subscribe() wants. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type SubscribeResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "blocked" | "dismissed" | "unavailable" | "failed"; message: string };

/** How long to wait for the service worker and the push service before giving up. */
export const SUBSCRIBE_TIMEOUT_MS = 15_000;

export const UNAVAILABLE_MESSAGE = "Notifications aren't available here right now. Email reminders still work.";

class TimeoutError extends Error {}

/** Rejects with a TimeoutError if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Asks for permission (must run from a tap: iOS refuses otherwise), subscribes
 * with our service worker and saves the device with save_push_subscription().
 * Never waits forever: if the service worker or the push service doesn't answer
 * within SUBSCRIBE_TIMEOUT_MS (e.g. no service worker on this page, or a login
 * wall in front of it), it gives up with UNAVAILABLE_MESSAGE.
 */
export async function subscribeThisDevice(
  supabase: SupabaseClient,
  vapidPublicKey: string,
  timeoutMs: number = SUBSCRIBE_TIMEOUT_MS,
): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { ok: false, reason: "blocked", message: "Notifications are blocked for this site." };
  }
  if (permission !== "granted") {
    return { ok: false, reason: "dismissed", message: "Notifications weren't turned on. Tap the button to try again." };
  }
  let subscription: PushSubscription;
  try {
    subscription = await withTimeout(
      (async () => {
        if (!("serviceWorker" in navigator)) throw new TimeoutError("No service worker support");
        const registration = await navigator.serviceWorker.ready;
        return (
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }))
        );
      })(),
      timeoutMs,
    );
  } catch (error) {
    console.error("Notifications unavailable", error);
    return { ok: false, reason: "unavailable", message: UNAVAILABLE_MESSAGE };
  }
  try {
    const json = subscription.toJSON();
    const { error } = await supabase.rpc("save_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: json.keys?.p256dh ?? "",
      p_auth_key: json.keys?.auth ?? "",
      p_user_agent: navigator.userAgent,
    });
    if (error) throw error;
    return { ok: true, endpoint: subscription.endpoint };
  } catch (error) {
    console.error("Couldn't turn on notifications", error);
    return { ok: false, reason: "failed", message: "Couldn't turn on notifications. Check your connection and try again." };
  }
}

/** This browser's current push subscription endpoint, if any. */
export async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  return subscription?.endpoint ?? null;
}

/** Stops push on this browser and deletes its row (RLS: own rows only). Never throws. */
export async function unsubscribeThisDevice(supabase: SupabaseClient): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch (error) {
    console.error("Couldn't turn off notifications on this device", error);
  }
}
