import { NextResponse, type NextRequest } from "next/server";
import { isUnsubscribeToken, unsubscribeEmail } from "@/lib/reminders/unsubscribe";
import { createClient } from "@/lib/supabase/server";

// One-click unsubscribe (RFC 8058): mail apps such as Gmail POST here when
// the user taps their own Unsubscribe button (the email's List-Unsubscribe
// header). No page, no login. A GET (someone opening the URL) goes to the
// confirm page instead, so link scanners can't unsubscribe anyone.

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!isUnsubscribeToken(token)) return new NextResponse("Invalid link", { status: 400 });
  try {
    await unsubscribeEmail(await createClient(), token);
  } catch {
    return new NextResponse("Try again later", { status: 500 });
  }
  // Same answer whether or not the token matched: nothing to learn by guessing.
  return new NextResponse("Email reminders are off.", { status: 200 });
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const target = new URL("/unsubscribe", request.nextUrl.origin);
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, 303);
}
