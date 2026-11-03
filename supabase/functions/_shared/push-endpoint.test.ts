import { describe, expect, it } from "vitest";
import { isKnownPushEndpoint } from "./push-endpoint.ts";

describe("isKnownPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/dXZ1:APA91bH",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://web.push.apple.com/QGuQyavXutnMH7",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
  ])("accepts the real push service %s", (endpoint) => {
    expect(isKnownPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["another host", "https://evil.example/fcm/send/x"],
    ["a look-alike suffix", "https://fcm.googleapis.com.evil.example/x"],
    ["a look-alike prefix", "https://evilfcm.googleapis.com/x"],
    ["the push host only in the path", "https://evil.example/web.push.apple.com/x"],
    ["user info before the host", "https://fcm.googleapis.com@evil.example/x"],
    ["a port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
    ["no path", "https://fcm.googleapis.com"],
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/push"],
    ["not a URL", "fcm.googleapis.com/fcm/send/x"],
    ["empty", ""],
  ])("rejects %s", (_label, endpoint) => {
    expect(isKnownPushEndpoint(endpoint)).toBe(false);
  });
});
