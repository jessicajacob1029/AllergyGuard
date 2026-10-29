// What a saved scan is called in lists (scan history, "Latest scans" on home).
// Pure, no network.

/** The columns of public.scans that the label needs. */
export type ScanLabelRow = {
  /** 'camera' | 'manual' (barcode), 'photo' | 'paste' (label text, Phase 5 rows). */
  input: string;
  barcode: string | null;
  product_name: string | null;
  brands: string | null;
};

/** `subtitle` is null when there is nothing to show: never "undefined" or an empty line. */
export type ScanLabel = { title: string; subtitle: string | null };

/**
 * Rules:
 * - product name present → title is the name, subtitle is the brand if present
 * - barcode scan with no name → "Unknown product", subtitle "Barcode <barcode>"
 * - input 'photo' → "Label photo"; input 'paste' → "Pasted ingredients"
 * - missing (or empty) brand → no subtitle
 */
export function scanLabel(row: ScanLabelRow): ScanLabel {
  const name = row.product_name?.trim();
  const brand = row.brands?.trim();

  // A known product: its name, with the brand underneath if there is one.
  if (name) return { title: name, subtitle: brand ? brand : null };

  // Label text (Phase 5) has no product: say where the text came from.
  if (row.input === "photo") return { title: "Label photo", subtitle: null };
  if (row.input === "paste") return { title: "Pasted ingredients", subtitle: null };

  // A barcode that wasn't found: clearly not a known product, but show which one.
  const barcode = row.barcode?.trim();
  return { title: "Unknown product", subtitle: barcode ? `Barcode ${barcode}` : null };
}
