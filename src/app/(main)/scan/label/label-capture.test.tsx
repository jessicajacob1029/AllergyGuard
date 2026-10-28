// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrOutput } from "@/lib/ocr/run-ocr";

const checkLabel = vi.hoisted(() => vi.fn());
const readLabelPhoto = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ checkLabel }));
vi.mock("@/lib/ocr/run-ocr", () => ({ readLabelPhoto }));

import { LabelCapture } from "./label-capture";

const CLEAR: OcrOutput = {
  text: "INGREDIENTS: Sugar, cocoa butter,\nmilk powder. May contain traces of\npeanuts.",
  lines: [
    { text: "INGREDIENTS: Sugar, cocoa butter,", confidence: 95 },
    { text: "milk powder. May contain traces of", confidence: 93 },
    { text: "peanuts.", confidence: 96 },
  ],
};
const BILINGUAL: OcrOutput = {
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

async function takePhoto(out: OcrOutput) {
  readLabelPhoto.mockResolvedValueOnce(out);
  const user = userEvent.setup();
  render(<LabelCapture />);
  await user.upload(screen.getByTestId("camera-input"), photo());
  await screen.findByLabelText("Text read from your photo");
  return user;
}

const textBox = () => screen.getByLabelText("Text read from your photo") as HTMLTextAreaElement;

describe("LabelCapture: before the photo", () => {
  it("shows the tips, the privacy note and both ways to add a photo", () => {
    render(<LabelCapture />);
    expect(screen.getByText(/Good light/)).toBeTruthy();
    expect(screen.getByText(/Hold the label flat/)).toBeTruthy();
    expect(screen.getByText(/Fill the frame/)).toBeTruthy();
    expect(screen.getByText(/Hindi can't be read yet/)).toBeTruthy();
    expect(screen.getByText(/The photo stays on your phone/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose from photos" })).toBeTruthy();
    // The camera input opens the rear camera on phones.
    expect(screen.getByTestId("camera-input").getAttribute("capture")).toBe("environment");
  });

  it("disables taking a photo while offline", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<LabelCapture />);
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Take photo/ }) as HTMLButtonElement).disabled).toBe(true);
    onLine.mockRestore();
  });
});

describe("LabelCapture: review", () => {
  it("shows the extracted text with wrapped lines joined, ready to edit", async () => {
    await takePhoto(CLEAR);
    expect(textBox().value).toBe("INGREDIENTS: Sugar, cocoa butter, milk powder. May contain traces of peanuts.");
    expect(screen.getByAltText("Your label photo").getAttribute("src")).toBe("blob:local-preview");
    expect(screen.queryByText(/weren't read clearly/)).toBeNull();
  });

  it("sends only the text, the OCR text and the confidence: never the photo", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await takePhoto(CLEAR);
    await user.click(screen.getByRole("button", { name: "Check ingredients" }));
    expect(checkLabel).toHaveBeenCalledTimes(1);
    const [arg, ...rest] = checkLabel.mock.calls[0];
    expect(rest).toEqual([]);
    expect(Object.keys(arg).sort()).toEqual(["ocrConfidence", "ocrText", "text"]);
    expect(arg).toEqual({
      text: "INGREDIENTS: Sugar, cocoa butter, milk powder. May contain traces of peanuts.",
      ocrText: CLEAR.text,
      ocrConfidence: 93,
    });
  });

  it("checks the edited text", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await takePhoto(CLEAR);
    await user.clear(textBox());
    await user.type(textBox(), "Sugar, whey");
    await user.click(screen.getByRole("button", { name: "Check ingredients" }));
    expect(checkLabel.mock.calls[0][0]).toMatchObject({ text: "Sugar, whey", ocrConfidence: 93 });
  });

  it("low confidence: a plain message, the unclear lines, and the low confidence is still sent after edits", async () => {
    checkLabel.mockResolvedValue(undefined);
    const user = await takePhoto(BILINGUAL);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("weren't read clearly");
    expect(alert.textContent).toContain("Hindi");
    expect(alert.textContent).toContain("Your result will be Caution, not Safe.");
    expect(alert.textContent).toContain("“HAART: TE, FT AT, LF q13eY”");
    await user.clear(textBox());
    await user.type(textBox(), "INGREDIENTS: Wheat flour, sugar");
    await user.click(screen.getByRole("button", { name: "Check ingredients" }));
    expect(checkLabel.mock.calls[0][0]).toMatchObject({ ocrConfidence: 25 });
  });

  it("no text found: says so and won't check an empty box", async () => {
    await takePhoto({ text: "", lines: [] });
    expect(screen.getByRole("alert").textContent).toContain("couldn't find any text");
    expect((screen.getByRole("button", { name: "Check ingredients" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a Server Action error", async () => {
    checkLabel.mockResolvedValue({ error: "We checked the label but couldn't save the result. Try again." });
    const user = await takePhoto(CLEAR);
    await user.click(screen.getByRole("button", { name: "Check ingredients" }));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't save the result");
  });

  it("Retake photo opens the camera again, and a new photo replaces the text", async () => {
    const user = await takePhoto(CLEAR);
    const camera = screen.getByTestId("camera-input") as HTMLInputElement;
    const click = vi.spyOn(camera, "click");
    await user.click(screen.getByRole("button", { name: /Retake photo/ }));
    expect(click).toHaveBeenCalled();
    readLabelPhoto.mockResolvedValueOnce({ text: "Rice, salt", lines: [{ text: "Rice, salt", confidence: 90 }] });
    await user.upload(camera, photo());
    await waitFor(() => expect(textBox().value).toBe("Rice, salt"));
  });
});

describe("LabelCapture: reading", () => {
  it("shows progress, and a failure brings back the start screen with a message", async () => {
    let fail!: (e: Error) => void;
    readLabelPhoto.mockImplementationOnce((_photo, onProgress) => {
      onProgress({ stage: "reading", progress: 0.4 });
      return new Promise((_, reject) => (fail = reject));
    });
    const user = userEvent.setup();
    render(<LabelCapture />);
    await user.upload(screen.getByTestId("camera-input"), photo());
    expect(await screen.findByText("Reading the label… 40%")).toBeTruthy();
    fail(new Error("worker failed"));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't read this photo");
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeTruthy();
  });

  it("Cancel stops reading and goes back to the start", async () => {
    let signal!: AbortSignal;
    readLabelPhoto.mockImplementationOnce((_p, _o, s: AbortSignal) => {
      signal = s;
      return new Promise(() => {});
    });
    const user = userEvent.setup();
    render(<LabelCapture />);
    await user.upload(screen.getByTestId("camera-input"), photo());
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeTruthy();
  });
});
