const SENSITIVE_KEYS = new Set([
  "secret",
  "secretkey",
  "prava_secret_key",
  "authorization",
  "session_token",
  "sessiontoken",
  "token",
  "dynamic_cvv",
  "dynamiccvv",
  "cvv",
  "card_number",
  "cardnumber",
  "pan",
]);

const REDACTED = "[REDACTED]";

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTED;
      } else {
        result[key] = redact(val, seen);
      }
    }
    return result;
  }

  return value;
}
