import { describe, expect, it } from "vitest";
import { afterOAuthPath, nameFromMetadata, oauthRedirectTo, oauthReturnForward } from "./oauth";

describe("oauthRedirectTo", () => {
  it("comes back to our callback, with next only when it isn't home", () => {
    expect(oauthRedirectTo("https://allergy-guard-nine.vercel.app", "/")).toBe(
      "https://allergy-guard-nine.vercel.app/auth/callback",
    );
    expect(oauthRedirectTo("http://localhost:3000", "/scans?verdict=unsafe")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fscans%3Fverdict%3Dunsafe",
    );
  });

  it("never carries an unsafe next", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", null, undefined]) {
      expect(oauthRedirectTo("http://localhost:3000", bad)).toBe("http://localhost:3000/auth/callback");
    }
  });
});

describe("afterOAuthPath", () => {
  it("sends people without a finished profile to onboarding", () => {
    expect(afterOAuthPath(null, "/scan")).toBe("/onboarding");
    expect(afterOAuthPath({ onboarding_completed_at: null }, "/scan")).toBe("/onboarding");
  });

  it("sends people with a finished profile to next", () => {
    expect(afterOAuthPath({ onboarding_completed_at: "2026-10-01T00:00:00Z" }, "/")).toBe("/");
    expect(afterOAuthPath({ onboarding_completed_at: "2026-10-01T00:00:00Z" }, "/diary")).toBe("/diary");
  });
});

describe("nameFromMetadata", () => {
  it("uses Google's full_name, then name, tidied", () => {
    expect(nameFromMetadata({ full_name: "  Priya   Sharma ", name: "Priya" })).toBe("Priya Sharma");
    expect(nameFromMetadata({ name: "Priya" })).toBe("Priya");
  });

  it("gives an empty name when there is none, and caps the length", () => {
    expect(nameFromMetadata(undefined)).toBe("");
    expect(nameFromMetadata({ full_name: 42 })).toBe("");
    expect(nameFromMetadata({ full_name: "a".repeat(150) })).toHaveLength(100);
  });
});

describe("oauthReturnForward", () => {
  const at = (path: string) => oauthReturnForward(new URL(`https://allergy-guard-nine.vercel.app${path}`));

  it("forwards a code that landed on the home page to /auth/callback", () => {
    expect(at("/?code=abc-123")).toBe("/auth/callback?code=abc-123");
  });

  it("keeps the page it landed on (minus the code) as next", () => {
    expect(at("/scans?verdict=unsafe&code=abc")).toBe("/auth/callback?code=abc&next=%2Fscans%3Fverdict%3Dunsafe");
    expect(at("/login?code=abc")).toBe("/auth/callback?code=abc&next=%2Flogin");
  });

  it("forwards a Supabase error return, so Log in can explain it", () => {
    expect(at("/?error=access_denied&error_code=bad_oauth_state&error_description=Cancelled")).toBe(
      "/auth/callback?error=access_denied",
    );
  });

  it("leaves pages alone when there is nothing to exchange", () => {
    expect(at("/")).toBeNull();
    expect(at("/scans?verdict=safe")).toBeNull();
    expect(at("/code")).toBeNull();
    // Our own messages use ?error= without a description: not a Supabase return.
    expect(at("/login?error=google")).toBeNull();
    expect(at("/signup?error=confirmation_failed")).toBeNull();
  });

  it("never touches the routes that exchange codes themselves", () => {
    expect(at("/auth/callback?code=abc")).toBeNull();
    expect(at("/auth/confirm?code=abc")).toBeNull();
  });
});
