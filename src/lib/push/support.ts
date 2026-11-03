// Can this device get push notifications, and if not, what should we say?
// Pure: the component reads the browser and passes the facts in.

import { isIos } from "@/lib/offline/install-hint";

export type PushEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** navigator.standalone (iOS) or display-mode: standalone. */
  installed: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Notification.permission, when the API exists. */
  permission: NotificationPermission | null;
};

export type PushSupport =
  /** Push works here; permission not asked yet (or asked and dismissed). */
  | "can-ask"
  /** The user allowed notifications for this site. */
  | "granted"
  /** The user blocked notifications: only the browser or phone settings can undo it. */
  | "blocked"
  /** iPhone/iPad in a Safari tab: push only works from the Home Screen app (iOS 16.4+). */
  | "ios-needs-install"
  /** iPhone/iPad Home Screen app on iOS below 16.4, or a browser without push. */
  | "unsupported";

export function pushSupport(env: PushEnv): PushSupport {
  const apis = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (!apis) {
    // In a Safari tab iOS hides PushManager; installed on 16.4+ it has it.
    return isIos({ ...env, dismissed: false }) && !env.installed ? "ios-needs-install" : "unsupported";
  }
  if (env.permission === "granted") return "granted";
  if (env.permission === "denied") return "blocked";
  return "can-ask";
}

/** Reads the facts from the real browser (call after hydration). */
export function readPushEnv(): PushEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  const hasNotification = typeof Notification !== "undefined";
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    installed:
      nav.standalone === true || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches),
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : null,
  };
}
