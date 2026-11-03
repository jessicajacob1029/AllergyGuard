import { NextResponse, type NextRequest } from "next/server";
import { isUnsubscribeToken, parseUnsubscribeKind, unsubscribe } from "@/lib/reminders/unsubscribe";
import { createClient } from "@/lib/supabase/server";

// One-click unsubscribe (RFC 8058): mail apps such as Gmail POST here when
// the user taps their own Unsubscribe button (the email's List-Unsubscribe
// header). No page, no login. A GET (someone opening the URL) goes to the
// confirm page instead, so link scanners can't unsubscribe anyone.
// `kind=product-alerts` (Phase 8 alert emails) turns off product change
// alerts only; links without it turn off medication reminder emails.

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const kind = parseUnsubscribeKind(request.nextUrl.searchParams.get("kind"));
  if (!isUnsubscribeToken(token)) return new NextResponse("Invalid link", { status: 400 });
  try {
    await unsubscribe(await createClient(), token, kind);
  } catch {
    return new NextResponse("Try again later", { status: 500 });
  }
  // Same answer whether or not the token matched: nothing to learn by guessing.
  return new NextResponse(kind === "product-alerts" ? "Product change alerts are off." : "Email reminders are off.", {
    status: 200,
  });
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const target = new URL("/unsubscribe", request.nextUrl.origin);
  if (parseUnsubscribeKind(request.nextUrl.searchParams.get("kind")) === "product-alerts") {
    target.searchParams.set("kind", "product-alerts");
  }
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, 303);
}
