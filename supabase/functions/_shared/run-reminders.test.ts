import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderStage } from "./reminder-stage.ts";
import type { DueMedication, PushDevice, ReminderDeps } from "./run-reminders.ts";
import { isGoneStatus, runReminders, secretsMatch } from "./run-reminders.ts";

const TODAY = "2026-11-01";
const due = (over: Partial<DueMedication> = {}): DueMedication => ({
  medicationId: "m1",
  profileId: "p1",
  ownerId: "u1",
  name: "EpiPen",
  dose: "0.3 mg",
  expiryDate: "2026-11-08", // 7 days after TODAY: the 7-day reminder
  sentStages: [],
  email: "owner@example.com",
  emailEnabled: true,
  pushEnabled: true,
  unsubscribeToken: "t".repeat(64),
  ...over,
});
const device = (id: string): PushDevice => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" });

type Status = "sending" | "delivered" | "failed";

/**
 * Fakes for every outside call. The "database" keeps one record per
 * medication + expiry date + stage, with the same rules as the real
 * claim_medication_reminder(): a new or FAILED record can be claimed; a
 * delivered or in-progress one can't. loadDue() reports delivered stages only,
 * like due_medication_reminders().
 */
function fakes(rows: DueMedication[], devices: PushDevice[] = [device("d1")]) {
  const records = new Map<string, { id: string; status: Status; stage: ReminderStage; medicationId: string; expiryDate: string; attempts: number }>();
  let live = [...devices];
  const deps = {
    appUrl: "https://app.example",
    loadDue: vi.fn(async () =>
      rows.map((r) => ({
        ...r,
        sentStages: [
          ...r.sentStages,
          ...[...records.values()]
            .filter((x) => x.medicationId === r.medicationId && x.expiryDate === r.expiryDate && x.status === "delivered")
            .map((x) => x.stage),
        ],
      })),
    ),
    loadDevices: vi.fn(async () => live),
    claim: vi.fn(async (r: { medicationId: string; expiryDate: string; stage: ReminderStage }) => {
      const key = `${r.medicationId}|${r.expiryDate}|${r.stage}`;
      const existing = records.get(key);
      if (existing && existing.status !== "failed") return null;
      const record = existing ?? { id: `rec-${records.size + 1}`, status: "sending" as Status, stage: r.stage, medicationId: r.medicationId, expiryDate: r.expiryDate, attempts: 0 };
      record.status = "sending";
      record.attempts++;
      records.set(key, record);
      return record.id;
    }),
    record: vi.fn(async (id: string, result: { delivered: boolean }) => {
      for (const rec of records.values()) if (rec.id === id) rec.status = result.delivered ? "delivered" : "failed";
    }),
    sendPush: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
    deleteDevice: vi.fn(async (id: string) => {
      live = live.filter((d) => d.id !== id);
    }),
    sendEmail: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
    records,
    /** Changes which rows the "database" returns (e.g. a later day). */
    setRows(next: DueMedication[]) {
      rows = next;
    },
  } satisfies ReminderDeps & Record<string, unknown>;
  return deps;
}

const pushFails = { ok: false, status: 500, message: "push service error" } as never;
const emailFails = { ok: false, message: "Resend 403: testing emails only" } as never;

let deps: ReturnType<typeof fakes>;
beforeEach(() => {
  deps = fakes([due()]);
});

describe("runReminders: sending", () => {
  it("sends the 7-day reminder by push, and no email when push was delivered", async () => {
    const report = await runReminders(deps, TODAY);
    expect(deps.claim).toHaveBeenCalledWith({ medicationId: "m1", profileId: "p1", expiryDate: "2026-11-08", stage: "7d" });
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect((deps.sendPush.mock.calls[0] as unknown[])[1]).toMatchObject({ title: "Your EpiPen expires in 7 days" });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(report.sent).toEqual([{ medicationId: "m1", stage: "7d", daysLeft: 7, push: "delivered 1 of 1", email: "not needed (push delivered)", delivered: true }]);
    expect(deps.record).toHaveBeenCalledWith("rec-1", { push: "delivered 1 of 1", email: "not needed (push delivered)", delivered: true });
  });

  it("falls back to email when push is off", async () => {
    deps = fakes([due({ pushEnabled: false })]);
    const report = await runReminders(deps, TODAY);
    expect(deps.sendPush).not.toHaveBeenCalled();
    const [to, email] = deps.sendEmail.mock.calls[0] as unknown as [string, { subject: string; text: string }];
    expect(to).toBe("owner@example.com");
    expect(email.subject).toBe("Your EpiPen expires in 7 days");
    expect(email.text).toContain(`https://app.example/unsubscribe?token=${"t".repeat(64)}`);
    expect(report.sent[0]).toMatchObject({ push: "off", email: "sent", delivered: true });
  });

  it("falls back to email when push is on but there are no devices", async () => {
    deps = fakes([due()], []);
    const report = await runReminders(deps, TODAY);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(report.sent[0]).toMatchObject({ push: "no devices", email: "sent", delivered: true });
  });

  it("never contacts a device whose address isn't a known push service; deletes it instead", async () => {
    deps = fakes([due()], [{ id: "evil", endpoint: "https://169.254.169.254/latest/meta-data", p256dh: "k", auth: "a" }, device("d1")]);
    const report = await runReminders(deps, TODAY);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect((deps.sendPush.mock.calls[0] as unknown[])[0]).toMatchObject({ id: "d1" });
    expect(deps.deleteDevice).toHaveBeenCalledWith("evil");
    expect(report.removedDevices).toBe(1);
    expect(report.sent[0]).toMatchObject({ push: "delivered 1 of 2", delivered: true });
  });

  it("deletes devices the push service reports as gone (404 and 410), then emails", async () => {
    deps = fakes([due()], [device("d404"), device("d410"), device("d500")]);
    deps.sendPush
      .mockResolvedValueOnce({ ok: false, status: 404, message: "Not Found" } as never)
      .mockResolvedValueOnce({ ok: false, status: 410, message: "Gone" } as never)
      .mockResolvedValueOnce(pushFails);
    const report = await runReminders(deps, TODAY);
    expect(deps.deleteDevice.mock.calls.map((c) => c[0])).toEqual(["d404", "d410"]);
    expect(report.removedDevices).toBe(2);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("runReminders: a reminder counts as sent only when a channel delivered it", () => {
  it("email fails with push off → recorded as failed, and retried on the next run", async () => {
    deps = fakes([due({ pushEnabled: false })]);
    deps.sendEmail.mockResolvedValueOnce(emailFails);
    const first = await runReminders(deps, TODAY);
    expect(first.sent[0]).toMatchObject({ stage: "7d", push: "off", email: "failed: Resend 403: testing emails only", delivered: false });
    expect(deps.record).toHaveBeenLastCalledWith("rec-1", { push: "off", email: "failed: Resend 403: testing emails only", delivered: false });

    // Next day (6 days left, still the 7-day window): the same record is retried and delivered.
    deps.setRows([due({ pushEnabled: false })]);
    const second = await runReminders(deps, "2026-11-02");
    expect(second.sent[0]).toMatchObject({ stage: "7d", daysLeft: 6, email: "sent", delivered: true });
    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
    expect([...deps.records.values()]).toMatchObject([{ id: "rec-1", status: "delivered", attempts: 2 }]);

    // And never again after that.
    const third = await runReminders(deps, "2026-11-03");
    expect(third.sent).toEqual([]);
    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("push succeeds and email would fail → delivered, not retried", async () => {
    deps.sendEmail.mockResolvedValue(emailFails);
    const first = await runReminders(deps, TODAY);
    expect(first.sent[0]).toMatchObject({ push: "delivered 1 of 1", delivered: true });
    const second = await runReminders(deps, TODAY);
    expect(second.sent).toEqual([]);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
  });

  it("push fails and email succeeds → delivered, not retried", async () => {
    deps.sendPush.mockResolvedValue(pushFails);
    const first = await runReminders(deps, TODAY);
    expect(first.sent[0]).toMatchObject({ push: "delivered 0 of 1", email: "sent", delivered: true });
    await runReminders(deps, TODAY);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("both channels work → sent once (push; the email isn't needed), even when the job runs again", async () => {
    await runReminders(deps, TODAY);
    const second = await runReminders(deps, TODAY);
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(second.sent).toEqual([]);
  });

  it("push and email both fail → failed, retried next run", async () => {
    deps.sendPush.mockResolvedValueOnce(pushFails);
    deps.sendEmail.mockResolvedValueOnce(emailFails);
    const first = await runReminders(deps, TODAY);
    expect(first.sent[0]).toMatchObject({ push: "delivered 0 of 1", delivered: false });
    const second = await runReminders(deps, TODAY);
    expect(second.sent[0]).toMatchObject({ stage: "7d", push: "delivered 1 of 1", delivered: true });
  });

  it("stops retrying once the window has passed: a failed 7-day reminder becomes the 1-day one", async () => {
    deps = fakes([due({ pushEnabled: false })]);
    deps.sendEmail.mockResolvedValueOnce(emailFails);
    await runReminders(deps, TODAY); // 7 days left: 7d fails
    const later = await runReminders(deps, "2026-11-07"); // 1 day left
    expect(later.sent).toEqual([expect.objectContaining({ stage: "1d", daysLeft: 1, delivered: true })]);
    expect(deps.claim).toHaveBeenLastCalledWith(expect.objectContaining({ stage: "1d" }));
  });

  it("skips a reminder another run is sending right now", async () => {
    deps.records.set("m1|2026-11-08|7d", { id: "rec-x", status: "sending", stage: "7d", medicationId: "m1", expiryDate: "2026-11-08", attempts: 1 });
    const report = await runReminders(deps, TODAY);
    expect(report.alreadyClaimed).toBe(1);
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});

describe("runReminders: what is skipped", () => {
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
