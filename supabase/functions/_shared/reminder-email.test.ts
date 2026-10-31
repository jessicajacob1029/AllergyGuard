import { describe, expect, it } from "vitest";
import { reminderEmail } from "./reminder-email.ts";
import { formatExpiry, reminderHeadline, reminderPush } from "./reminder-message.ts";

const med = { id: "m1", name: "EpiPen", dose: "0.3 mg", expiryDate: "2026-11-08" };
const APP = "https://allergy-guard-nine.vercel.app";
const TOKEN = "a".repeat(64);

describe("reminder wording", () => {
  it("says when it expires for each stage", () => {
    expect(reminderHeadline(med, "30d", 23)).toBe("Your EpiPen expires in 23 days");
    expect(reminderHeadline(med, "7d", 7)).toBe("Your EpiPen expires in 7 days");
    expect(reminderHeadline(med, "1d", 1)).toBe("Your EpiPen expires tomorrow");
    expect(reminderHeadline(med, "today", 0)).toBe("Your EpiPen expires today");
  });

  it("writes dates without a time zone", () => {
    expect(formatExpiry("2026-11-08")).toBe("8 Nov 2026");
    expect(formatExpiry("2027-01-31")).toBe("31 Jan 2027");
  });

  it("push: one tag per medication and expiry date, opening the medications section", () => {
    const push = reminderPush(med, "7d", 7);
    expect(push).toMatchObject({ title: "Your EpiPen expires in 7 days", tag: "medication-m1-2026-11-08", url: "/profile#medications" });
    expect(push.body).toContain("EpiPen 0.3 mg expires on 8 Nov 2026.");
  });
});

describe("reminderEmail", () => {
  const email = reminderEmail({ med, stage: "7d", daysLeft: 7, appUrl: APP, unsubscribeToken: TOKEN });

  it("has the subject, details, profile link and disclaimer", () => {
    expect(email.subject).toBe("Your EpiPen expires in 7 days");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("EpiPen 0.3 mg expires on 8 Nov 2026.");
      expect(body).toContain(`${APP}/profile#medications`);
      expect(body).toContain("AllergyGuard is an aid, not medical advice.");
    }
  });

  it("has an unsubscribe link in every email, and one-click headers for mail apps", () => {
    expect(email.text).toContain(`Turn off email reminders: ${APP}/unsubscribe?token=${TOKEN}`);
    expect(email.html).toContain(`href="${APP}/unsubscribe?token=${TOKEN}"`);
    expect(email.headers).toEqual({
      "List-Unsubscribe": `<${APP}/api/unsubscribe?token=${TOKEN}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("escapes what the user typed", () => {
    const html = reminderEmail({
      med: { name: "<b>Pen</b>", dose: null, expiryDate: "2026-11-08" },
      stage: "today",
      daysLeft: 0,
      appUrl: APP,
      unsubscribeToken: TOKEN,
    }).html;
    expect(html).not.toContain("<b>Pen</b>");
    expect(html).toContain("&lt;b&gt;Pen&lt;/b&gt;");
  });
});
