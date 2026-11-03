import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { isUnsubscribeToken, unsubscribeEmail } from "@/lib/reminders/unsubscribe";
import { GET, POST } from "./route";

const TOKEN = "0123456789abcdef".repeat(4);
const req = (method: string, query: string) => new NextRequest(`https://app.example/api/unsubscribe${query}`, { method });

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

describe("unsubscribe tokens", () => {
  it("are 64 lowercase hex characters (32 random bytes)", () => {
    expect(isUnsubscribeToken(TOKEN)).toBe(true);
    expect(isUnsubscribeToken(TOKEN.slice(1))).toBe(false);
    expect(isUnsubscribeToken(TOKEN.toUpperCase())).toBe(false);
    expect(isUnsubscribeToken("' or 1=1 --")).toBe(false);
    expect(isUnsubscribeToken(null)).toBe(false);
  });

  it("never calls the database with a malformed token", async () => {
    expect(await unsubscribeEmail({ rpc } as never, "nope")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("one-click unsubscribe (POST from mail apps)", () => {
  it("turns email reminders off without a login", async () => {
    const res = await POST(req("POST", `?token=${TOKEN}`));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("unsubscribe_email", { p_token: TOKEN });
  });

  it("answers the same for an unknown token", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(req("POST", `?token=${TOKEN}`))).status).toBe(200);
  });

  it("rejects a malformed token", async () => {
    expect((await POST(req("POST", "?token=abc"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("product change alert links (kind=product-alerts)", () => {
  it("one click turns off product change alerts only", async () => {
    const res = await POST(req("POST", `?kind=product-alerts&token=${TOKEN}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Product change alerts are off.");
    expect(rpc).toHaveBeenCalledWith("unsubscribe_product_alerts", { p_token: TOKEN });
    expect(rpc).not.toHaveBeenCalledWith("unsubscribe_email", expect.anything());
  });

  it("an unknown kind is treated as a medication reminder link", async () => {
    await POST(req("POST", `?kind=everything&token=${TOKEN}`));
    expect(rpc).toHaveBeenCalledWith("unsubscribe_email", { p_token: TOKEN });
  });

  it("opening it goes to the confirm page and keeps the kind", () => {
    const res = GET(req("GET", `?kind=product-alerts&token=${TOKEN}`));
    expect(res.headers.get("location")).toBe(`https://app.example/unsubscribe?kind=product-alerts&token=${TOKEN}`);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("opening the one-click URL (GET)", () => {
  it("goes to the confirm page and changes nothing", async () => {
    const res = GET(req("GET", `?token=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.example/unsubscribe?token=${TOKEN}`);
    expect(rpc).not.toHaveBeenCalled();
  });
});
