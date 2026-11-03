const PII_PATTERNS = [
  /(?:\+63\s?9\d{2}|09\d{2})[\s-]?\d{3}[\s-]?\d{4}\b/g,
  /\b(?:\d[ -]?){13,19}\b/g,
  /\b\d{2}-?\d{7}-?\d\b/g,
  /\b\d{2}-?\d{9}-?\d{1}\b/g,
  /\b\d{3}-?\d{3}-?\d{3}-?\d{3}\b/g,
] as const;

export function scrubCategoraiizePii(text: string): string {
  return PII_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, "[REDACTED]"),
    text,
  );
}
