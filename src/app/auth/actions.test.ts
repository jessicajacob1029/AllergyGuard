import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

import { signOut } from "./actions";

beforeEach(() => auth.signOut.mockReset().mockResolvedValue({ error: null }));

describe("signOut", () => {
  it("ends only this device's session, then goes to login", async () => {
    await expect(signOut()).rejects.toMatchObject({ url: "/login?logged_out=1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
