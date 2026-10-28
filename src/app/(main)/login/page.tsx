import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formSuccessClass, secondaryButtonClass } from "@/components/form-styles";
import { AuthFrame, OrDivider } from "@/components/ui/auth-frame";
import { safeNextPath } from "@/lib/auth/redirect";
import { APP_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: `Log in · ${APP_NAME}`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; logged_out?: string; confirm?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect(next);

  return (
    <AuthFrame title="Log in" subtitle={`Welcome back to ${APP_NAME}.`}>
      {params.logged_out === "1" && (
        <p role="status" className={`mt-6 ${formSuccessClass}`}>
          You&apos;ve been logged out.
        </p>
      )}

      {params.confirm === "other_browser" && (
        <p role="status" className={`mt-6 ${formSuccessClass}`}>
          Your email is confirmed. Log in with your email and password to continue.
        </p>
      )}

      <LoginForm next={next} />

      <OrDivider />
      <p className="sr-only">New to {APP_NAME}?</p>
      <Link href="/signup" className={secondaryButtonClass}>
        Create an account
      </Link>
    </AuthFrame>
  );
}
