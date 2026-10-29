"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import {
  fieldErrorClass,
  formAlertClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form-styles";
import { BarcodeIcon, CameraIcon } from "@/components/ui/icons";
import { ComingSoon } from "@/components/ui/pill";
import { SectionCard } from "@/components/ui/section-card";
import { normalizeBarcode, validateBarcode } from "@/lib/products/barcode";
import type { ScanInput } from "@/lib/products/scan-record";
import { checkBarcode } from "./actions";

type CameraState = "off" | "starting" | "on" | "denied" | "unavailable";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Camera scanning (rear camera, @zxing/browser loaded on demand) plus manual entry. */
export function Scanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [camera, setCamera] = useState<CameraState>("off");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<{ message: string; barcode: string; input: ScanInput } | null>(null);
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const handledRef = useRef(false);
  // Bumped on every start and cancel, so a camera that opens after Cancel is shut again.
  const attemptRef = useRef(0);

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }

  useEffect(() => stopCamera, []);

  function lookup(barcode: string, input: ScanInput) {
    setLookupError(null);
    setLookingUp(barcode);
    startTransition(async () => {
      // On success the Server Function redirects to the result page.
      const result = await checkBarcode(barcode, input);
      if (result?.error) {
        setLookupError({ message: result.error, barcode, input });
        setLookingUp(null);
      }
    });
  }

  function cancelCamera() {
    attemptRef.current += 1;
    stopCamera();
    setCamera("off");
  }

  async function startCamera() {
    const attempt = ++attemptRef.current;
    setCamera("starting");
    handledRef.current = false;
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      // Food barcodes. UPC-E is left out: its check digit works differently
      // and it is rare outside North America.
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current!,
        (result) => {
          if (!result || handledRef.current) return;
          const code = result.getText();
          // A misread fails the check digit: keep scanning instead.
          if (validateBarcode(code) !== null) return;
          handledRef.current = true;
          stopCamera();
          setCamera("off");
          lookup(normalizeBarcode(code), "camera");
        },
      );
      if (attempt !== attemptRef.current) {
        controls.stop(); // cancelled while the permission prompt was open
        return;
      }
      controlsRef.current = controls;
      setCamera("on");
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : "";
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateBarcode(manual);
    setManualError(error);
    if (error) return;
    stopCamera();
    setCamera("off");
    lookup(normalizeBarcode(manual), "manual");
  }

  const busy = pending || lookingUp !== null;

  return (
    <div className="space-y-6">
      {!online && (
        <p role="status" className="rounded-[18px] border border-caution-ink/20 bg-caution-band p-3.5 text-sm font-bold text-caution-ink">
          You&apos;re offline. Checking a product needs an internet connection. Your emergency card still works.
        </p>
      )}

      {busy && lookingUp ? (
        <div role="status" className="glass flex flex-col items-center gap-3 rounded-[28px] p-7 text-center">
          <span
            aria-hidden="true"
            className="size-10 animate-spin rounded-full border-4 border-primary/25 border-t-primary motion-reduce:animate-none"
          />
          <p className="text-base font-bold text-ink">Looking up {lookingUp}…</p>
          <p className="text-sm text-muted">Checking it against your allergies.</p>
        </div>
      ) : (
        <>
          <div className="relative aspect-[4/3.3] overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_50%_30%,#756b79,#342f37_65%,#211e23)]">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera preview"
              className={`size-full object-cover ${camera === "on" ? "" : "hidden"}`}
            />
            {/* Target frame */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[44%] h-[42%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border-2 border-white/90"
            />
            {camera !== "on" && (
              <span aria-hidden="true" className="absolute inset-x-0 top-[44%] flex -translate-y-1/2 justify-center text-white/85">
                <BarcodeIcon className="size-14" />
              </span>
            )}
            <p className="absolute inset-x-0 bottom-4 text-center font-mono text-xs font-bold uppercase tracking-[0.12em] text-white">
              {camera === "on" ? "Hold the barcode inside the box" : camera === "starting" ? "Starting camera…" : "Camera is off"}
            </p>
          </div>

          {camera === "denied" && (
            <p role="alert" className={formAlertClass}>
              Camera access is blocked. Allow the camera for this site in your browser settings, or type the barcode
              below.
            </p>
          )}
          {camera === "unavailable" && (
            <p role="alert" className={formAlertClass}>
              We couldn&apos;t start a camera on this device. Type the barcode below instead.
            </p>
          )}

          {camera === "on" || camera === "starting" ? (
            <button type="button" onClick={cancelCamera} className={secondaryButtonClass}>
              {camera === "on" ? "Stop camera" : "Cancel"}
            </button>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              disabled={!online}
              className={primaryButtonClass}
            >
              <CameraIcon className="size-5" />
              Open camera
            </button>
          )}
        </>
      )}

      {lookupError && (
        <div role="alert" className={`${formAlertClass} space-y-3`}>
          <p>{lookupError.message}</p>
          <button
            type="button"
            onClick={() => lookup(lookupError.barcode, lookupError.input)}
            className={secondaryButtonClass}
          >
            Try again
          </button>
        </div>
      )}

      <SectionCard tone="primary" label="No camera?" title="Or type the barcode">
        <form onSubmit={handleManualSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="barcode" className={labelClass}>
              Barcode number
            </label>
            <input
              id="barcode"
              name="barcode"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 8901063010376"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                setManualError(null);
              }}
              aria-invalid={manualError ? true : undefined}
              aria-describedby={manualError ? "barcode-error" : "barcode-hint"}
              className={inputClass}
            />
            {manualError ? (
              <p id="barcode-error" className={fieldErrorClass}>
                {manualError}
              </p>
            ) : (
              <p id="barcode-hint" className="mt-1 text-sm text-muted">
                The numbers under the barcode stripes.
              </p>
            )}
          </div>
          <button type="submit" disabled={busy || !online} className={primaryButtonClass}>
            Check product
          </button>
        </form>
      </SectionCard>

      <div className="glass grid min-h-[76px] grid-cols-[46px_1fr_auto] items-center gap-3 rounded-[20px] px-3.5 py-3">
        <span aria-hidden="true" className="flex size-[46px] items-center justify-center rounded-[14px] bg-band text-primary-ink">
          <CameraIcon className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-ink">Label photo</span>
          <span className="block text-sm text-muted">Photo of the ingredients</span>
        </span>
        <ComingSoon />
      </div>
    </div>
  );
}
