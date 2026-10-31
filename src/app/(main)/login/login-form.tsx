"use client";

import { GoogleButton } from "@/components/auth/google-button";
import { OrDivider } from "@/components/ui/auth-frame";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  fieldErrorClass,
  formAlertClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "@/components/form-styles";
import { InputWithIcon, PasswordToggle } from "@/components/ui/field";
import { MailIcon } from "@/components/ui/icons";
import {
  loginErrorMessage,
  validateEmail,
  validateLoginPassword,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validateLoginPassword(password) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (validateEmail(email) || validateLoginPassword(password)) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error) {
        // `next` was already checked with safeNextPath on the server.
        router.replace(next);
        router.refresh();
        return;
      }
      setFormError(loginErrorMessage({ code: error.code, status: error.status }));
    } catch {
      setFormError(loginErrorMessage({ status: 0 }));
    }
    setSubmitting(false);
  }

  return (
    <div className="glass mt-7 rounded-[26px] p-5">
      <GoogleButton next={next} />
      <OrDivider />
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <InputWithIcon icon={<MailIcon className="size-5" />}>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
              className={`${inputClass} pr-12`}
            />
          </InputWithIcon>
          {emailError && (
            <p id="email-error" className={fieldErrorClass}>
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "password-error" : undefined}
              className={`${inputClass} pr-14`}
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
          </div>
          {passwordError && (
            <p id="password-error" className={fieldErrorClass}>
              {passwordError}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className={formAlertClass}>
            {formError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
