import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn(async () => new Response("page")));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

import { CSP_MODE, cspHeaderName } from "@/lib/security/csp";
import { proxy } from "./proxy";

const CSP_HEADER = cspHeaderName(CSP_MODE);

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

  it("adds a Content-Security-Policy with a fresh nonce on every page, and passes it to Next.js", async () => {
    updateSession.mockClear();
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const req = new NextRequest("https://x.test/profile");
      const res = await proxy(req);
      const csp = res.headers.get(CSP_HEADER) ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(csp).toContain("frame-ancestors 'none'");
      // Next.js reads the nonce from the request header.
      expect(req.headers.get(CSP_HEADER)).toBe(csp);
      seen.push(csp);
    }
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("prerendered offline pages get the policy without a nonce", async () => {
    for (const path of ["/emergency", "/~offline"]) {
      const req = new NextRequest(`https://x.test${path}`);
      const res = await proxy(req);
      const csp = res.headers.get(CSP_HEADER) ?? "";
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).not.toContain("nonce-");
    }
  });
});
