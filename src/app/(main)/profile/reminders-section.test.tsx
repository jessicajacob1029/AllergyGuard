// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushEnv } from "@/lib/push/support";

const invoke = vi.hoisted(() => vi.fn());
const countDevices = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    functions: { invoke },
    from: () => ({ select: countDevices }),
  }),
}));
vi.mock("@/lib/push/subscribe", () => ({
  currentEndpoint: vi.fn(),
  subscribeThisDevice: vi.fn(),
  unsubscribeThisDevice: vi.fn(async () => {}),
}));
vi.mock("@/lib/push/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push/support")>()),
  readPushEnv: vi.fn(),
}));
vi.mock("@/lib/reminders/settings", () => ({ saveReminderSettings: vi.fn(async () => ({ ok: true })) }));

const push = await import("@/lib/push/subscribe");
const support = await import("@/lib/push/support");
const settings = await import("@/lib/reminders/settings");
const { RemindersSection } = await import("./reminders-section");

const ANDROID: PushEnv = {
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0",
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  installed: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
};
const IPHONE_TAB: PushEnv = { ...ANDROID, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", platform: "iPhone", hasPushManager: false, hasNotification: false };

const props = {
  ownerId: "u1",
  initial: { pushEnabled: false, emailEnabled: true },
  email: "asha@example.com",
  vapidPublicKey: "BPublicKey",
  hasDatedMedication: true,
};

beforeEach(() => {
  vi.mocked(support.readPushEnv).mockReturnValue(ANDROID);
  vi.mocked(push.currentEndpoint).mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RemindersSection", () => {
  it("never asks for permission on its own: only the button does", async () => {
    render(<RemindersSection {...props} />);
    expect(await screen.findByRole("button", { name: "Turn on notifications" })).toBeTruthy();
    expect(screen.getByText(/Your browser will ask for permission after you tap the button/)).toBeTruthy();
    expect(push.subscribeThisDevice).not.toHaveBeenCalled();
  });

  it("turns notifications on after a tap and saves push as on", async () => {
    const user = userEvent.setup();
    vi.mocked(push.subscribeThisDevice).mockResolvedValue({ ok: true, endpoint: "https://push.example/1" });
    render(<RemindersSection {...props} />);
    await user.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(push.subscribeThisDevice).toHaveBeenCalledWith(expect.anything(), "BPublicKey");
    expect(settings.saveReminderSettings).toHaveBeenCalledWith(expect.anything(), "u1", { pushEnabled: true, emailEnabled: true });
    expect(await screen.findByText("Notifications are on for this device.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a test notification" })).toBeTruthy();
  });

  it("explains a blocked permission", async () => {
    const user = userEvent.setup();
    vi.mocked(push.subscribeThisDevice).mockResolvedValue({ ok: false, reason: "blocked", message: "Notifications are blocked for this site." });
    render(<RemindersSection {...props} />);
    await user.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Notifications are blocked for this site.");
    expect(screen.getByText(/To allow them, open your browser's site settings/)).toBeTruthy();
  });

  it("on iPhone in Safari, says to add the app to the Home Screen (iOS 16.4+) and offers no button", async () => {
    vi.mocked(support.readPushEnv).mockReturnValue(IPHONE_TAB);
    render(<RemindersSection {...props} />);
    expect(await screen.findByText(/add AllergyGuard to your Home Screen/)).toBeTruthy();
    expect(screen.getByText(/iOS 16.4 or later/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
  });

  it("sends a test notification to this device", async () => {
    const user = userEvent.setup();
    vi.mocked(push.currentEndpoint).mockResolvedValue("https://push.example/1");
    invoke.mockResolvedValue({ data: { delivered: 1, removed: 0 }, error: null });
    render(<RemindersSection {...props} />);
    await user.click(await screen.findByRole("button", { name: "Send a test notification" }));
    expect(invoke).toHaveBeenCalledWith("send-test-push", { body: { endpoint: "https://push.example/1" } });
    expect(await screen.findByText(/Test notification sent/)).toBeTruthy();
  });

  it("turning off the last device turns push off for the account", async () => {
    const user = userEvent.setup();
    vi.mocked(push.currentEndpoint).mockResolvedValue("https://push.example/1");
    countDevices.mockResolvedValue({ count: 0 });
    render(<RemindersSection {...props} initial={{ pushEnabled: true, emailEnabled: true }} />);
    await user.click(await screen.findByRole("button", { name: "Turn off on this device" }));
    expect(push.unsubscribeThisDevice).toHaveBeenCalled();
    expect(settings.saveReminderSettings).toHaveBeenCalledWith(expect.anything(), "u1", { pushEnabled: false, emailEnabled: true });
    expect(await screen.findByRole("button", { name: "Turn on notifications" })).toBeTruthy();
  });

  it("email reminders: an on/off switch that saves straight away", async () => {
    const user = userEvent.setup();
    render(<RemindersSection {...props} />);
    const toggle = screen.getByRole("switch", { name: "Email reminders" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Sent to asha@example.com")).toBeTruthy();
    await user.click(toggle);
    expect(settings.saveReminderSettings).toHaveBeenCalledWith(expect.anything(), "u1", { pushEnabled: false, emailEnabled: false });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(await screen.findByText("Email reminders are off.")).toBeTruthy();
  });

  it("says to add an expiry date when no medication has one", () => {
    render(<RemindersSection {...props} hasDatedMedication={false} />);
    expect(screen.getByText("Add an expiry date to a medication above to get reminders.")).toBeTruthy();
  });

  it("without a VAPID key on the server, says notifications aren't set up (email still works)", async () => {
    render(<RemindersSection {...props} vapidPublicKey={null} />);
    expect(await screen.findByText(/Notifications aren't set up yet/)).toBeTruthy();
  });
});
