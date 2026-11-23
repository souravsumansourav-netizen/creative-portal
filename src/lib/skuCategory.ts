/**
 * Tanishq product code logic (studded / finished jewellery), hard-coded from "Jew_Product Code Logic".
 *
 *   digits 1-2   karatage / product type   (50 = 18KT, 51 = 22KT, ...)
 *   digits 3-6   theme / collection
 *   digit  7     PRODUCT CATEGORY          <- what this file decodes
 *   digits 8-9   design,  10 size,  11 finding,  12 customisation,  13-14 stone proliferation
 *
 * Example: 50D6C4BWJLAP1  ->  "50" 18KT, "D6C4" theme, "B" = bracelet.
 */

/** Valid values for digits 1-2. A code that doesn't start with one of these isn't a product code we can read. */
const KARATAGE = new Set(["50", "51", "52", "53", "54", "55", "74", "A1", "A2", "A3", "A5", "60", "70", "80"]);

/** Digit 7. `group` is what the Triage filter shows; `label` is the exact meaning from the document. */
const CATEGORY_BY_DIGIT: Record<string, { group: string; label: string }> = {
  B: { group: "Bracelets", label: "Bracelet" },
  C: { group: "Chains", label: "Chain" },
  D: { group: "Earrings", label: "Drop earring" },
  F: { group: "Finger rings", label: "Finger ring / wide ring" },
  H: { group: "Earrings", label: "Hoop earring" },
  K: { group: "Tikka", label: "Tikka" },
  N: { group: "Neckwear", label: "Neckwear / collar / choker" },
  O: { group: "Nose pins", label: "Nose pin" },
  P: { group: "Pendants", label: "Pendant / mangal sutra pendant" },
  S: { group: "Earrings", label: "Stud earring" },
  U: { group: "Others", label: "Spectacle" },
  V: { group: "Bangles", label: "Bangle" },
  X: { group: "Others", label: "Other (ear jacket, anklet, pendant jacket, cuff link, collet, idol, charms, brooch, mattal, tie pin, armlet, kurta button)" },
  Y: { group: "Mangal sutra", label: "Mangal sutra" },
  Z: { group: "Coins", label: "Coin" },
  "1": { group: "Sets", label: "Pendant + earring" },
  "2": { group: "Sets", label: "Neckwear + earring" },
  "3": { group: "Sets", label: "Neckwear + earring + tikka" },
  "4": { group: "Sets", label: "Neckwear + earring + tikka + bangle" },
  "6": { group: "Sets", label: "Neckwear + earring + finger ring" },
  "8": { group: "Sets", label: "Neckwear + earring + tikka + finger ring" },
};

export const UNRECOGNISED = "Unrecognised";

/** The order the filter chips appear in. Anything not listed is appended. */
export const CATEGORY_ORDER = [
  "Bracelets", "Chains", "Earrings", "Finger rings", "Neckwear", "Pendants", "Bangles", "Sets",
  "Tikka", "Nose pins", "Mangal sutra", "Coins", "Others", UNRECOGNISED,
];

export type SkuCategory = {
  /** Filter group, e.g. "Earrings". "Unrecognised" if the code can't be read. */
  group: string;
  /** Precise meaning, e.g. "Stud earring". Empty when unrecognised. */
  label: string;
  /** The category character itself (digit 7), upper-cased, or null. */
  digit: string | null;
};

/** Reads the category out of a SKU code. Case and stray spaces / hyphens don't matter. */
export function categoryOf(sku: string | null | undefined): SkuCategory {
  const code = (sku ?? "").toUpperCase().replace(/[\s-]/g, "");
  const hit = code.length >= 7 && KARATAGE.has(code.slice(0, 2)) ? CATEGORY_BY_DIGIT[code[6]] : undefined;
  return hit ? { ...hit, digit: code[6] } : { group: UNRECOGNISED, label: "", digit: null };
}

/** Counts per group for a list of SKU codes, in display order (only groups that actually occur). */
export function categoryCounts(skus: (string | null | undefined)[]): { group: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of skus) {
    const g = categoryOf(s).group;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const known = CATEGORY_ORDER.filter((g) => counts.has(g));
  const extra = [...counts.keys()].filter((g) => !CATEGORY_ORDER.includes(g));
  return [...known, ...extra].map((group) => ({ group, count: counts.get(group)! }));
}
