import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSymptom, isTreatment, SYMPTOM_LABELS, SYMPTOMS, TREATMENT_LABELS, TREATMENTS } from "./codes";

function enumValues(typeName: string): string[] {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  const match = sql.match(new RegExp(`create type public\\.${typeName} as enum \\(([^)]*)\\)`, "i"));
  if (!match) throw new Error(`enum ${typeName} not found in migrations`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("diary codes", () => {
  it("match the enums in the database migration", () => {
    expect([...SYMPTOMS]).toEqual(enumValues("reaction_symptom"));
    expect([...TREATMENTS]).toEqual(enumValues("reaction_treatment"));
  });

  it("keep lips or throat swelling separate from general swelling", () => {
    expect(SYMPTOM_LABELS.swelling).toBe("Swelling");
    expect(SYMPTOM_LABELS.lips_throat_swelling).toBe("Lips or throat swelling");
  });

  it("label every treatment, including EpiPen as adrenaline", () => {
    expect(TREATMENT_LABELS).toEqual({
      none: "None",
      antihistamine: "Antihistamine",
      adrenaline: "EpiPen (adrenaline)",
      hospital: "Hospital or ER",
    });
  });

  it("recognise only known values", () => {
    expect(isSymptom("itching")).toBe(true);
    expect(isSymptom("sneezing")).toBe(false);
    expect(isSymptom(3)).toBe(false);
    expect(isTreatment("adrenaline")).toBe(true);
    expect(isTreatment("epipen")).toBe(false);
    expect(isTreatment(null)).toBe(false);
  });
});
