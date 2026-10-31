import { beforeEach, describe, expect, it, vi } from "vitest";

// The runner is tested on its own: reminderStage() (written separately, with
// its own tests) is replaced by a stand-in that knows two windows.
vi.mock("./reminder-stage.ts", () => ({
  reminderStage: (daysLeft: number, sent: string[]) => {
    const stage = daysLeft === 7 ? "7d" : daysLeft === 0 ? "today" : null;
    return stage && !sent.includes(stage) ? stage : null;
  },
}));

import type { DueMedication, PushDevice, ReminderDeps } from "./run-reminders.ts";
import { isGoneStatus, runReminders, secretsMatch } from "./run-reminders.ts";

const TODAY = "2026-11-01";
const due = (over: Partial<DueMedication> = {}): DueMedication => ({
  medicationId: "m1",
  profileId: "p1",
  ownerId: "u1",
  name: "EpiPen",
  dose: "0.3 mg",
  expiryDate: "2026-11-08", // 7 days after TODAY
  sentStages: [],
  email: "owner@example.com",
  emailEnabled: true,
  pushEnabled: true,
  unsubscribeToken: "t".repeat(64),
  ...over,
});
const device = (id: string): PushDevice => ({ id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" });

function fakes(rows: DueMedication[], devices: PushDevice[] = [device("d1")]) {
  const claimed = new Set<string>();
  let live = [...devices];
  const deps = {
    appUrl: "https://app.example",
    loadDue: vi.fn(async () => rows),
    loadDevices: vi.fn(async () => live),
    claim: vi.fn(async (r: { medicationId: string; expiryDate: string; stage: string }) => {
      const key = `${r.medicationId}|${r.expiryDate}|${r.stage}`;
      if (claimed.has(key)) return null;
      claimed.add(key);
      return `claim-${claimed.size}`;
    }),
    record: vi.fn(async () => {}),
    sendPush: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
    deleteDevice: vi.fn(async (id: string) => {
      live = live.filter((d) => d.id !== id);
    }),
    sendEmail: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
  } satisfies ReminderDeps;
  return deps;
}

let deps: ReturnType<typeof fakes>;
beforeEach(() => {
  deps = fakes([due()]);
});

describe("runReminders", () => {
  it("sends the 7-day reminder by push, and no email when push was delivered", async () => {
    const report = await runReminders(deps, TODAY);
    expect(deps.claim).toHaveBeenCalledWith({ medicationId: "m1", profileId: "p1", expiryDate: "2026-11-08", stage: "7d" });
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect((deps.sendPush.mock.calls[0] as unknown[])[1]).toMatchObject({ title: "Your EpiPen expires in 7 days" });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(report.sent).toEqual([{ medicationId: "m1", stage: "7d", daysLeft: 7, push: "delivered 1 of 1", email: "not needed (push delivered)" }]);
    expect(deps.record).toHaveBeenCalledWith("claim-1", { push: "delivered 1 of 1", email: "not needed (push delivered)" });
  });

  it("never sends the same reminder twice, even when the job runs again", async () => {
    await runReminders(deps, TODAY);
    const second = await runReminders(deps, TODAY);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(second.sent).toEqual([]);
    expect(second.alreadyClaimed).toBe(1);
  });

  it("claims before sending, so a failed send isn't retried", async () => {
    deps.sendPush.mockResolvedValueOnce({ ok: false, status: 500, message: "boom" } as never);
    deps.sendEmail.mockResolvedValueOnce({ ok: false, message: "Resend said no" } as never);
    const report = await runReminders(deps, TODAY);
    expect(report.sent[0]).toMatchObject({ push: "delivered 0 of 1", email: "failed: Resend said no" });
    await runReminders(deps, TODAY);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
  });

  it("falls back to email when push is off", async () => {
    deps = fakes([due({ pushEnabled: false })]);
    const report = await runReminders(deps, TODAY);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const [to, email] = deps.sendEmail.mock.calls[0] as unknown as [string, { subject: string; text: string }];
    expect(to).toBe("owner@example.com");
    expect(email.subject).toBe("Your EpiPen expires in 7 days");
    expect(email.text).toContain(`https://app.example/unsubscribe?token=${"t".repeat(64)}`);
    expect(report.sent[0]).toMatchObject({ push: "off", email: "sent" });
  });

  it("falls back to email when push is on but there are no devices", async () => {
    deps = fakes([due()], []);
    const report = await runReminders(deps, TODAY);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(report.sent[0]).toMatchObject({ push: "no devices", email: "sent" });
  });

  it("deletes devices the push service reports as gone (404 and 410), then emails", async () => {
    deps = fakes([due()], [device("d404"), device("d410"), device("d500")]);
    deps.sendPush
      .mockResolvedValueOnce({ ok: false, status: 404, message: "Not Found" } as never)
      .mockResolvedValueOnce({ ok: false, status: 410, message: "Gone" } as never)
      .mockResolvedValueOnce({ ok: false, status: 500, message: "Server error" } as never);
    const report = await runReminders(deps, TODAY);
    expect(deps.deleteDevice.mock.calls.map((c) => c[0])).toEqual(["d404", "d410"]);
    expect(report.removedDevices).toBe(2);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips medications with no expiry date", async () => {
    deps = fakes([due({ expiryDate: null }), due({ medicationId: "m2", expiryDate: "" })]);
    const report = await runReminders(deps, TODAY);
    expect(report.skippedNoExpiry).toBe(2);
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("sends nothing and claims nothing when both push and email are off", async () => {
    deps = fakes([due({ pushEnabled: false, emailEnabled: false })]);
    const report = await runReminders(deps, TODAY);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(report.sent).toEqual([]);
  });

  it("doesn't email an address that isn't confirmed (null)", async () => {
    deps = fakes([due({ pushEnabled: false, email: null })]);
    await runReminders(deps, TODAY);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("works out days left from the IST date it is given", async () => {
    deps = fakes([due({ expiryDate: "2026-11-01" })]);
    const report = await runReminders(deps, "2026-11-01");
    expect(report.sent[0]).toMatchObject({ stage: "today", daysLeft: 0 });
  });

  it("dry run: lists what would be sent, without claiming or sending", async () => {
    const report = await runReminders(deps, TODAY, { dryRun: true });
    expect(report.sent).toEqual([{ medicationId: "m1", stage: "7d", daysLeft: 7, push: "would send", email: "if push not delivered" }]);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a date that isn't YYYY-MM-DD", async () => {
    await expect(runReminders(deps, "1 Nov 2026")).rejects.toThrow();
  });
});

describe("isGoneStatus", () => {
  it("is true only for 404 and 410", () => {
    expect([404, 410, 400, 401, 403, 413, 429, 500, null].map(isGoneStatus)).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});

describe("secretsMatch", () => {
  it("matches only the exact secret", () => {
    const secret = "s".repeat(48);
    expect(secretsMatch(secret, secret)).toBe(true);
    expect(secretsMatch(`${secret}x`, secret)).toBe(false);
    expect(secretsMatch(secret.slice(1), secret)).toBe(false);
    expect(secretsMatch("", secret)).toBe(false);
    expect(secretsMatch(null, secret)).toBe(false);
    // No secret configured on the server: reject everything.
    expect(secretsMatch(secret, undefined)).toBe(false);
    expect(secretsMatch(secret, "")).toBe(false);
  });
});
