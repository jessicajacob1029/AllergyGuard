// Reaction diary choices. Must match the enums in
// supabase/migrations/20261029000000_reactions.sql (a test checks this).

export const SYMPTOMS = [
  "hives_rash",
  "itching",
  "swelling",
  "lips_throat_swelling",
  "breathing",
  "vomiting",
  "stomach_pain",
  "dizziness",
  "other",
] as const;

export type Symptom = (typeof SYMPTOMS)[number];

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  hives_rash: "Hives or rash",
  itching: "Itching",
  swelling: "Swelling",
  lips_throat_swelling: "Lips or throat swelling",
  breathing: "Breathing trouble",
  vomiting: "Vomiting",
  stomach_pain: "Stomach pain",
  dizziness: "Dizziness or fainting",
  other: "Other",
};

export const TREATMENTS = ["none", "antihistamine", "adrenaline", "hospital"] as const;

export type Treatment = (typeof TREATMENTS)[number];

export const TREATMENT_LABELS: Record<Treatment, string> = {
  none: "None",
  antihistamine: "Antihistamine",
  adrenaline: "EpiPen (adrenaline)",
  hospital: "Hospital or ER",
};

export function isSymptom(value: unknown): value is Symptom {
  return typeof value === "string" && (SYMPTOMS as readonly string[]).includes(value);
}

export function isTreatment(value: unknown): value is Treatment {
  return typeof value === "string" && (TREATMENTS as readonly string[]).includes(value);
}
