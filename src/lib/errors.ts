const EMPTY_OBJECT_TEXT = /^\[object Object\]$/i;

export function errorMessage(value: unknown, fallback = "Something went wrong"): string {
  const seen = new Set<unknown>();

  function read(input: unknown, depth: number): string {
    if (depth > 5 || input == null) return "";
    if (typeof input === "string") {
      const text = input.trim();
      if (!text || EMPTY_OBJECT_TEXT.test(text)) return "";
      if ((text.startsWith("{") || text.startsWith("[")) && text.length < 10_000) {
        try {
          const decoded = JSON.parse(text);
          const nested = read(decoded, depth + 1);
          if (nested) return nested;
        } catch {
          // It is ordinary text rather than JSON.
        }
      }
      return text;
    }
    if (typeof input === "number" || typeof input === "boolean") {
      return String(input);
    }
    if (typeof input !== "object" || seen.has(input)) return "";
    seen.add(input);

    const record = input as Record<string, unknown>;
    for (const key of ["error", "message", "details", "hint", "description", "cause"]) {
      const nested = read(record[key], depth + 1);
      if (nested) return nested;
    }
    const code = read(record.code, depth + 1);
    return code ? `Server error ${code}` : "";
  }

  return read(value, 0) || fallback;
}
