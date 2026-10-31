import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
const load = vi.hoisted(() => ({ loadOwnProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/profile/load", () => load);
// next/navigation's redirect throws; mimic that so the handler stops at the first redirect.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { GET } from "./route";

async function visit(query: string): Promise<string> {
  try {
    await GET(new NextRequest(`https://example.test/auth/callback${query}`));
  } catch (e) {
    return (e as Error).message.replace("REDIRECT ", "");
  }
  throw new Error("expected a redirect");
}

const done = { profile: { onboarding_completed_at: "2026-10-01T00:00:00Z" } };

beforeEach(() => {
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  load.loadOwnProfile.mockReset().mockResolvedValue(done);
});

describe("/auth/callback (Google)", () => {
  it("exchanges the code and sends an existing user home", async () => {
    expect(await visit("?code=abc")).toBe("/");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("honours a safe next for existing users", async () => {
    expect(await visit("?code=abc&next=%2Fscans%3Fverdict%3Dunsafe")).toBe("/scans?verdict=unsafe");
  });

  it("ignores an unsafe next", async () => {
    for (const bad of ["https%3A%2F%2Fevil.test", "%2F%2Fevil.test", "%2F%5Cevil.test"]) {
      expect(await visit(`?code=abc&next=${bad}`)).toBe("/");
    }
  });

  it("sends a new user (no profile) or a half-onboarded user to onboarding", async () => {
    load.loadOwnProfile.mockResolvedValueOnce(null);
    expect(await visit("?code=abc&next=%2Fdiary")).toBe("/onboarding");
    load.loadOwnProfile.mockResolvedValueOnce({ profile: { onboarding_completed_at: null } });
    expect(await visit("?code=abc")).toBe("/onboarding");
  });

  it("goes to next if the profile lookup fails (the page checks onboarding itself)", async () => {
    load.loadOwnProfile.mockRejectedValueOnce(new Error("network"));
    expect(await visit("?code=abc&next=%2Fscan")).toBe("/scan");
  });

  it("goes back to Log in with a message when Google was cancelled or the exchange fails", async () => {
    expect(await visit("?error=access_denied&error_description=cancelled")).toBe("/login?error=google");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(await visit("")).toBe("/login?error=google");
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "invalid flow state" } });
    expect(await visit("?code=bad&next=%2Fscan")).toBe("/login?error=google&next=%2Fscan");
  });
});
