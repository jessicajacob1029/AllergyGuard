import { describe, expect, it, vi } from "vitest";
import type { FetchResult, Product } from "../../../src/lib/products/open-food-facts.ts";
import {
  BRAKE_MIN,
  MAX_FAILURES_IN_A_ROW,
  POLITE_DELAY_MS,
  runProductAlertRetries,
  runProductCheck,
  shouldHold,
  type DueWatch,
  type ProductAlertDeps,
  type RetryAlert,
} from "./run-product-alerts.ts";

const product = (ingredientsText: string | null, more: Partial<Product> = {}): Product => ({
  found: true,
  name: "Choco spread",
  brands: "Brand",
  ingredientsText,
  incomplete: false,
  notes: [],
  declared: { contains: [], mayContain: [] },
  lastModified: "2026-11-01T00:00:00.000Z",
  ...more,
});

let n = 0;
const watch = (barcode: string, snapshotText: string, more: Partial<DueWatch> = {}): DueWatch => ({
  watchId: `w${++n}`,
  profileId: "p1",
  ownerId: "o1",
  barcode,
  productName: "Choco spread",
  brands: "Brand",
  snapshot: { ingredientsText: snapshotText, contains: [], mayContain: [], incomplete: false },
  allergens: [{ kind: "predefined", code: "milk" }],
  email: "a@example.com",
  emailEnabled: true,
  pushEnabled: true,
  unsubscribeToken: "a".repeat(64),
  ...more,
});

const DEVICE = { id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a" };

function fakes(watches: DueWatch[], answers: Record<string, FetchResult>, over: Partial<ProductAlertDeps> = {}) {
  const base = {
    loadDue: vi.fn(async () => watches),
    fetchProduct: vi.fn(async (barcode: string) => answers[barcode] ?? { ok: false as const, reason: "network" as const }),
    sleep: vi.fn(async () => {}),
    recordCheck: vi.fn(async () => {}),
    claimAlert: vi.fn(async () => "alert-1" as string | null),
    recordAlert: vi.fn(async () => {}),
    loadRetries: vi.fn(async () => [] as RetryAlert[]),
    claimRetry: vi.fn(async () => true),
    loadDevices: vi.fn(async () => [DEVICE]),
    sendPush: vi.fn(async () => ({ ok: true as const })),
    deleteDevice: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => ({ ok: true as const })),
    hash: vi.fn(async (text: string) => `h(${text.length})`),
    flagHeld: vi.fn(async () => {}),
    appUrl: "https://app.example",
  } satisfies ProductAlertDeps;
  // Overrides are vi.fn() too, so the mock helpers stay usable.
  return { ...base, ...over } as typeof base;
}

const found = (p: Product): FetchResult => ({ ok: true, product: p });

describe("runProductCheck: being polite to Open Food Facts", () => {
  it("asks once per barcode, even when several profiles watch it, and waits between requests", async () => {
    const deps = fakes(
      [watch("111", "sugar"), watch("111", "sugar", { profileId: "p2" }), watch("222", "sugar"), watch("333", "sugar")],
      { "111": found(product("sugar")), "222": found(product("sugar")), "333": found(product("sugar")) },
    );
    const r = await runProductCheck(deps);
    expect(deps.fetchProduct.mock.calls.map((c) => c[0])).toEqual(["111", "222", "333"]);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(POLITE_DELAY_MS);
    expect(r.checked).toBe(3);
    expect(r.decisions).toHaveLength(4);
  });

  it("stops the whole run on 'too many requests', and records nothing for the rest", async () => {
    const deps = fakes([watch("111", "sugar"), watch("222", "sugar"), watch("333", "sugar")], {
      "111": found(product("sugar")),
      "222": { ok: false, reason: "rate_limited" },
      "333": found(product("sugar")),
    });
    const r = await runProductCheck(deps);
    expect(r.stopped).toBe("rate_limited");
    expect(deps.fetchProduct).toHaveBeenCalledTimes(2);
    expect(r.unreachable).toEqual(["222"]);
    expect(deps.recordCheck).toHaveBeenCalledTimes(1);
  });

  it(`stops after ${MAX_FAILURES_IN_A_ROW} failures in a row; a failure never changes a watch`, async () => {
    const watches = ["1", "2", "3", "4", "5"].map((b) => watch(`10000000${b}`, "sugar"));
    const deps = fakes(watches, {});
    const r = await runProductCheck(deps);
    expect(r.stopped).toBe("too_many_failures");
    expect(deps.fetchProduct).toHaveBeenCalledTimes(MAX_FAILURES_IN_A_ROW);
    expect(deps.recordCheck).not.toHaveBeenCalled();
    expect(deps.claimAlert).not.toHaveBeenCalled();
  });
});

describe("runProductCheck: what happens to each watch", () => {
  it("unchanged (formatting only): recorded, snapshot kept, no alert", async () => {
    const w = watch("111", "Sugar, cocoa");
    const deps = fakes([w], { "111": found(product("sugar cocoa.")) });
    await runProductCheck(deps);
    expect(deps.recordCheck).toHaveBeenCalledWith(w.watchId, "unchanged", undefined);
    expect(deps.claimAlert).not.toHaveBeenCalled();
  });

  it("improved: the snapshot moves on quietly", async () => {
    const w = watch("111", "sugar, milk");
    const p = product("sugar, oat drink");
    const deps = fakes([w], { "111": found(p) });
    await runProductCheck(deps);
    expect(deps.recordCheck).toHaveBeenCalledWith(w.watchId, "improved", p);
    expect(deps.claimAlert).not.toHaveBeenCalled();
  });

  it("not on Open Food Facts any more, or no ingredient list: no alert, snapshot kept", async () => {
    const a = watch("111", "sugar");
    const b = watch("222", "sugar");
    const deps = fakes([a, b], { "111": { ok: true, product: { found: false } }, "222": found(product(null)) });
    await runProductCheck(deps);
    expect(deps.recordCheck).toHaveBeenCalledWith(a.watchId, "not_found", undefined);
    expect(deps.recordCheck).toHaveBeenCalledWith(b.watchId, "no_ingredients", undefined);
    expect(deps.claimAlert).not.toHaveBeenCalled();
  });

  it("worse: claims the alert, moves the snapshot, sends a push, and doesn't email", async () => {
    const w = watch("111", "sugar, cocoa");
    const p = product("sugar, cocoa, whey");
    const deps = fakes([w], { "111": found(p) });
    const r = await runProductCheck(deps);

    expect(deps.claimAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        watched_product_id: w.watchId,
        old_verdict: "safe",
        new_verdict: "unsafe",
        summary: "now lists milk (whey)",
        ingredients_text: "sugar, cocoa, whey",
      }),
    );
    expect(deps.recordCheck).toHaveBeenCalledWith(w.watchId, "alerted", p);
    const order = [deps.claimAlert, deps.recordCheck, deps.sendPush].map((f) => f.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((x, y) => x - y));

    const [, payload] = deps.sendPush.mock.calls[0] as unknown as [unknown, { title: string; body: string; url: string }];
    expect(payload.title).toBe("Choco spread has changed: now Unsafe for you");
    expect(payload.body).toContain("Open Food Facts now lists milk (whey).");
    expect(payload.body).toContain("always check the packet");
    expect(payload.url).toBe("/scans/changes/alert-1");
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.recordAlert).toHaveBeenCalledWith("alert-1", {
      push: "delivered 1 of 1",
      email: "not needed (push delivered)",
      delivered: true,
    });
    expect(r.alerted).toBe(1);
  });

  it("never twice: an already-claimed change sends nothing", async () => {
    const deps = fakes([watch("111", "sugar")], { "111": found(product("sugar, milk")) }, { claimAlert: vi.fn(async () => null) });
    await runProductCheck(deps);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.recordAlert).not.toHaveBeenCalled();
  });

  it("push fails: emails instead, with the product-alerts unsubscribe link", async () => {
    const deps = fakes([watch("111", "sugar")], { "111": found(product("sugar, milk")) }, {
      sendPush: vi.fn(async () => ({ ok: false as const, status: 500, message: "down" })),
    });
    await runProductCheck(deps);
    const [to, email] = deps.sendEmail.mock.calls[0] as unknown as [string, { subject: string; text: string; headers: Record<string, string> }];
    expect(to).toBe("a@example.com");
    expect(email.subject).toBe("Choco spread has changed: now Unsafe for you");
    expect(email.text).toContain("https://app.example/scans/changes/alert-1");
    expect(email.text).toContain("kind=product-alerts");
    expect(email.headers["List-Unsubscribe"]).toContain("/api/unsubscribe?kind=product-alerts&token=");
    expect(deps.recordAlert).toHaveBeenCalledWith("alert-1", expect.objectContaining({ email: "sent", delivered: true }));
  });

  it("every channel failed: marked failed, so the daily retry tries again", async () => {
    const deps = fakes([watch("111", "sugar")], { "111": found(product("sugar, milk")) }, {
      sendPush: vi.fn(async () => ({ ok: false as const, status: 500, message: "down" })),
      sendEmail: vi.fn(async () => ({ ok: false as const, message: "Resend 500" })),
    });
    await runProductCheck(deps);
    expect(deps.recordAlert).toHaveBeenCalledWith("alert-1", expect.objectContaining({ delivered: false }));
  });

  it("no channel to try (push off, email off): the in-app banner is the delivery", async () => {
    const deps = fakes([watch("111", "sugar", { pushEnabled: false, emailEnabled: false })], {
      "111": found(product("sugar, milk")),
    });
    await runProductCheck(deps);
    expect(deps.recordAlert).toHaveBeenCalledWith("alert-1", { push: "off", email: "off", delivered: true });
  });

  it("dry run: asks Open Food Facts and reports, but writes and sends nothing", async () => {
    const deps = fakes([watch("111", "sugar")], { "111": found(product("sugar, milk")) });
    const r = await runProductCheck(deps, { dryRun: true });
    expect(r.decisions[0]).toMatchObject({ status: "alerted", summary: "now lists milk", oldVerdict: "safe", newVerdict: "unsafe" });
    for (const f of [deps.recordCheck, deps.claimAlert, deps.sendPush, deps.sendEmail, deps.recordAlert, deps.flagHeld]) {
      expect(f).not.toHaveBeenCalled();
    }
  });
});

describe("the safety brake", () => {
  it("holds only when more than 20% of checked products, and at least 5, would alert", () => {
    expect(shouldHold(BRAKE_MIN, 10)).toBe(true); // 50%
    expect(shouldHold(5, 30)).toBe(false); // 17%
    expect(shouldHold(6, 30)).toBe(false); // exactly 20% is not more than 20%
    expect(shouldHold(7, 30)).toBe(true);
    expect(shouldHold(4, 4)).toBe(false); // fewer than 5
    expect(shouldHold(0, 0)).toBe(false);
  });

  it("sends nothing, keeps the snapshots, marks the watches held and flags the owner", async () => {
    const barcodes = Array.from({ length: 10 }, (_, i) => `2000000000${String(i).padStart(3, "0")}`);
    const watches = barcodes.map((b) => watch(b, "sugar"));
    const answers: Record<string, FetchResult> = {};
    barcodes.forEach((b, i) => (answers[b] = found(product(i < 5 ? "sugar, milk" : "sugar"))));
    const deps = fakes(watches, answers);

    const r = await runProductCheck(deps);
    expect(r.held).toBe(true);
    expect(r.wouldAlert).toBe(5);
    expect(deps.claimAlert).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.flagHeld).toHaveBeenCalledWith(r);
    const held = deps.recordCheck.mock.calls.filter((c) => (c as unknown[])[1] === "held");
    expect(held).toHaveLength(5);
    for (const c of held) expect((c as unknown[])[2]).toBeUndefined(); // snapshot kept
  });

  it("counts products, not profiles: one product watched by many people is one", async () => {
    const watches = Array.from({ length: 6 }, (_, i) => watch("111", "sugar", { profileId: `p${i}` }));
    const deps = fakes(watches, { "111": found(product("sugar, milk")) });
    const r = await runProductCheck(deps);
    expect(r.wouldAlert).toBe(1);
    expect(r.held).toBe(false);
    expect(deps.claimAlert).toHaveBeenCalledTimes(6);
  });
});

describe("runProductAlertRetries", () => {
  const failed = (id: string): RetryAlert => ({
    alertId: id,
    ownerId: "o1",
    productName: "Choco spread",
    barcode: "111",
    oldVerdict: "safe",
    newVerdict: "unsafe",
    summary: "now lists milk",
    explanation: "Contains Milk.",
    email: "a@example.com",
    emailEnabled: true,
    pushEnabled: true,
    unsubscribeToken: "a".repeat(64),
  });

  it("sends each failed alert again and records the result; skips ones another run claimed", async () => {
    const deps = fakes([], {}, {
      loadRetries: vi.fn(async () => [failed("x"), failed("y")]),
      claimRetry: vi.fn(async (id: string) => id === "x"),
    });
    const r = await runProductAlertRetries(deps);
    expect(r).toMatchObject({ retried: 1, delivered: 1, failed: 0 });
    expect(deps.recordAlert).toHaveBeenCalledWith("x", expect.objectContaining({ delivered: true }));
    expect(deps.fetchProduct).not.toHaveBeenCalled();
  });

  it("dry run claims and sends nothing", async () => {
    const deps = fakes([], {}, { loadRetries: vi.fn(async () => [failed("x")]) });
    const r = await runProductAlertRetries(deps, { dryRun: true });
    expect(r.retried).toBe(1);
    expect(deps.claimRetry).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
