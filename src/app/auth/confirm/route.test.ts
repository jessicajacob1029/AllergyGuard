import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

// next/navigation's redirect throws; mimic that so the handler stops at the first redirect.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { GET } from "./route";

async function visit(query: string): Promise<string> {
  try {
    await GET(new NextRequest(`https://example.test/auth/confirm${query}`));
  } catch (e) {
    return (e as Error).message.replace("REDIRECT ", "");
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
});

describe("/auth/confirm", () => {
  it("verifies a token_hash link and goes to next", async () => {
    expect(await visit("?token_hash=abc&type=email&next=/onboarding")).toBe("/onboarding");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
  });

  it("exchanges a ?code= link (Supabase default template) and goes to onboarding", async () => {
    expect(await visit("?code=xyz")).toBe("/onboarding");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
  });

  it("sends a failed code exchange back to sign-up with an error", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    expect(await visit("?code=xyz")).toBe("/signup?error=confirmation_failed");
  });

  it("rejects a missing or unsupported link without calling Supabase", async () => {
    expect(await visit("")).toBe("/signup?error=confirmation_failed");
    expect(await visit("?token_hash=abc&type=recovery")).toBe("/signup?error=confirmation_failed");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("never redirects off-site", async () => {
    expect(await visit("?code=xyz&next=//evil.example")).toBe("/onboarding");
  });
});
