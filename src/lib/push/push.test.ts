import { describe, expect, it, vi } from "vitest";
import { clickTarget, notificationFromPush, safeAppPath } from "./notification";
import { urlBase64ToUint8Array } from "./subscribe";
import { pushSupport, type PushEnv } from "./support";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  userAgent: ANDROID,
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  installed: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  ...over,
});

describe("pushSupport", () => {
  it("Android or desktop with push: can ask; then granted or blocked", () => {
    expect(pushSupport(env())).toBe("can-ask");
    expect(pushSupport(env({ permission: "granted" }))).toBe("granted");
    expect(pushSupport(env({ permission: "denied" }))).toBe("blocked");
  });

  it("iPhone in a Safari tab (no PushManager): add to Home Screen first", () => {
    expect(pushSupport(env({ userAgent: IPHONE, platform: "iPhone", hasPushManager: false, hasNotification: false }))).toBe("ios-needs-install");
  });

  it("iPhone Home Screen app on iOS 16.4+ (has PushManager): can ask", () => {
    expect(pushSupport(env({ userAgent: IPHONE, platform: "iPhone", installed: true }))).toBe("can-ask");
  });

  it("iPhone Home Screen app on older iOS (no PushManager): unsupported", () => {
    expect(pushSupport(env({ userAgent: IPHONE, platform: "iPhone", installed: true, hasPushManager: false }))).toBe("unsupported");
  });

  it("iPad (reports itself as a Mac with touch) in Safari: add to Home Screen first", () => {
    expect(pushSupport(env({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5, hasPushManager: false }))).toBe("ios-needs-install");
  });

  it("a desktop browser without push: unsupported", () => {
    expect(pushSupport(env({ platform: "Win32", maxTouchPoints: 0, hasPushManager: false }))).toBe("unsupported");
  });
});

describe("notificationFromPush", () => {
  it("shows the reminder from the push message", () => {
    const shown = notificationFromPush(JSON.stringify({ title: "Your EpiPen expires in 7 days", body: "Replace it.", tag: "medication-m1-2026-11-08", url: "/profile#medications" }));
    expect(shown).toEqual({
      title: "Your EpiPen expires in 7 days",
      options: { body: "Replace it.", tag: "medication-m1-2026-11-08", icon: "/pwa-icon/192", badge: "/pwa-icon/192", data: { url: "/profile#medications" } },
    });
  });

  it("still shows something for an empty or broken message", () => {
    for (const raw of [null, "", "not json", "42"]) {
      const shown = notificationFromPush(raw);
      expect(shown.title).toBe("AllergyGuard");
      expect(shown.options.body).toBe("You have a medication reminder.");
      expect(shown.options.data.url).toBe("/profile#medications");
    }
  });

  it("never opens another website", () => {
    expect(safeAppPath("https://evil.example")).toBe("/profile#medications");
    expect(safeAppPath("//evil.example")).toBe("/profile#medications");
    expect(safeAppPath("/\\evil.example")).toBe("/profile#medications");
    expect(safeAppPath("javascript:alert(1)")).toBe("/profile#medications");
    expect(safeAppPath("/profile#reminders")).toBe("/profile#reminders");
    expect(clickTarget({ url: "https://evil.example" })).toBe("/profile#medications");
    expect(clickTarget(null)).toBe("/profile#medications");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key without padding", () => {
    expect([...urlBase64ToUint8Array("AQID-_8")]).toEqual([1, 2, 3, 251, 255]);
    expect(urlBase64ToUint8Array("A".repeat(87)).length).toBe(65); // a P-256 public key
  });
});

describe("subscribeThisDevice: never spins forever", () => {
  it("gives up after the timeout when the service worker never becomes ready", async () => {
    const { subscribeThisDevice, UNAVAILABLE_MESSAGE } = await import("./subscribe");
    const rpc = vi.fn();
    vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
    vi.stubGlobal("navigator", { userAgent: "test", serviceWorker: { ready: new Promise(() => {}) } });
    try {
      const started = Date.now();
      const result = await subscribeThisDevice({ rpc } as never, "AQID", 30);
      expect(result).toEqual({ ok: false, reason: "unavailable", message: UNAVAILABLE_MESSAGE });
      expect(UNAVAILABLE_MESSAGE).toBe("Notifications aren't available here right now. Email reminders still work.");
      expect(Date.now() - started).toBeLessThan(1000);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is unavailable straight away in a browser without service workers", async () => {
    const { subscribeThisDevice } = await import("./subscribe");
    vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
    vi.stubGlobal("navigator", { userAgent: "test" });
    try {
      expect((await subscribeThisDevice({ rpc: vi.fn() } as never, "AQID", 5000)).ok).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a 15 second timeout by default", async () => {
    const { SUBSCRIBE_TIMEOUT_MS, withTimeout } = await import("./subscribe");
    expect(SUBSCRIBE_TIMEOUT_MS).toBe(15_000);
    await expect(withTimeout(Promise.resolve(1), 10)).resolves.toBe(1);
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow("Timed out after 10 ms");
  });
});
