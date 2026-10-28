"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ClipboardEvent, type ReactNode } from "react";
import {
  formAlertClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tertiaryButtonClass,
} from "@/components/form-styles";
import { SectionCard } from "@/components/ui/section-card";
import { DEFAULT_MIN_OCR_CONFIDENCE } from "@/lib/allergen/check";
import { DEFAULT_CROP, WHOLE_PHOTO, type CropRect } from "@/lib/ocr/crop";
import { joinOcrLines } from "@/lib/ocr/ocr-text";
import { prepareOcrText } from "@/lib/ocr/prepare-text";
import type { OcrOutput, OcrProgress } from "@/lib/ocr/run-ocr";
import { summarizeOcr, type OcrSummary } from "@/lib/ocr/summary";
import { useOnline } from "@/lib/use-online";
import { checkLabel } from "./actions";
import { CropBox } from "./crop-box";

type Read = { ocrText: string; summary: OcrSummary; boosted: boolean; debug: OcrOutput | null };

type State =
  | { step: "start" }
  | { step: "crop" }
  | { step: "reading"; progress: OcrProgress }
  | { step: "review"; read: Read }
  | { step: "paste" };

type Photo = { blob: Blob; url: string };

const TIPS = [
  ["💡", "Good light, no glare or shadow on the text."],
  ["📄", "Hold the label flat. Smooth out a crinkled packet."],
  ["🔍", "Get close: the ingredients should fill most of the photo."],
  ["✋", "Hold still until the photo is sharp."],
  ["📐", "Next, you'll drag a box around just the ingredients."],
  ["🔤", "English text only for now. Hindi can't be read yet."],
] as const;

export const PASTE_TIP = "On iPhone, open the photo, press and hold the text, then Copy.";

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
export function LabelCapture({ debug = false }: { debug?: boolean }) {
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
        debug,
      });
      if (controller.signal.aborted) return;
      setText(prepareOcrText(out.text));
      setState({
        step: "review",
        read: { ocrText: out.text, summary: summarizeOcr(out.lines), boosted: boost, debug: debug ? out : null },
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
    <div className="space-y-6">
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
            <button type="button" onClick={takePhoto} disabled={!online} className={primaryButtonClass}>
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
          </div>
          <div className="space-y-2 rounded-card border border-line bg-card p-4">
            <button type="button" onClick={startPaste} disabled={!online} className={tertiaryButtonClass}>
              <span aria-hidden="true">📋</span>
              Paste text instead
            </button>
            <p className="text-sm font-semibold text-muted">{PASTE_TIP}</p>
          </div>
          <Link href="/scan" className="block text-center text-sm font-bold text-primary-ink underline">
            Scan a barcode instead
          </Link>
        </>
      )}

      {state.step === "crop" && photo && (
        <>
          <p className="text-base font-bold text-ink">
            Drag the box around just the ingredients list. Leave out pictures and other text.
          </p>
          <CropBox src={photo.url} rect={rect} onChange={setRect} />
          <div className="space-y-3">
            <button type="button" onClick={() => read(rect, false)} disabled={!online} className={primaryButtonClass}>
              Read this part
            </button>
            <button type="button" onClick={() => read(WHOLE_PHOTO, false)} disabled={!online} className={secondaryButtonClass}>
              Use whole photo
            </button>
            <button type="button" onClick={takePhoto} className={tertiaryButtonClass}>
              <span aria-hidden="true">📷</span>
              Retake photo
            </button>
          </div>
        </>
      )}

      {state.step === "reading" && (
        <>
          <div role="status" className="flex flex-col items-center gap-3 rounded-card bg-band p-6 text-center">
            <span
              aria-hidden="true"
              className="size-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary motion-reduce:animate-none"
            />
            <p className="text-base font-extrabold text-primary-ink">{progressText(state.progress)}</p>
            <p className="text-sm font-semibold text-muted">This happens on your phone.</p>
          </div>
          <button type="button" onClick={cancelReading} className={secondaryButtonClass}>
            Cancel
          </button>
        </>
      )}

      {state.step === "review" && (
        <>
          <PhotoReview read={state.read} />
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
            <button type="button" onClick={() => setState({ step: "crop" })} disabled={pending} className={secondaryButtonClass}>
              Adjust the box
            </button>
            <button type="button" onClick={takePhoto} disabled={pending} className={secondaryButtonClass}>
              <span aria-hidden="true">📷</span>
              Retake photo
            </button>
            {!state.read.boosted && (
              <button type="button" onClick={() => read(rect, true)} disabled={pending || !online} className={tertiaryButtonClass}>
                Text looks wrong? Boost faded or shiny text
              </button>
            )}
          </div>
          {state.read.debug && <DebugPanel out={state.read.debug} />}
        </>
      )}

      {state.step === "paste" && (
        <>
          <p className="rounded-card border border-line bg-band p-3 text-sm font-semibold text-ink">{PASTE_TIP}</p>
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
              <span aria-hidden="true">📷</span>
              Take a photo instead
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Low-confidence and no-text messages for a photo read. */
function PhotoReview({ read }: { read: Read }) {
  if (read.ocrText.trim() === "") {
    return (
      <p role="alert" className="rounded-card border border-caution-ink/30 bg-caution-band p-3 text-sm font-bold text-caution-ink">
        We couldn&apos;t find any text. Adjust the box around the ingredients, or retake the photo closer and in good
        light. You can also type the ingredients below.
      </p>
    );
  }
  if (read.summary.confidence >= DEFAULT_MIN_OCR_CONFIDENCE) return null;
  return (
    <div role="alert" className="space-y-2 rounded-card border border-caution-ink/30 bg-caution-band p-3 text-sm font-bold text-caution-ink">
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
    <div>
      <label htmlFor="label-text" className={labelClass}>
        {label}
      </label>
      <p id="label-text-hint" className="mb-2 mt-1 text-sm font-semibold text-muted">
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
        className="w-full rounded-field border-2 border-line bg-card p-3 text-base leading-relaxed text-ink focus:border-primary focus:outline-none"
      />
    </div>
  );
}

// TEMPORARY (Phase 5 iPhone diagnosis, preview deployments only): shows exactly
// what Tesseract got and read. Remove before merging to main.
function DebugPanel({ out }: { out: OcrOutput }) {
  const { info } = out;
  const rows: [string, ReactNode][] = [
    ["File", `${info.fileType}, ${Math.round(info.fileBytes / 1024)} KB`],
    [
      "EXIF",
      info.jpeg
        ? `orientation ${info.jpeg.orientation}, stored ${info.jpeg.width}×${info.jpeg.height}`
        : "not a JPEG / no EXIF read",
    ],
    ["Decoded", `${info.decoded.width}×${info.decoded.height} via ${info.decoder}`],
    ["Rotation", info.rotation],
    ["Crop", `${info.crop.width}×${info.crop.height} at ${info.crop.left},${info.crop.top}`],
    [
      "Steps",
      Object.entries(info.steps)
        .filter(([, on]) => on)
        .map(([k]) => k)
        .join(", ") || "none",
    ],
    [
      "Reads",
      info.passes
        .map((p) => `${p.width}×${p.height} (scale ${p.scale}), median line ${p.medianLineHeight} px${p.kept ? ", kept" : ""}`)
        .join(" · "),
    ],
    ["Time", `${out.ms} ms`],
    ["User agent", typeof navigator === "undefined" ? "" : navigator.userAgent],
  ];
  return (
    <details open className="rounded-card border-2 border-dashed border-line bg-card p-3 text-xs text-ink">
      <summary className="cursor-pointer font-extrabold">Debug (preview only)</summary>
      {out.sentImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={out.sentImage} alt="Exact image sent to Tesseract" className="mt-2 w-full border border-line" />
      )}
      <table className="mt-2 w-full">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="align-top">
              <th className="pr-2 text-left font-bold">{k}</th>
              <td className="break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-bold">Lines (confidence · height px · text)</p>
      <ol className="mt-1 space-y-1 font-mono">
        {out.lines.map((l, i) => (
          <li key={i} className="break-words">
            {Math.round(l.confidence)} · {l.height} · {l.text}
          </li>
        ))}
      </ol>
      <p className="mt-2 font-bold">Raw text</p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{out.text}</pre>
    </details>
  );
}
