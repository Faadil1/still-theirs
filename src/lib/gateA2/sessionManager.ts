import { suffix6 } from "@/lib/prava/redact";

export type GateA2Status =
  | "IDLE"
  | "CREATING_SESSION"
  | "READY_FOR_CARD"
  | "AWAITING_USER_AUTHENTICATION"
  | "COMPLETED"
  | "CANCELLED"
  | "SAFE_ERROR";

/** Fields safe to render, log, or audit — never the token or iframe URL. */
export interface GateA2PublicState {
  status: GateA2Status;
  sessionIdPresent: boolean;
  sessionIdSuffix: string | null;
  orderIdPresent: boolean;
  orderIdSuffix: string | null;
  expiresAt: string | null;
  errorCategory: string | null;
}

/** Memory-only fields the SDK needs — never rendered, logged, or persisted. */
interface GateA2PrivateSession {
  sessionId: string;
  orderId: string;
  expiresAt: string;
  sessionToken: string;
  iframeUrl: string;
}

export interface CreateSessionResponseBody {
  sessionId?: unknown;
  orderId?: unknown;
  expiresAt?: unknown;
  sessionToken?: unknown;
  iframeUrl?: unknown;
  error?: unknown;
}

export type FetchSessionFn = () => Promise<{ ok: boolean; status: number; json: () => Promise<CreateSessionResponseBody> }>;

const NOT_STARTABLE_STATUSES: ReadonlySet<GateA2Status> = new Set([
  "CREATING_SESSION",
  "READY_FOR_CARD",
  "AWAITING_USER_AUTHENTICATION",
]);

/**
 * Categorizes a raw error into a small, sanitized set of categories.
 * Never returns or embeds the raw error message/object.
 */
export function categorizeError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  return "UNKNOWN_ERROR";
}

export function categorizeHttpFailure(status: number, body: CreateSessionResponseBody | null): string {
  if (status === 0) return "NETWORK_OR_TIMEOUT";
  const errMsg = body && typeof body.error === "string" ? body.error : "";
  if (/missing or invalid.*environment/i.test(errMsg)) return "ENV_MISCONFIGURED";
  if (/timed out/i.test(errMsg)) return "TIMEOUT";
  if (/network error/i.test(errMsg)) return "NETWORK_ERROR";
  if (/schema validation/i.test(errMsg)) return "SCHEMA_VALIDATION_FAILED";
  if (status === 401) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "UPSTREAM_OR_SERVER_ERROR";
  if (status >= 400) return "CLIENT_ERROR";
  return "UNKNOWN_ERROR";
}

/**
 * Pure, framework-agnostic controller for the Gate A2 session lifecycle.
 * Holds the short-lived session_token/iframe_url in memory only, and never
 * exposes them via getPublicState() (used for rendering/logging/auditing).
 */
export class GateA2Controller {
  private status: GateA2Status = "IDLE";
  private session: GateA2PrivateSession | null = null;
  private errorCategory: string | null = null;
  private inFlight = false;

  getPublicState(): GateA2PublicState {
    return {
      status: this.status,
      sessionIdPresent: Boolean(this.session?.sessionId),
      sessionIdSuffix: this.session ? suffix6(this.session.sessionId) : null,
      orderIdPresent: Boolean(this.session?.orderId),
      orderIdSuffix: this.session ? suffix6(this.session.orderId) : null,
      expiresAt: this.session?.expiresAt ?? null,
      errorCategory: this.errorCategory,
    };
  }

  /** Only for the SDK's collectPAN() call — never for rendering or logging. */
  getSessionForSdk(): { sessionToken: string; iframeUrl: string } | null {
    if (!this.session) return null;
    return { sessionToken: this.session.sessionToken, iframeUrl: this.session.iframeUrl };
  }

  /**
   * Requests exactly one new session. No-ops if a session is already in
   * flight or active, preventing duplicate requests from double-clicks,
   * React Strict Mode double-invocation, or re-entrant calls.
   */
  async startSession(fetchSession: FetchSessionFn): Promise<void> {
    if (this.inFlight || NOT_STARTABLE_STATUSES.has(this.status)) return;

    this.inFlight = true;
    this.status = "CREATING_SESSION";
    this.errorCategory = null;
    this.session = null;

    try {
      const res = await fetchSession();
      const body = await res.json().catch(() => null);

      if (!res.ok || !body) {
        this.status = "SAFE_ERROR";
        this.errorCategory = categorizeHttpFailure(res.status, body);
        this.session = null;
        return;
      }

      const { sessionId, orderId, expiresAt, sessionToken, iframeUrl } = body;
      if (
        typeof sessionId !== "string" ||
        typeof orderId !== "string" ||
        typeof expiresAt !== "string" ||
        typeof sessionToken !== "string" ||
        typeof iframeUrl !== "string"
      ) {
        this.status = "SAFE_ERROR";
        this.errorCategory = "SCHEMA_VALIDATION_FAILED";
        this.session = null;
        return;
      }

      this.session = { sessionId, orderId, expiresAt, sessionToken, iframeUrl };
      this.status = "READY_FOR_CARD";
    } catch (err) {
      this.status = "SAFE_ERROR";
      this.errorCategory = categorizeError(err);
      this.session = null;
    } finally {
      this.inFlight = false;
    }
  }

  /** Called from the SDK's onReady callback: card form is up, user proceeds to enter card + passkey/OTP. */
  markAwaitingAuthentication(): void {
    if (this.status === "READY_FOR_CARD") {
      this.status = "AWAITING_USER_AUTHENTICATION";
    }
  }

  /** Called from the SDK's onSuccess callback. Records completion only — no card metadata retained. */
  complete(): void {
    this.status = "COMPLETED";
    this.clearSession();
  }

  /** Called from the SDK's onError callback. */
  fail(rawError: unknown): void {
    this.status = "SAFE_ERROR";
    this.errorCategory = categorizeError(rawError);
    this.clearSession();
  }

  /** Called from the SDK's onDismiss callback, or a user-initiated cancel. */
  cancel(): void {
    this.status = "CANCELLED";
    this.errorCategory = null;
    this.clearSession();
  }

  /** Called when the session's expires_at has passed before completion. */
  expire(): void {
    this.status = "SAFE_ERROR";
    this.errorCategory = "SESSION_EXPIRED";
    this.clearSession();
  }

  reset(): void {
    this.status = "IDLE";
    this.errorCategory = null;
    this.clearSession();
  }

  private clearSession(): void {
    this.session = null;
    this.inFlight = false;
  }
}
