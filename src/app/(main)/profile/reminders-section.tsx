"use client";

import { useEffect, useState } from "react";
import { autoWidth, primaryButtonClass, secondaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { useHydrated } from "@/components/ui/local-time";
import { currentEndpoint, subscribeThisDevice, unsubscribeThisDevice } from "@/lib/push/subscribe";
import { pushSupport, readPushEnv, type PushSupport } from "@/lib/push/support";
import { saveReminderSettings, type ReminderSettings } from "@/lib/reminders/settings";
import { createClient } from "@/lib/supabase/client";
import { Section } from "./section";

type Props = {
  ownerId: string;
  initial: ReminderSettings;
  /** Where reminder emails go (the account's email). */
  email: string | null;
  /** VAPID public key, from the server. Null until it's set up in Vercel. */
  vapidPublicKey: string | null;
  /** True when at least one medication has an expiry date. */
  hasDatedMedication: boolean;
};

/** On/off switch (a button with role="switch"), with its label and a hint. */
function Switch({ id, label, hint, checked, disabled, onChange }: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[15px] font-bold text-ink">{label}</p>
        <p id={`${id}-hint`} className="break-words text-sm text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-11 w-[60px] shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${
          checked ? "bg-ink" : "bg-[#d9d3de]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-9 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

const DEVICE_TEXT: Record<Exclude<PushSupport, "can-ask" | "granted">, string> = {
  "ios-needs-install":
    "To get notifications on iPhone, add AllergyGuard to your Home Screen (Share, then Add to Home Screen) and open it from there. It needs iOS 16.4 or later. Email reminders work everywhere.",
  unsupported:
    "This browser can't show notifications. On iPhone, update to iOS 16.4 or later and open AllergyGuard from your Home Screen. Email reminders work everywhere.",
  blocked:
    "Notifications are blocked for AllergyGuard. To allow them, open your browser's site settings (on iPhone: Settings, Notifications, AllergyGuard), then come back here.",
};

export function RemindersSection({ ownerId, initial, email, vapidPublicKey, hasDatedMedication }: Props) {
  const [supabase] = useState(createClient);
  const hydrated = useHydrated();
  const [settings, setSettings] = useState(initial);
  const [support, setSupport] = useState<PushSupport | null>(null);
  /** This browser's endpoint when it's subscribed; undefined while checking. */
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    // Reading browser-only APIs has to wait until after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(pushSupport(readPushEnv()));
    currentEndpoint().then(setEndpoint, () => setEndpoint(null));
  }, [hydrated]);

  async function save(next: ReminderSettings, message: string) {
    const result = await saveReminderSettings(supabase, ownerId, next);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSettings(next);
    setStatus(message);
    return true;
  }

  async function toggleEmail(on: boolean) {
    setStatus(null);
    setError(null);
    setBusy(true);
    await save({ ...settings, emailEnabled: on }, on ? "Email reminders are on." : "Email reminders are off.");
    setBusy(false);
  }

  async function turnOnPush() {
    if (!vapidPublicKey) return;
    setStatus(null);
    setError(null);
    setBusy(true);
    const result = await subscribeThisDevice(supabase, vapidPublicKey);
    if (result.ok) {
      setEndpoint(result.endpoint);
      setSupport("granted");
      await save({ ...settings, pushEnabled: true }, "Notifications are on for this device.");
    } else {
      if (result.reason === "blocked") setSupport("blocked");
      setError(result.message);
    }
    setBusy(false);
  }

  async function turnOffPush() {
    setStatus(null);
    setError(null);
    setBusy(true);
    await unsubscribeThisDevice(supabase);
    setEndpoint(null);
    // Push stays on for the account while another device still has it.
    const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
    if (!count) await save({ ...settings, pushEnabled: false }, "Notifications are off.");
    else setStatus("Notifications are off for this device.");
    setBusy(false);
  }

  async function sendTest() {
    setStatus(null);
    setError(null);
    setBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke<{ delivered: number; removed: number }>("send-test-push", {
      body: { endpoint },
    });
    setBusy(false);
    if (invokeError || !data) return setError("Couldn't send a test notification. Check your connection and try again.");
    if (data.delivered > 0) return setStatus("Test notification sent. It should appear in a few seconds.");
    if (data.removed > 0) {
      setEndpoint(null);
      return setError("This device's notifications had expired. Turn them on again.");
    }
    setError("The test notification couldn't be delivered. Try turning notifications off and on again.");
  }

  const subscribed = Boolean(endpoint);

  return (
    <Section
      id="reminders"
      title="Reminders"
      description="We remind you 30, 7 and 1 days before a medication expires, and on the day itself, at 8 am."
      status={status}
      error={error}
    >
      {!hasDatedMedication && (
        <p className="rounded-[16px] bg-band p-3 text-sm text-ink">
          Add an expiry date to a medication above to get reminders.
        </p>
      )}

      <Switch
        id="email-reminders"
        label="Email reminders"
        hint={email ? `Sent to ${email}` : "Sent to your account's email"}
        checked={settings.emailEnabled}
        disabled={busy}
        onChange={toggleEmail}
      />

      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-[15px] font-bold text-ink">Notifications on this device</p>
        {!hydrated || support === null || endpoint === undefined ? (
          <p className="text-sm text-muted">Checking this device…</p>
        ) : !vapidPublicKey ? (
          <p className="text-sm text-muted">Notifications aren&apos;t set up yet. Email reminders still work.</p>
        ) : subscribed ? (
          <>
            <p className="text-sm text-muted">On for this device. Reminders show up even when the app is closed.</p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={sendTest} disabled={busy} className={autoWidth(secondaryButtonClass)}>
                Send a test notification
              </button>
              <button type="button" onClick={turnOffPush} disabled={busy} className={autoWidth(tertiaryButtonClass)}>
                Turn off on this device
              </button>
            </div>
          </>
        ) : support === "can-ask" || support === "granted" ? (
          <>
            <p className="text-sm text-muted">
              Get a notification on this device when a medication is about to expire. Your browser will ask for
              permission after you tap the button.
            </p>
            <button type="button" onClick={turnOnPush} disabled={busy} className={autoWidth(primaryButtonClass)}>
              {busy ? "Turning on…" : "Turn on notifications"}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">{DEVICE_TEXT[support]}</p>
        )}
      </div>
    </Section>
  );
}
