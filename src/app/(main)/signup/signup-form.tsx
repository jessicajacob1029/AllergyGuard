"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  fieldErrorClass,
  formAlertClass,
  inputClass,
  labelClass,
  linkClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form-styles";
import { InputWithIcon, PasswordToggle } from "@/components/ui/field";
import { MailIcon } from "@/components/ui/icons";
import {
  PASSWORD_MIN_LENGTH,
  isAccountExistsError,
  signUpErrorMessage,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "submitting" | "sent";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validatePassword(password) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (validateEmail(email) || validatePassword(password)) return;

    setStatus("submitting");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });

      // An existing account gets the same screen as a new one, so the form
      // never reveals which emails are registered.
      if (!error || isAccountExistsError(error.code)) {
        setStatus("sent");
        return;
      }
      setFormError(signUpErrorMessage({ code: error.code, status: error.status }));
    } catch {
      setFormError(signUpErrorMessage({ status: 0 }));
    }
    setStatus("idle");
  }

  if (status === "sent") {
    return (
      <section
        aria-live="polite"
        className="glass mt-7 rounded-[26px] border-l-4 border-l-safe-ink p-5"
      >
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-ink">
          <span aria-hidden="true">📬 </span>
          Check your email
        </h2>
        <p className="mt-2 text-base text-ink">
          Check your email to confirm your account. If you already have an
          account,{" "}
          <Link href="/login" className={linkClass}>
            log in instead
          </Link>
          .
        </p>
        <p className="mt-2 text-sm font-semibold text-muted">
          We sent it to <span className="font-bold text-ink">{email.trim()}</span>.
          It can take a minute; check your spam folder too.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setPassword("");
            setTouched({ email: false, password: false });
          }}
          className={`mt-4 ${secondaryButtonClass}`}
        >
          Use a different email
        </button>
      </section>
    );
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="glass mt-7 space-y-5 rounded-[26px] p-5">
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : "password-hint"}
            className={`${inputClass} pr-14`}
          />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
        </div>
        {passwordError ? (
          <p id="password-error" className={fieldErrorClass}>
            {passwordError}
          </p>
        ) : (
          <p id="password-hint" className="mt-1 text-sm font-semibold text-muted">
            At least {PASSWORD_MIN_LENGTH} characters.
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className={formAlertClass}
        >
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={primaryButtonClass}
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
