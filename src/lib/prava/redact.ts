const SENSITIVE_KEYS = new Set([
  "secret",
  "secretkey",
  "secret_key",
  "prava_secret_key",
  "pravasecretkey",
  "authorization",
  "auth",
  "session_token",
  "sessiontoken",
  "token",
  "api_key",
  "apikey",
  "publishable_key",
  "publishablekey",
  "iframe_url",
  "iframeurl",
  "credential",
  "credentials",
  "card",
  "card_number",
  "cardnumber",
  "pan",
  "cvv",
  "dynamic_cvv",
  "dynamiccvv",
  "otp",
  "passkey",
  "assertion",
]);

// Keys whose values are truncated to a six-character suffix rather than
// fully redacted — enough to correlate log lines without exposing the
// full identifier.
const TRUNCATED_ID_KEYS = new Set(["session_id", "sessionid", "order_id", "orderid"]);

const REDACTED = "[REDACTED]";
const REDACTED_URL = "[REDACTED_URL]";

function truncateId(value: string): string {
  if (value.length <= 6) return `...${value}`;
  return `...${value.slice(-6)}`;
}

/** Public helper: last-6-characters suffix for a possibly-undefined identifier. */
export function suffix6(value: string | null | undefined): string | null {
  if (!value) return null;
  return truncateId(value);
}

function isSensitiveUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  // Any query string (e.g. ?session=...) or an embedded JWT-like token
  // (three dot-separated base64url segments) is treated as sensitive.
  return value.includes("?") || /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value);
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (typeof value === "string") {
    return isSensitiveUrl(value) ? REDACTED_URL : value;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = REDACTED;
      } else if (TRUNCATED_ID_KEYS.has(lowerKey) && typeof val === "string") {
        result[key] = truncateId(val);
      } else {
        result[key] = redact(val, seen);
      }
    }
    return result;
  }

  return value;
}
