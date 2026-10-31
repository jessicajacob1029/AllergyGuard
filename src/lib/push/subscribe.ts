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
  | { ok: false; reason: "blocked" | "dismissed" | "failed"; message: string };

/**
 * Asks for permission (must run from a tap: iOS refuses otherwise), subscribes
 * with our service worker and saves the device with save_push_subscription().
 */
export async function subscribeThisDevice(supabase: SupabaseClient, vapidPublicKey: string): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { ok: false, reason: "blocked", message: "Notifications are blocked for this site." };
  }
  if (permission !== "granted") {
    return { ok: false, reason: "dismissed", message: "Notifications weren't turned on. Tap the button to try again." };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
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
