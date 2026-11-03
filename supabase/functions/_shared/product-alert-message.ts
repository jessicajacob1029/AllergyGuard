// The words of a product change alert: push notification and email.
// Pure functions, no Deno or Node APIs.

import type { Verdict } from "../../../src/lib/allergen/check.ts";
import { escapeHtml, type ReminderEmail } from "./reminder-email.ts";
import type { PushPayload } from "./reminder-message.ts";

export type ProductAlertMessage = {
  alertId: string;
  productName: string | null;
  barcode: string;
  oldVerdict: Verdict;
  newVerdict: Verdict;
  /** From describeChanges(): 'now lists milk (in "whey")'. */
  summary: string;
  /** The new result's plain-language explanation from checkAllergens(). */
  explanation: string;
};

const LABEL: Record<Verdict, string> = { safe: "Safe", caution: "Caution", unsafe: "Unsafe" };
const RANK: Record<Verdict, number> = { safe: 0, caution: 1, unsafe: 2 };

export const DATA_WARNING = "Product data can be wrong: always check the packet.";

/** "Nutella", or "A product you scanned (3017620422003)" when Open Food Facts has no name. */
export function productLabel(m: Pick<ProductAlertMessage, "productName" | "barcode">): string {
  const name = m.productName?.trim();
  return name ? name : `A product you scanned (${m.barcode})`;
}

/** Push title and email subject. */
export function alertHeadline(m: ProductAlertMessage): string {
  const name = productLabel(m);
  return RANK[m.newVerdict] > RANK[m.oldVerdict]
    ? `${name} has changed: now ${LABEL[m.newVerdict]} for you`
    : `${name} has changed: another of your allergens`;
}

/** 'It now lists milk (in "whey").' */
export function alertChangeSentence(m: Pick<ProductAlertMessage, "summary">): string {
  return `It ${m.summary}.`;
}

export function changePath(alertId: string): string {
  return `/scans/changes/${encodeURIComponent(alertId)}`;
}

export function productAlertPush(m: ProductAlertMessage): PushPayload {
  return {
    title: alertHeadline(m),
    body: `${alertChangeSentence(m)} ${DATA_WARNING}`,
    // One notification per alert; a later change replaces nothing.
    tag: `product-alert-${m.alertId}`,
    url: changePath(m.alertId),
  };
}

export function productAlertsUnsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl}/unsubscribe?kind=product-alerts&token=${encodeURIComponent(token)}`;
}

export function productAlertsOneClickUrl(appUrl: string, token: string): string {
  return `${appUrl}/api/unsubscribe?kind=product-alerts&token=${encodeURIComponent(token)}`;
}

export function productAlertEmail(m: ProductAlertMessage, appUrl: string, unsubscribeToken: string): ReminderEmail {
  const subject = alertHeadline(m);
  const change = alertChangeSentence(m);
  const verdicts = `Before: ${LABEL[m.oldVerdict]}. Now: ${LABEL[m.newVerdict]}.`;
  const resultUrl = `${appUrl}${changePath(m.alertId)}`;
  const unsubscribe = productAlertsUnsubscribeUrl(appUrl, unsubscribeToken);

  const text = [
    subject,
    "",
    change,
    verdicts,
    m.explanation,
    "",
    DATA_WARNING,
    "",
    `See the new result: ${resultUrl}`,
    "",
    "AllergyGuard is an aid, not medical advice. Always read the label.",
    "",
    "—",
    "You're getting this because product change alerts are on. We re-check products you scanned in the last 6 months.",
    `Turn off product change alerts: ${unsubscribe}`,
  ].join("\n");

  const p = "margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f1b24;";
  const small = "margin:0 0 8px;font-size:13px;line-height:1.5;color:#625d68;";
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f3f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#625d68;">AllergyGuard</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f1b24;">${escapeHtml(subject)}</h1>
<p style="${p}">${escapeHtml(change)}</p>
<p style="${p}"><strong>${escapeHtml(verdicts)}</strong> ${escapeHtml(m.explanation)}</p>
<p style="${p}">${escapeHtml(DATA_WARNING)}</p>
<p style="${p}"><a href="${escapeHtml(resultUrl)}" style="color:#4b3bb0;font-weight:bold;">See the new result</a></p>
<p style="${small}">AllergyGuard is an aid, not medical advice. Always read the label.</p>
<hr style="border:none;border-top:1px solid #e6e1ea;margin:20px 0;">
<p style="${small}">You're getting this because product change alerts are on. We re-check products you scanned in the last 6 months. <a href="${escapeHtml(unsubscribe)}" style="color:#4b3bb0;">Turn off product change alerts</a></p>
</div></body></html>`;

  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${productAlertsOneClickUrl(appUrl, unsubscribeToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
