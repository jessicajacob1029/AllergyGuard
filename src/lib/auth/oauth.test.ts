import { describe, expect, it } from "vitest";
import { afterOAuthPath, nameFromMetadata, oauthRedirectTo } from "./oauth";

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
