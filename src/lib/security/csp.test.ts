import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, cspHeaderName, isStaticPage, SECURITY_HEADERS } from "./csp";

const SUPABASE = "https://vwnwevrwoitvnsspudqe.supabase.co";
const parse = (csp: string) =>
  Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe("buildCsp", () => {
  it("dynamic pages: scripts only with this response's nonce (strict-dynamic), never unsafe-inline or eval", () => {
    const p = parse(buildCsp({ nonce: "abc123==", supabaseUrl: SUPABASE }));
    expect(p["script-src"]).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(p["script-src"]).not.toContain("'unsafe-inline'");
    expect(p["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("prerendered pages (no nonce) allow inline scripts from this site only", () => {
    const p = parse(buildCsp({ nonce: null, supabaseUrl: SUPABASE }));
    expect(p["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("allows Supabase (REST, Auth, Edge Functions) and nothing else to be fetched", () => {
    const p = parse(buildCsp({ nonce: "n", supabaseUrl: `${SUPABASE}/` }));
    expect(p["connect-src"]).toEqual(["'self'", SUPABASE]);
  });

  it("has the baseline: default-src, object-src, base-uri, form-action, frame-ancestors", () => {
    const p = parse(buildCsp({ nonce: "n", supabaseUrl: SUPABASE }));
    expect(p["default-src"]).toEqual(["'self'"]);
    expect(p["object-src"]).toEqual(["'none'"]);
    expect(p["base-uri"]).toEqual(["'self'"]);
    expect(p["form-action"]).toEqual(["'self'"]);
    expect(p["frame-ancestors"]).toEqual(["'none'"]);
    expect(p["frame-src"]).toEqual(["'none'"]);
    expect(p["worker-src"]).toEqual(["'self'"]);
  });

  it("no wildcard or bare scheme anywhere except data:/blob: for images and media", () => {
    const p = parse(buildCsp({ nonce: "n", supabaseUrl: SUPABASE }));
    for (const [name, values] of Object.entries(p)) {
      for (const v of values as string[]) {
        expect(v === "*" || v === "https:" || v === "http:" || v.startsWith("*")).toBe(false);
        if (v === "data:" || v === "blob:") expect(["img-src", "media-src"]).toContain(name);
      }
    }
  });

  it("only next dev gets unsafe-eval", () => {
    expect(buildCsp({ nonce: "n", supabaseUrl: SUPABASE, dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: "n", supabaseUrl: SUPABASE })).not.toContain("'unsafe-eval'");
  });
});

describe("helpers", () => {
  it("nonces are random 128-bit base64 values", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });

  it("knows the prerendered pages and the header names", () => {
    expect(isStaticPage("/emergency")).toBe(true);
    expect(isStaticPage("/~offline")).toBe(true);
    expect(isStaticPage("/profile")).toBe(false);
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });

  it("security headers for every response", () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))).toEqual({
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    });
  });
});
