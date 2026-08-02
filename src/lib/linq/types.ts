/** Sanitized outcome of a single Linq send attempt — never the raw response body. */
export interface LinqSendResult {
  success: true;
  httpStatus: number;
  chatIdPresent: boolean;
  chatIdSuffix: string | null;
}

export type LinqFailureCategory =
  | "CONFIG_MISSING"
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "CLIENT_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "ALREADY_IN_PROGRESS"
  | "UNKNOWN";
