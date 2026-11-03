"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ClipboardEvent, type ReactNode } from "react";
import { formAlertClass, labelClass, primaryButtonClass, secondaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { BarcodeIcon, CameraIcon, ChevronRightIcon, ClipboardIcon, ImageIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { DEFAULT_MIN_OCR_CONFIDENCE } from "@/lib/allergen/check";
import { DEFAULT_CROP, WHOLE_PHOTO, type CropRect } from "@/lib/ocr/crop";
import { joinOcrLines } from "@/lib/ocr/ocr-text";
import { prepareOcrText } from "@/lib/ocr/prepare-text";
import type { OcrProgress } from "@/lib/ocr/run-ocr";
import { summarizeOcr, type OcrSummary } from "@/lib/ocr/summary";
import { useOnline } from "@/lib/use-online";
import { checkLabel } from "./actions";
import { CropBox, CropPreview } from "./crop-box";

type Read = { ocrText: string; summary: OcrSummary; boosted: boolean; crop: CropRect };

type State =
  | { step: "start" }
  | { step: "crop" }
  | { step: "reading"; progress: OcrProgress }
  | { step: "review"; read: Read }
  | { step: "paste" };

type Photo = { blob: Blob; url: string };

const TIPS = [
  "Good light, no glare or shadow on the text.",
  "Hold the label flat. Smooth out a crinkled packet.",
  "Get close: the ingredients should fill most of the photo.",
  "Hold still until the photo is sharp.",
  "Next, you'll drag a box around just the ingredients.",
  "English text only for now. Hindi can't be read yet.",
] as const;

export const PASTE_TIP = "On iPhone, open the photo, press and hold the text, then Copy.";

const noticeClass = "rounded-[18px] border border-caution-ink/20 bg-caution-band p-3.5 text-sm font-bold text-caution-ink";
const tileClass =
  "glass grid min-h-[76px] w-full grid-cols-[46px_1fr_auto] items-center gap-3 rounded-[20px] px-3.5 py-3 text-left " +
  "transition hover:bg-white/80 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const viewfinderClass = "rounded-[28px] bg-[radial-gradient(circle_at_50%_30%,#756b79,#342f37_65%,#211e23)]";

function progressText(p: OcrProgress): string {
  if (p.stage === "loading") return "Getting the text reader ready… The first time, this downloads about 4 MB.";
  const percent = Math.round(p.progress * 100);
  return p.pass === 2 ? `The text is small. Reading it again, larger… ${percent}%` : `Reading the label… ${percent}%`;
}

/**
 * Label photo → crop → text (Tesseract.js in the browser) → review and edit →
 * check. Or: paste text → review → check. The photo stays in this page's
 * memory: only text (and the photo's confidence) is sent to checkLabel().
 */
export function LabelCapture() {
  const online = useOnline();
  const [state, setState] = useState<State>({ step: "start" });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [rect, setRect] = useState<CropRect>(DEFAULT_CROP);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The preview is a local blob: URL. Free it when it's replaced or the page closes.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const blob = event.target.files?.[0];
    event.target.value = ""; // so choosing the same photo again still fires
    if (!blob) return;
    abortRef.current?.abort();
    setError(null);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setRect(DEFAULT_CROP);
    setState({ step: "crop" });
  }

  async function read(crop: CropRect, boost: boolean) {
    if (!photo) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setState({ step: "reading", progress: { stage: "loading" } });
    try {
      const { readLabelPhoto } = await import("@/lib/ocr/run-ocr");
      const out = await readLabelPhoto(photo.blob, (progress) => setState({ step: "reading", progress }), controller.signal, {
        crop,
        boost,
      });
      if (controller.signal.aborted) return;
      setText(prepareOcrText(out.text));
      setState({
        step: "review",
        read: { ocrText: out.text, summary: summarizeOcr(out.lines), boosted: boost, crop },
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error("Label OCR failed", e);
      setState({ step: "crop" });
      setError(
        navigator.onLine
          ? "We couldn't read this photo. Try again, or take a new photo."
          : "You're offline. The text reader needs a connection the first time it's used.",
      );
    }
  }

  function cancelReading() {
    abortRef.current?.abort();
    setState({ step: "crop" });
  }

  function takePhoto() {
    cameraInput.current?.click();
  }

  function startPaste() {
    setError(null);
    setText("");
    setState({ step: "paste" });
  }

  function backToStart() {
    setError(null);
    setPhoto(null);
    setState({ step: "start" });
  }

  function submit(input: Parameters<typeof checkLabel>[0]) {
    setError(null);
    startTransition(async () => {
      // Only text (and a photo's confidence) goes to the server; never the photo.
      const result = await checkLabel(input);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
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

      {!online && (
        <p role="status" className={noticeClass}>
          You&apos;re offline. Checking a label needs an internet connection. Your emergency card still works.
        </p>
      )}

      {error && (
        <p role="alert" className={formAlertClass}>
          {error}
        </p>
      )}

      {state.step === "start" && (
        <div className="space-y-5 desk:grid desk:grid-cols-2 desk:items-start desk:gap-5 desk:space-y-0">
          <div className="space-y-3">
            <div className={`${viewfinderClass} relative flex aspect-[4/3] flex-col items-center justify-center gap-3 text-white/85`}>
              {/* A stand-in ingredients panel inside the target frame. */}
              <span
                aria-hidden="true"
                className="flex h-[46%] w-[72%] flex-col justify-center gap-2 rounded-[16px] border-2 border-white/90 px-5"
              >
                <span className="h-1.5 w-2/5 rounded-full bg-white/70" />
                <span className="h-1.5 w-full rounded-full bg-white/40" />
                <span className="h-1.5 w-11/12 rounded-full bg-white/40" />
                <span className="h-1.5 w-3/4 rounded-full bg-white/40" />
              </span>
              <p className="absolute inset-x-0 bottom-4 text-center font-mono text-xs font-bold uppercase tracking-[0.12em] text-white">
                Photo stays on your phone
              </p>
            </div>
            <button type="button" onClick={takePhoto} disabled={!online} className={primaryButtonClass}>
              <CameraIcon className="size-5" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => libraryInput.current?.click()}
              disabled={!online}
              className={secondaryButtonClass}
            >
              <ImageIcon className="size-5" />
              Choose from photos
            </button>
            <p className="px-1 text-sm text-muted">
              The photo is never uploaded or saved. Only the text is checked and kept with the result.
            </p>
          </div>

          <div className="space-y-3">
            <SectionCard tone="primary" label="For a clear photo">
              <ol className="space-y-3">
                {TIPS.map((tip, i) => (
                  <li key={tip} className="flex gap-3 text-[15px] leading-snug text-ink">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-band font-mono text-xs font-bold text-primary-ink"
                    >
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ol>
            </SectionCard>

            <button type="button" onClick={startPaste} disabled={!online} className={tileClass}>
              <TileIcon>
                <ClipboardIcon className="size-6" />
              </TileIcon>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink">Paste text instead</span>
                <span className="block text-sm text-muted">{PASTE_TIP}</span>
              </span>
              <ChevronRightIcon className="size-5 text-muted" />
            </button>
            <Link href="/scan" className={tileClass}>
              <TileIcon>
                <BarcodeIcon className="size-6" />
              </TileIcon>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink">Scan a barcode instead</span>
                <span className="block text-sm text-muted">Product data from Open Food Facts.</span>
              </span>
              <ChevronRightIcon className="size-5 text-muted" />
            </Link>
          </div>
        </div>
      )}

      {state.step === "crop" && photo && (
        <div className="space-y-4 desk:grid desk:grid-cols-[minmax(0,1fr)_260px] desk:items-start desk:gap-5 desk:space-y-0">
          <div className={`${viewfinderClass} p-3`}>
            <CropBox src={photo.url} rect={rect} onChange={setRect} />
          </div>
          <div className="space-y-3 desk:sticky desk:top-24">
            <SectionCard tone="primary" label="Step 1 of 2" title="Box the ingredients">
              <p className="text-[15px] leading-snug text-ink">
                Drag the box around just the ingredients list. Leave out pictures and other text.
              </p>
              <p className="mt-2 hidden text-sm text-muted desk:block">
                Arrow keys move the box; Shift and arrow keys resize it.
              </p>
            </SectionCard>
            <button type="button" onClick={() => read(rect, false)} disabled={!online} className={primaryButtonClass}>
              Read this part
            </button>
            <button type="button" onClick={() => read(WHOLE_PHOTO, false)} disabled={!online} className={secondaryButtonClass}>
              Use whole photo
            </button>
            <button type="button" onClick={takePhoto} className={tertiaryButtonClass}>
              <CameraIcon className="size-5" />
              Retake photo
            </button>
          </div>
        </div>
      )}

      {state.step === "reading" && (
        <div className="space-y-3">
          <div role="status" className="glass flex flex-col items-center gap-3 rounded-[28px] p-7 text-center">
            <span
              aria-hidden="true"
              className="size-10 animate-spin rounded-full border-4 border-primary/25 border-t-primary motion-reduce:animate-none"
            />
            <p className="text-base font-bold text-ink">{progressText(state.progress)}</p>
            <p className="text-sm text-muted">This happens on your phone.</p>
          </div>
          <button type="button" onClick={cancelReading} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      )}

      {state.step === "review" && photo && (
        <div className="space-y-4 desk:grid desk:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] desk:items-start desk:gap-5 desk:space-y-0">
          {/* Desktop: the cropped photo beside the text, to compare. Phones: folded away (the pack is in your hand). */}
          <div className="hidden desk:sticky desk:top-24 desk:block">
            <SectionCard tone="neutral" label="Your photo">
              <CropPreview src={photo.url} rect={state.read.crop} />
            </SectionCard>
          </div>

          <div className="space-y-4">
            <PhotoReview read={state.read} />
            <details className="group glass rounded-card p-4 desk:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-primary-ink [&::-webkit-details-marker]:hidden">
                Show my photo
                <ChevronRightIcon className="size-5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              </summary>
              <div className="mt-3">
                <CropPreview src={photo.url} rect={state.read.crop} />
              </div>
            </details>
            <TextBox
              label="Text read from your photo"
              hint="Check it against the label and fix any mistakes before checking."
              text={text}
              onChange={setText}
            />
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  submit({
                    source: "photo",
                    text,
                    ocrText: state.read.ocrText,
                    ocrConfidence: state.read.summary.confidence,
                  })
                }
                disabled={pending || !online || text.trim() === ""}
                className={primaryButtonClass}
              >
                {pending ? "Checking…" : "Check ingredients"}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setState({ step: "crop" })} disabled={pending} className={secondaryButtonClass}>
                  Adjust the box
                </button>
                <button type="button" onClick={takePhoto} disabled={pending} className={secondaryButtonClass}>
                  <CameraIcon className="size-5" />
                  Retake photo
                </button>
              </div>
              {!state.read.boosted && (
                <button
                  type="button"
                  onClick={() => read(state.read.crop, true)}
                  disabled={pending || !online}
                  className={tertiaryButtonClass}
                >
                  Text looks wrong? Boost faded or shiny text
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state.step === "paste" && (
        <div className="space-y-4">
          <SectionCard tone="primary" label="Paste the ingredients">
            <p className="flex gap-3 text-[15px] leading-snug text-ink">
              <ClipboardIcon className="mt-0.5 size-5 shrink-0 text-primary-ink" />
              {PASTE_TIP}
            </p>
          </SectionCard>
          <TextBox
            label="Ingredients you pasted"
            hint="Check the pasted text matches the label. You can edit it."
            text={text}
            onChange={setText}
            onPaste={(pasted) => joinOcrLines(pasted)}
            autoFocus
          />
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => submit({ source: "paste", text })}
              disabled={pending || !online || text.trim() === ""}
              className={primaryButtonClass}
            >
              {pending ? "Checking…" : "Check ingredients"}
            </button>
            <button type="button" onClick={backToStart} disabled={pending} className={secondaryButtonClass}>
              <CameraIcon className="size-5" />
              Take a photo instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TileIcon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex size-[46px] items-center justify-center rounded-[14px] bg-band text-primary-ink">
      {children}
    </span>
  );
}

/** Low-confidence and no-text messages for a photo read. */
function PhotoReview({ read }: { read: Read }) {
  if (read.ocrText.trim() === "") {
    return (
      <p role="alert" className={noticeClass}>
        We couldn&apos;t find any text. Adjust the box around the ingredients, or retake the photo closer and in good
        light. You can also type the ingredients below.
      </p>
    );
  }
  if (read.summary.confidence >= DEFAULT_MIN_OCR_CONFIDENCE) return null;
  return (
    <div role="alert" className={`${noticeClass} space-y-2`}>
      <p>
        Parts of this label weren&apos;t read clearly. They may be blurred, or in another language such as Hindi, which
        AllergyGuard can&apos;t read yet. Compare the text with the label and fix any mistakes. Your result will be
        Caution, not Safe.
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
  );
}

function TextBox(props: {
  label: string;
  hint: string;
  text: string;
  onChange: (t: string) => void;
  /** Transforms pasted text before it is inserted at the cursor. */
  onPaste?: (pasted: string) => string;
  autoFocus?: boolean;
}) {
  const { label, hint, text, onChange, onPaste, autoFocus } = props;

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onPaste) return;
    const pasted = e.clipboardData.getData("text/plain");
    if (!pasted) return;
    e.preventDefault();
    const box = e.currentTarget;
    const start = box.selectionStart ?? text.length;
    const end = box.selectionEnd ?? text.length;
    onChange(text.slice(0, start) + onPaste(pasted) + text.slice(end));
  }

  return (
    <div className="glass rounded-card p-5">
      <label htmlFor="label-text" className={labelClass}>
        {label}
      </label>
      <p id="label-text-hint" className="mb-3 mt-1.5 text-sm text-muted">
        {hint}
      </p>
      <textarea
        id="label-text"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        rows={10}
        spellCheck={false}
        autoFocus={autoFocus}
        aria-describedby="label-text-hint"
        className="block w-full rounded-field border border-field-line bg-white/80 p-4 text-base leading-relaxed text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/25"
      />
    </div>
  );
}
