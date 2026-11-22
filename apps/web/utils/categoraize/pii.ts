/**
 * PII masking for Philippine formats (IAS Phase 11 J). Must behave exactly
 * like fastapi_core/app/nlp/pii.py: both are tested against the shared
 * vectors in fastapi_core/tests/data/pii_vectors.json.
 *
 * Masked, in this order: mobile numbers -> [PHONE]; SSS, PhilHealth and TIN
 * -> [GOV_ID]; payment cards (card-shaped digit groups that pass the Luhn
 * check) -> [CARD]. Dates, amounts and order numbers are left alone.
 * Only counts are kept, never the masked values.
 */

export type PiiCounts = { phone: number; card: number; gov_id: number };

export type PiiMaskResult = { text: string; counts: PiiCounts };

// 09xx / +639xx / 639xx, 10 digits after the 0, with optional single
// space, dot or dash separators (3-3-4 grouping).
const PHONE =
  /(?<![\d+])(?:\+63[ .-]?|63|0)9\d{2}[ .-]?\d{3}[ .-]?\d{4}(?!\d)/g;

// PhilHealth XX-XXXXXXXXX-X, SSS XX-XXXXXXX-X, TIN XXX-XXX-XXX(-XXX to -XXXXX).
const GOV_IDS = [
  /(?<![\d-])\d{2}-\d{9}-\d(?![\d-])/g,
  /(?<![\d-])\d{2}-\d{7}-\d(?![\d-])/g,
  /(?<![\d-])\d{3}-\d{3}-\d{3}(?:-\d{3,5})?(?![\d-])/g,
];

// 4-4-4-(1..7) or Amex 4-6-5, with one consistent separator (or none).
const CARD_CANDIDATE =
  /(?<![\d-])(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -]?)\d{6}\2\d{5})(?![\d-])/g;

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function maskPii(text: string): PiiMaskResult {
  const counts: PiiCounts = { phone: 0, card: 0, gov_id: 0 };
  if (!text) return { text, counts };

  let result = text.replace(PHONE, () => {
    counts.phone += 1;
    return "[PHONE]";
  });
  for (const pattern of GOV_IDS) {
    result = result.replace(pattern, () => {
      counts.gov_id += 1;
      return "[GOV_ID]";
    });
  }
  result = result.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
      return match;
    }
    counts.card += 1;
    return "[CARD]";
  });

  return { text: result, counts };
}

export function totalMasked(counts: PiiCounts): number {
  return counts.phone + counts.card + counts.gov_id;
}

/** Masks every string inside a value (LLM requests: prompt, messages, tool args). */
export function maskPiiDeep<T>(value: T): { value: T; masked: number } {
  let masked = 0;
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      const result = maskPii(item);
      masked += totalMasked(result.counts);
      return result.text;
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") {
      const prototype = Object.getPrototypeOf(item);
      // Only plain objects: leave class instances (URLs, buffers, files) alone.
      if (prototype !== Object.prototype && prototype !== null) return item;
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).map(([key, entry]) => [
          key,
          walk(entry),
        ]),
      );
    }
    return item;
  };
  const next = walk(value) as T;
  return { value: masked ? next : value, masked };
}
