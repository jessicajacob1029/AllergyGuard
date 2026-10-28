"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { moveRect, resizeRect, type Corner, type CropRect } from "@/lib/ocr/crop";

type Drag = { kind: "move" } | { kind: "resize"; corner: Corner };

const isCorner = (v: string | null | undefined): v is Corner => v === "nw" || v === "ne" || v === "sw" || v === "se";

const CORNERS: { corner: Corner; className: string; label: string }[] = [
  { corner: "nw", className: "-left-[22px] -top-[22px] cursor-nwse-resize", label: "Top-left corner" },
  { corner: "ne", className: "-right-[22px] -top-[22px] cursor-nesw-resize", label: "Top-right corner" },
  { corner: "sw", className: "-bottom-[22px] -left-[22px] cursor-nesw-resize", label: "Bottom-left corner" },
  { corner: "se", className: "-bottom-[22px] -right-[22px] cursor-nwse-resize", label: "Bottom-right corner" },
];

/**
 * A box the user drags over the photo to pick just the ingredients list.
 * Drag inside to move it, drag a corner to resize it. Arrow keys move it;
 * Shift + arrow keys resize it from the bottom-right corner.
 */
export function CropBox({ src, rect, onChange }: { src: string; rect: CropRect; onChange: (r: CropRect) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Drag; x: number; y: number; start: CropRect } | null>(null);

  function begin(e: PointerEvent<HTMLElement>) {
    e.preventDefault();
    // A corner handle (or anything inside it) resizes; the rest of the box moves.
    const corner = (e.target as HTMLElement).closest("[data-corner]")?.getAttribute("data-corner");
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode: isCorner(corner) ? { kind: "resize", corner } : { kind: "move" },
      x: e.clientX,
      y: e.clientY,
      start: rect,
    };
  }

  function move(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!d || !box || box.width === 0 || box.height === 0) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    onChange(d.mode.kind === "move" ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.mode.corner, dx, dy));
  }

  function end() {
    drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = 0.02;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(e.shiftKey ? resizeRect(rect, "se", d[0], d[1]) : moveRect(rect, d[0], d[1]));
  }

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div ref={frame} className="relative w-full select-none overflow-hidden rounded-card bg-viewfinder">
      {/* A local blob: URL for this device only; next/image can't optimise it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Your label photo" draggable={false} className="block w-full" />
      <div
        role="group"
        aria-label="Crop box. Drag to move, drag a corner to resize. Arrow keys move it, Shift and arrow keys resize it."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        data-testid="crop-box"
        className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline-none focus-visible:border-primary"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
      >
        {CORNERS.map(({ corner, className, label }) => (
          <span
            key={corner}
            aria-label={label}
            data-testid={`crop-${corner}`}
            data-corner={corner}
            className={`absolute flex size-11 touch-none items-center justify-center ${className}`}
          >
            <span aria-hidden="true" className="size-5 rounded-full border-2 border-primary bg-white shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}
