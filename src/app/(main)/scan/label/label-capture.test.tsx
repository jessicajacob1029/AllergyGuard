// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CROP, WHOLE_PHOTO } from "@/lib/ocr/crop";
import type { OcrOutput } from "@/lib/ocr/run-ocr";
import type { OcrLine } from "@/lib/ocr/summary";

const checkLabel = vi.hoisted(() => vi.fn());
const readLabelPhoto = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ checkLabel }));
vi.mock("@/lib/ocr/run-ocr", () => ({ readLabelPhoto }));

import { LabelCapture, PASTE_TIP } from "./label-capture";

/** What the review step needs; the debug fields are optional for most tests. */
type FakeOcr = { text: string; lines: OcrLine[] };

const CLEAR: FakeOcr = {
  text: "INGREDIENTS: Sugar, cocoa butter,\nmilk powder. May contain traces of\npeanuts. |",
  lines: [
    { text: "INGREDIENTS: Sugar, cocoa butter,", confidence: 95 },
    { text: "milk powder. May contain traces of", confidence: 93 },
    { text: "peanuts. |", confidence: 96 },
  ],
};
const CLEAR_PREPARED = "INGREDIENTS: Sugar, cocoa butter, milk powder. May contain traces of peanuts.";
const BILINGUAL: FakeOcr = {
  text: "HAART: TE, FT AT, LF q13eY\nINGREDIENTS: Wheat flour, sugar",
  lines: [
    { text: "HAART: TE, FT AT, LF q13eY", confidence: 25 },
    { text: "INGREDIENTS: Wheat flour, sugar", confidence: 96 },
  ],
};

const photo = () => new File(["fake jpeg bytes"], "label.jpg", { type: "image/jpeg" });

beforeEach(() => {
  checkLabel.mockReset();
  readLabelPhoto.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const textBox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

/** Takes a photo; the crop step shows. */
async function toCrop() {
  const user = userEvent.setup();
  render(<LabelCapture />);
  await user.upload(screen.getByTestId("camera-input"), photo());
  await screen.findByTestId("crop-box");
  return user;
}

/** Takes a photo and reads the default box; the review step shows. */
async function toReview(out: FakeOcr | OcrOutput) {
  readLabelPhoto.mockResolvedValueOnce(out);
  const user = await toCrop();
  await user.click(button("Read this part"));
  await screen.findByLabelText("Text read from your photo");
  return user;
}

describe("LabelCapture: start screen", () => {
  it("shows the tips, the privacy note, both photo buttons and Paste text with its tip", () => {
    render(<LabelCapture />);
    expect(screen.getByText(/Good light/)).toBeTruthy();
    expect(screen.getByText(/Hold the label flat/)).toBeTruthy();
    expect(screen.getByText(/drag a box around just the ingredients/)).toBeTruthy();
    expect(screen.getByText(/Hindi can't be read yet/)).toBeTruthy();
    expect(screen.getByText(/The photo stays on your phone/)).toBeTruthy();
    expect(button(/Take photo/)).toBeTruthy();
    expect(button("Choose from photos")).toBeTruthy();
    expect(button(/Paste text instead/)).toBeTruthy();
    expect(screen.getByText(PASTE_TIP)).toBeTruthy();
    expect(PASTE_TIP).toBe("On iPhone, open the photo, press and hold the text, then Copy.");
    expect(screen.getByTestId("camera-input").getAttribute("capture")).toBe("environment");
  });

  it("disables photo and paste while offline", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<LabelCapture />);
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect(button(/Take photo/).disabled).toBe(true);
    expect(button(/Paste text instead/).disabled).toBe(true);
    onLine.mockRestore();
  });
});

describe("LabelCapture: crop step", () => {
  it("shows the photo with a box before reading anything", async () => {
    await toCrop();
    expect(screen.getByText(/Drag the box around just the ingredients list/)).toBeTruthy();
    expect(screen.getByAltText("Your label photo").getAttribute("src")).toBe("blob:local-preview");
    expect(readLabelPhoto).not.toHaveBeenCalled();
  });

  it("Read this part reads only the box, sharpened, not boosted", async () => {
    await toReview(CLEAR);
    expect(readLabelPhoto.mock.calls[0][3]).toEqual({ crop: DEFAULT_CROP, boost: false, debug: false });
  });

  it("the arrow keys move the box", async () => {
    readLabelPhoto.mockResolvedValueOnce(CLEAR);
    const user = await toCrop();
    screen.getByTestId("crop-box").focus();
    await user.keyboard("{ArrowRight}");
    await user.click(button("Read this part"));
    const crop = readLabelPhoto.mock.calls[0][3].crop;
    expect(crop.x).toBeCloseTo(DEFAULT_CROP.x + 0.02, 6);
    expect(crop.y).toBeCloseTo(DEFAULT_CROP.y, 6);
  });

  it("Use whole photo reads everything", async () => {
    readLabelPhoto.mockResolvedValueOnce(CLEAR);
    const user = await toCrop();
    await user.click(button("Use whole photo"));
    await screen.findByLabelText("Text read from your photo");
    expect(readLabelPhoto.mock.calls[0][3].crop).toEqual(WHOLE_PHOTO);
  });
});

describe("LabelCapture: review", () => {
  it("shows the text tidied (stray | removed) and wrapped lines joined, ready to edit", async () => {
    await toReview(CLEAR);
    expect(textBox().value).toBe(CLEAR_PREPARED);
    expect(screen.queryByText(/weren't read clearly/)).toBeNull();
  });

  it("sends only the source, the text, the OCR text and the confidence: never the photo", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await toReview(CLEAR);
    await user.click(button("Check ingredients"));
    expect(checkLabel).toHaveBeenCalledTimes(1);
    const [arg, ...rest] = checkLabel.mock.calls[0];
    expect(rest).toEqual([]);
    expect(Object.keys(arg).sort()).toEqual(["ocrConfidence", "ocrText", "source", "text"]);
    expect(arg).toEqual({ source: "photo", text: CLEAR_PREPARED, ocrText: CLEAR.text, ocrConfidence: 93 });
  });

  it("checks the edited text", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await toReview(CLEAR);
    await user.clear(textBox());
    await user.type(textBox(), "Sugar, whey");
    await user.click(button("Check ingredients"));
    expect(checkLabel.mock.calls[0][0]).toMatchObject({ text: "Sugar, whey", ocrConfidence: 93 });
  });

  it("low confidence: a plain message, the unclear lines, and the low confidence is still sent after edits", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await toReview(BILINGUAL);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("weren't read clearly");
    expect(alert.textContent).toContain("Hindi");
    expect(alert.textContent).toContain("Your result will be Caution, not Safe.");
    expect(alert.textContent).toContain("“HAART: TE, FT AT, LF q13eY”");
    await user.clear(textBox());
    await user.type(textBox(), "INGREDIENTS: Wheat flour, sugar");
    await user.click(button("Check ingredients"));
    expect(checkLabel.mock.calls[0][0]).toMatchObject({ ocrConfidence: 25 });
  });

  it("no text found: says so and won't check an empty box", async () => {
    await toReview({ text: "", lines: [] });
    expect(screen.getByRole("alert").textContent).toContain("couldn't find any text");
    expect(button("Check ingredients").disabled).toBe(true);
  });

  it("shows a Server Action error", async () => {
    checkLabel.mockResolvedValue({ error: "We checked the label but couldn't save the result. Try again." });
    const user = await toReview(CLEAR);
    await user.click(button("Check ingredients"));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't save the result");
  });

  it("Adjust the box goes back to the crop step with the same photo", async () => {
    const user = await toReview(CLEAR);
    await user.click(button("Adjust the box"));
    expect(screen.getByTestId("crop-box")).toBeTruthy();
  });

  it("Boost reads the same box again with the threshold step, then hides itself", async () => {
    const user = await toReview(CLEAR);
    readLabelPhoto.mockResolvedValueOnce({ text: "Sugar, cocoa", lines: [{ text: "Sugar, cocoa", confidence: 80 }] });
    await user.click(button(/Boost faded or shiny text/));
    await waitFor(() => expect(textBox().value).toBe("Sugar, cocoa"));
    expect(readLabelPhoto.mock.calls[1][3]).toEqual({ crop: DEFAULT_CROP, boost: true, debug: false });
    expect(screen.queryByRole("button", { name: /Boost/ })).toBeNull();
  });

  it("Retake photo opens the camera again; a new photo goes to the crop step", async () => {
    const user = await toReview(CLEAR);
    const camera = screen.getByTestId("camera-input") as HTMLInputElement;
    const click = vi.spyOn(camera, "click");
    await user.click(button(/Retake photo/));
    expect(click).toHaveBeenCalled();
    await user.upload(camera, photo());
    expect(await screen.findByTestId("crop-box")).toBeTruthy();
  });
});

describe("LabelCapture: reading", () => {
  it("shows progress for each read, and a failure goes back to the crop step with a message", async () => {
    let fail!: (e: Error) => void;
    readLabelPhoto.mockImplementationOnce((_photo, onProgress) => {
      onProgress({ stage: "reading", progress: 0.4, pass: 2 });
      return new Promise((_, reject) => (fail = reject));
    });
    const user = await toCrop();
    await user.click(button("Read this part"));
    expect(await screen.findByText("The text is small. Reading it again, larger… 40%")).toBeTruthy();
    fail(new Error("worker failed"));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't read this photo");
    expect(screen.getByTestId("crop-box")).toBeTruthy();
  });

  it("Cancel stops reading and goes back to the crop step", async () => {
    let signal!: AbortSignal;
    readLabelPhoto.mockImplementationOnce((_p, _o, s: AbortSignal) => {
      signal = s;
      return new Promise(() => {});
    });
    const user = await toCrop();
    await user.click(button("Read this part"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId("crop-box")).toBeTruthy();
  });
});

describe("LabelCapture: paste text instead", () => {
  it("pasted text is joined with joinOcrLines and sent as paste, with no OCR fields", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LabelCapture />);
    await user.click(button(/Paste text instead/));
    const box = screen.getByLabelText("Ingredients you pasted") as HTMLTextAreaElement;
    expect(screen.getByText(PASTE_TIP)).toBeTruthy();
    expect(document.activeElement).toBe(box);
    fireEvent.paste(box, { clipboardData: { getData: () => "Sugar, cocoa butter,\nmilk powder. May contain traces of\npeanuts." } });
    expect(box.value).toBe("Sugar, cocoa butter, milk powder. May contain traces of peanuts.");
    await user.click(button("Check ingredients"));
    expect(checkLabel.mock.calls[0][0]).toEqual({
      source: "paste",
      text: "Sugar, cocoa butter, milk powder. May contain traces of peanuts.",
    });
    expect(readLabelPhoto).not.toHaveBeenCalled();
  });

  it("won't check an empty box, and offers a photo instead", async () => {
    const user = userEvent.setup();
    render(<LabelCapture />);
    await user.click(button(/Paste text instead/));
    expect(button("Check ingredients").disabled).toBe(true);
    await user.click(button(/Take a photo instead/));
    expect(button(/Take photo/)).toBeTruthy();
  });
});

describe("LabelCapture: debug panel (preview deployments only)", () => {
  const withInfo: OcrOutput = {
    ...CLEAR,
    lines: CLEAR.lines.map((l) => ({ ...l, height: 24 })),
    info: {
      fileType: "image/jpeg",
      fileBytes: 2_400_000,
      jpeg: { orientation: 6, width: 4032, height: 3024 },
      decoder: "createImageBitmap",
      decoded: { width: 3024, height: 4032 },
      rotation: "browser",
      crop: { left: 302, top: 403, width: 2419, height: 1210 },
      steps: { contrast: false, sharpen: true, threshold: false },
      passes: [{ width: 2419, height: 1210, scale: 1, medianLineHeight: 24, kept: true }],
    },
    ms: 3100,
    sentImage: "data:image/jpeg;base64,AAAA",
  };

  it("is hidden by default", async () => {
    await toReview(withInfo);
    expect(screen.queryByText("Debug (preview only)")).toBeNull();
  });

  it("shows the image sent, crop, steps, reads and per-line confidence when enabled", async () => {
    readLabelPhoto.mockResolvedValueOnce(withInfo);
    const user = userEvent.setup();
    render(<LabelCapture debug />);
    await user.upload(screen.getByTestId("camera-input"), photo());
    await user.click(await screen.findByRole("button", { name: "Read this part" }));
    await screen.findByText("Debug (preview only)");
    expect(readLabelPhoto.mock.calls[0][3]).toMatchObject({ debug: true });
    expect(screen.getByAltText("Exact image sent to Tesseract").getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(screen.getByText("orientation 6, stored 4032×3024")).toBeTruthy();
    expect(screen.getByText("2419×1210 at 302,403")).toBeTruthy();
    expect(screen.getByText("sharpen")).toBeTruthy();
    expect(screen.getByText("2419×1210 (scale 1), median line 24 px, kept")).toBeTruthy();
    expect(screen.getByText(/93 · 24 · milk powder/)).toBeTruthy();
  });
});
