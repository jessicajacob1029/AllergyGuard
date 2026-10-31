import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn(async () => new Response("page")));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

import { proxy } from "./proxy";

describe("proxy", () => {
  it("forwards a sign-in code that landed on / to /auth/callback (same code)", async () => {
    const res = await proxy(new NextRequest("https://allergy-guard-j-deploys.vercel.app/?code=abc-123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://allergy-guard-j-deploys.vercel.app/auth/callback?code=abc-123");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("lets normal pages and the callback itself through", async () => {
    for (const url of ["https://x.test/", "https://x.test/scans?verdict=safe", "https://x.test/auth/callback?code=abc"]) {
      const res = await proxy(new NextRequest(url));
      expect(await res.text()).toBe("page");
    }
    expect(updateSession).toHaveBeenCalledTimes(3);
  });
});
