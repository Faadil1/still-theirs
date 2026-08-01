export type GateA2Stage =
  | "SDK_INITIALIZATION"
  | "IFRAME_LOADING"
  | "CARD_VALIDATION"
  | "SECURITY_CHECK"
  | "WEBAUTHN_REQUESTED"
  | "WEBAUTHN_REJECTED"
  | "COMPLETION"
  | "UNKNOWN";

export interface GateA2Diagnostics {
  stage: GateA2Stage;
  pravaErrorCode: string | null;
  sanitizedMessageCategory: string | null;
  passkeyPromptObserved: boolean;
  onErrorObserved: boolean;
  onDismissObserved: boolean;
  promiseRejected: boolean;
  responseIdSuffix: string | null;
}

const KNOWN_SDK_CODES = new Set([
  "SDK_ALREADY_ACTIVE",
  "INVALID_CONFIG",
  "IFRAME_LOAD_ERROR",
  "SDK_INIT_ERROR",
  "PUBLISHABLE_KEY_MISSING",
]);

/**
 * Extracts the SDK's documented error code verbatim when present. Never
 * invents a code — falls back to the explicit sentinel "UNAVAILABLE" so a
 * missing code is visibly distinct from a real one.
 */
export function extractPravaErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "UNAVAILABLE";
}

/**
 * Categorizes a human-readable message into a small safe bucket, without
 * ever echoing the raw message text.
 */
export function categorizeMessage(message: unknown): string | null {
  if (typeof message !== "string" || message.length === 0) return null;
  if (/security check/i.test(message)) return "SECURITY_CHECK_FAILED";
  if (/passkey|webauthn|biometric/i.test(message)) return "AUTHENTICATION_FAILED";
  if (/card|expir|cvv/i.test(message)) return "CARD_VALIDATION_FAILED";
  if (/timed? ?out/i.test(message)) return "TIMEOUT";
  if (/network|connection/i.test(message)) return "NETWORK_ERROR";
  return "GENERIC_FAILURE";
}

/**
 * Extracts a truncated response/request id from PravaError.details if one
 * is present under a recognized key. Never returns a full identifier.
 */
export function extractResponseIdSuffix(err: unknown, suffix6: (v: string | null | undefined) => string | null): string | null {
  if (!err || typeof err !== "object") return null;
  const details = (err as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;

  const candidateKeys = ["responseId", "response_id", "requestId", "request_id", "x-response-id"];
  for (const key of candidateKeys) {
    const value = (details as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return suffix6(value);
  }
  return null;
}

export function isKnownSdkCode(code: string): boolean {
  return KNOWN_SDK_CODES.has(code);
}
