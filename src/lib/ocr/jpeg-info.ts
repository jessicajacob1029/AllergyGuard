// Reads a JPEG's EXIF orientation and stored pixel size from its first bytes.
// Pure. Used to check the browser really applied the rotation before OCR:
// iPhone portrait photos are stored sideways with Orientation 6.

export type JpegInfo = {
  /** EXIF Orientation 1–8; 1 when absent. */
  orientation: number;
  /** Size as stored in the file, before any rotation. */
  width: number;
  height: number;
};

/** Orientations 5–8 swap width and height when displayed. */
export const swapsSides = (orientation: number) => orientation >= 5 && orientation <= 8;

function readExifOrientation(view: DataView, start: number, length: number): number | null {
  // "Exif\0\0" then a TIFF header.
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > start + length) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > start + length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Null when the bytes aren't a JPEG with a readable frame header. */
export function readJpegInfo(bytes: ArrayBuffer): JpegInfo | null {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    const body = offset + 4;
    if (marker === 0xe1 && body + length - 2 <= view.byteLength) {
      orientation = readExifOrientation(view, body, length - 2) ?? orientation;
    }
    // Start of frame (SOF0–SOF15, except DHT/JPG/DAC): height then width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (body + 5 > view.byteLength) return null;
      return { orientation, height: view.getUint16(body + 1), width: view.getUint16(body + 3) };
    }
    offset += 2 + length;
  }
  return null;
}
