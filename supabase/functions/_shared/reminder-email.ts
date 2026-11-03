// The reminder email (plain text and simple HTML, no images) and its
// unsubscribe headers. Pure functions, no Deno or Node APIs.

import type { ReminderStage } from "./reminder-stage.ts";
import { reminderDetail, reminderHeadline, type ReminderMedication } from "./reminder-message.ts";

export type ReminderEmail = {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The page that turns email reminders off (works without logging in). */
export function unsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Where mail apps send a one-click unsubscribe (RFC 8058): a POST, no page. */
export function oneClickUnsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function reminderEmail(input: {
  med: ReminderMedication;
  stage: ReminderStage;
  daysLeft: number;
  appUrl: string;
  unsubscribeToken: string;
}): ReminderEmail {
  const { med, stage, daysLeft, appUrl, unsubscribeToken } = input;
  const subject = reminderHeadline(med, stage, daysLeft);
  const detail = reminderDetail(med, stage);
  const profileUrl = `${appUrl}/profile#medications`;
  const unsubscribe = unsubscribeUrl(appUrl, unsubscribeToken);

  const text = [
    subject,
    "",
    detail,
    "",
    `Got a new one? Update the expiry date in your profile: ${profileUrl}`,
    "",
    "AllergyGuard is an aid, not medical advice. Always read the label.",
    "",
    "—",
    "You're getting this because email reminders are on.",
    `Turn off email reminders: ${unsubscribe}`,
  ].join("\n");

  const p = "margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f1b24;";
  const small = "margin:0 0 8px;font-size:13px;line-height:1.5;color:#625d68;";
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f3f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#625d68;">AllergyGuard</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f1b24;">${escapeHtml(subject)}</h1>
<p style="${p}">${escapeHtml(detail)}</p>
<p style="${p}"><a href="${escapeHtml(profileUrl)}" style="color:#4b3bb0;font-weight:bold;">Update the expiry date</a> if you've got a new one.</p>
<p style="${small}">AllergyGuard is an aid, not medical advice. Always read the label.</p>
<hr style="border:none;border-top:1px solid #e6e1ea;margin:20px 0;">
<p style="${small}">You're getting this because email reminders are on. <a href="${escapeHtml(unsubscribe)}" style="color:#4b3bb0;">Turn off email reminders</a></p>
</div></body></html>`;

  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${oneClickUnsubscribeUrl(appUrl, unsubscribeToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
