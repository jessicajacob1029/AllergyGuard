"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { formAlertClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { SectionCard } from "@/components/ui/section-card";
import { DEFAULT_MIN_OCR_CONFIDENCE } from "@/lib/allergen/check";
import { joinOcrLines } from "@/lib/ocr/ocr-text";
import type { OcrProgress } from "@/lib/ocr/run-ocr";
import { summarizeOcr, type OcrSummary } from "@/lib/ocr/summary";
import { useOnline } from "@/lib/use-online";
import { checkLabel } from "./actions";

type Read = { ocrText: string; summary: OcrSummary };

type State =
  | { step: "start" }
  | { step: "reading"; progress: OcrProgress }
  | { step: "review"; read: Read };

const TIPS = [
  ["💡", "Good light, no glare or shadow on the text."],
  ["📄", "Hold the label flat. Smooth out a crinkled packet."],
  ["🔍", "Fill the frame with the ingredients list."],
  ["✋", "Hold still until the photo is sharp."],
  ["🔤", "English text only for now. Hindi can't be read yet."],
] as const;

function progressText(p: OcrProgress): string {
  return p.stage === "loading"
    ? "Getting the text reader ready… The first time, this downloads about 4 MB."
    : `Reading the label… ${Math.round(p.progress * 100)}%`;
}

/**
 * Label photo → text (Tesseract.js in the browser) → review and edit → check.
 * The photo stays in this page's memory: only the text and the confidence are
 * sent to checkLabel().
 */
export function LabelCapture() {
  const online = useOnline();
  const [state, setState] = useState<State>({ step: "start" });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The preview is a local blob: URL. Free it when it's replaced or the page closes.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = ""; // so choosing the same photo again still fires
    if (!photo) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPhotoUrl(URL.createObjectURL(photo));
    setState({ step: "reading", progress: { stage: "loading" } });
    try {
      const { readLabelPhoto } = await import("@/lib/ocr/run-ocr");
      const out = await readLabelPhoto(photo, (progress) => setState({ step: "reading", progress }), controller.signal);
      if (controller.signal.aborted) return;
      setText(joinOcrLines(out.text));
      setState({ step: "review", read: { ocrText: out.text, summary: summarizeOcr(out.lines) } });
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error("Label OCR failed", e);
      setState({ step: "start" });
      setError(
        navigator.onLine
          ? "We couldn't read this photo. Try again, or take a new photo."
          : "You're offline. The text reader needs a connection the first time it's used.",
      );
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setPhotoUrl(null);
    setState({ step: "start" });
  }

  function retake() {
    cameraInput.current?.click();
  }

  function submit(read: Read) {
    setError(null);
    startTransition(async () => {
      // Only text and a number go to the server; never the photo.
      const result = await checkLabel({ text, ocrText: read.ocrText, ocrConfidence: read.summary.confidence });
      if (result?.error) setError(result.error);
    });
  }

  const fileInputs = (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="camera-input"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        onChange={handlePhoto}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="library-input"
      />
    </>
  );

  const preview = photoUrl && (
    // A local blob: URL for this device only; next/image can't optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt="Your label photo" className="max-h-56 w-full rounded-card bg-viewfinder object-contain" />
  );

  return (
    <div className="space-y-6">
      {fileInputs}

      {!online && (
        <p role="status" className="rounded-card border border-caution-ink/30 bg-caution-band p-3 text-sm font-bold text-caution-ink">
          You&apos;re offline. Checking a label needs an internet connection. Your emergency card still works.
        </p>
      )}

      {error && (
        <p role="alert" className={formAlertClass}>
          {error}
        </p>
      )}

      {state.step === "start" && (
        <>
          <SectionCard tone="primary" label="For a clear photo">
            <ul className="space-y-3">
              {TIPS.map(([emoji, tip]) => (
                <li key={tip} className="flex gap-3 text-base font-semibold text-ink">
                  <span aria-hidden="true">{emoji}</span>
                  {tip}
                </li>
              ))}
            </ul>
          </SectionCard>
          <p className="text-sm font-semibold text-muted">
            The photo stays on your phone. It is never uploaded or saved; only the text is checked and kept with
            the result.
          </p>
          <div className="space-y-3">
            <button type="button" onClick={retake} disabled={!online} className={primaryButtonClass}>
              <span aria-hidden="true">📷</span>
              Take photo
            </button>
            <button
              type="button"
              onClick={() => libraryInput.current?.click()}
              disabled={!online}
              className={secondaryButtonClass}
            >
              Choose from photos
            </button>
            <Link href="/scan" className="block text-center text-sm font-bold text-primary-ink underline">
              Scan a barcode instead
            </Link>
          </div>
        </>
      )}

      {state.step === "reading" && (
        <>
          {preview}
          <div role="status" className="flex flex-col items-center gap-3 rounded-card bg-band p-6 text-center">
            <span
              aria-hidden="true"
              className="size-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary motion-reduce:animate-none"
            />
            <p className="text-base font-extrabold text-primary-ink">{progressText(state.progress)}</p>
            <p className="text-sm font-semibold text-muted">This happens on your phone.</p>
          </div>
          <button type="button" onClick={cancel} className={secondaryButtonClass}>
            Cancel
          </button>
        </>
      )}

      {state.step === "review" && (
        <ReviewStep
          read={state.read}
          preview={preview}
          text={text}
          onTextChange={setText}
          onRetake={retake}
          onCheck={() => submit(state.read)}
          pending={pending}
          online={online}
        />
      )}
    </div>
  );
}

function ReviewStep(props: {
  read: Read;
  preview: React.ReactNode;
  text: string;
  onTextChange: (t: string) => void;
  onRetake: () => void;
  onCheck: () => void;
  pending: boolean;
  online: boolean;
}) {
  const { read, preview, text, onTextChange, onRetake, onCheck, pending, online } = props;
  const unclear = read.summary.confidence < DEFAULT_MIN_OCR_CONFIDENCE;
  const nothingRead = read.ocrText.trim() === "";

  return (
    <>
      {preview}

      {nothingRead ? (
        <p role="alert" className="rounded-card border border-caution-ink/30 bg-caution-band p-3 text-sm font-bold text-caution-ink">
          We couldn&apos;t find any text. Retake the photo closer to the ingredients, in good light. You can also
          type the ingredients below.
        </p>
      ) : (
        unclear && (
          <div role="alert" className="space-y-2 rounded-card border border-caution-ink/30 bg-caution-band p-3 text-sm font-bold text-caution-ink">
            <p>
              Parts of this label weren&apos;t read clearly. They may be blurred, or in another language such as
              Hindi, which AllergyGuard can&apos;t read yet. Compare the text with the label and fix any mistakes.
              Your result will be Caution, not Safe.
            </p>
            {read.summary.unclearLines.length > 0 && (
              <>
                <p>Unclear lines:</p>
                <ul className="list-disc space-y-1 pl-5 font-semibold">
                  {read.summary.unclearLines.slice(0, 5).map((line) => (
                    <li key={line} className="break-words">
                      “{line}”
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      )}

      <div>
        <label htmlFor="label-text" className={labelClass}>
          Text read from your photo
        </label>
        <p id="label-text-hint" className="mb-2 mt-1 text-sm font-semibold text-muted">
          Check it against the label and fix any mistakes before checking.
        </p>
        <textarea
          id="label-text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={10}
          spellCheck={false}
          aria-describedby="label-text-hint"
          className="w-full rounded-field border-2 border-line bg-card p-3 text-base leading-relaxed text-ink focus:border-primary focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onCheck}
          disabled={pending || !online || text.trim() === ""}
          className={primaryButtonClass}
        >
          {pending ? "Checking…" : "Check ingredients"}
        </button>
        <button type="button" onClick={onRetake} disabled={pending} className={secondaryButtonClass}>
          <span aria-hidden="true">📷</span>
          Retake photo
        </button>
      </div>
    </>
  );
}
