import { suffix6 } from "@/lib/prava/redact";
import {
  type GateA2Stage,
  extractPravaErrorCode,
  categorizeMessage,
  extractResponseIdSuffix,
} from "./diagnostics";

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
  stage: GateA2Stage;
  pravaErrorCode: string | null;
  sanitizedMessageCategory: string | null;
  passkeyPromptObserved: boolean;
  onErrorObserved: boolean;
  onDismissObserved: boolean;
  promiseRejected: boolean;
  responseIdSuffix: string | null;
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

  // Diagnostics: tracks the last confirmed milestone reached, and details
  // recorded at the moment of a failure/dismissal/rejection.
  private milestoneStage: GateA2Stage = "SDK_INITIALIZATION";
  private pravaErrorCode: string | null = null;
  private sanitizedMessageCategory: string | null = null;
  private passkeyPromptObserved = false;
  private onErrorObserved = false;
  private onDismissObserved = false;
  private promiseRejected = false;
  private responseIdSuffix: string | null = null;

  getPublicState(): GateA2PublicState {
    return {
      status: this.status,
      sessionIdPresent: Boolean(this.session?.sessionId),
      sessionIdSuffix: this.session ? suffix6(this.session.sessionId) : null,
      orderIdPresent: Boolean(this.session?.orderId),
      orderIdSuffix: this.session ? suffix6(this.session.orderId) : null,
      expiresAt: this.session?.expiresAt ?? null,
      errorCategory: this.errorCategory,
      stage: this.milestoneStage,
      pravaErrorCode: this.pravaErrorCode,
      sanitizedMessageCategory: this.sanitizedMessageCategory,
      passkeyPromptObserved: this.passkeyPromptObserved,
      onErrorObserved: this.onErrorObserved,
      onDismissObserved: this.onDismissObserved,
      promiseRejected: this.promiseRejected,
      responseIdSuffix: this.responseIdSuffix,
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
    this.resetDiagnostics();
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
      this.milestoneStage = "IFRAME_LOADING";
    } catch (err) {
      this.status = "SAFE_ERROR";
      this.errorCategory = categorizeError(err);
      this.session = null;
    } finally {
      this.inFlight = false;
    }
  }

  /** Called from the SDK's onReady callback: the iframe loaded and accepts input. */
  markIframeReady(): void {
    this.milestoneStage = "CARD_VALIDATION";
    if (this.status === "READY_FOR_CARD") {
      this.status = "AWAITING_USER_AUTHENTICATION";
    }
  }

  /** @deprecated use markIframeReady() — kept as an alias for existing callers. */
  markAwaitingAuthentication(): void {
    this.markIframeReady();
  }

  /**
   * Called from the SDK's onChange callback once card fields report
   * isComplete. From here on, Prava's own iframe UI performs the security
   * check and any passkey/WebAuthn step — a boundary the public SDK surface
   * does not expose distinctly, so both are bucketed as SECURITY_CHECK.
   */
  markCardValidationComplete(): void {
    if (this.milestoneStage === "CARD_VALIDATION") {
      this.milestoneStage = "SECURITY_CHECK";
    }
  }

  /** Called from the SDK's onSuccess callback. Records completion only — no card metadata retained. */
  complete(): void {
    this.status = "COMPLETED";
    this.milestoneStage = "COMPLETION";
    this.clearSession();
  }

  /**
   * Called from the SDK's onError callback, a rejected collectPAN() Promise,
   * or a synchronous SDK initialization/mount failure. `source` records
   * which of those three paths triggered this, for evidence purposes.
   */
  fail(rawError: unknown, source: "onError" | "promiseRejection" | "sdkInit" = "onError"): void {
    this.status = "SAFE_ERROR";
    this.errorCategory = categorizeError(rawError);
    this.pravaErrorCode = extractPravaErrorCode(rawError);
    this.sanitizedMessageCategory = categorizeMessage(
      rawError && typeof rawError === "object" && "message" in rawError ? (rawError as { message: unknown }).message : null
    );
    this.responseIdSuffix = extractResponseIdSuffix(rawError, suffix6);
    if (source === "sdkInit") this.milestoneStage = "SDK_INITIALIZATION";
    this.onErrorObserved = source === "onError";
    this.promiseRejected = source === "promiseRejection";
    this.clearSession();
  }

  /** Called from the SDK's onDismiss callback (user exited the flow from within the iframe). */
  dismiss(reason: unknown): void {
    this.status = "CANCELLED";
    this.errorCategory = null;
    this.onDismissObserved = true;
    this.sanitizedMessageCategory = categorizeMessage(reason);
    this.clearSession();
  }

  /** Called from an explicit user click on the page's own Cancel button. */
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
    this.resetDiagnostics();
    this.clearSession();
  }

  private resetDiagnostics(): void {
    this.errorCategory = null;
    this.milestoneStage = "SDK_INITIALIZATION";
    this.pravaErrorCode = null;
    this.sanitizedMessageCategory = null;
    this.passkeyPromptObserved = false;
    this.onErrorObserved = false;
    this.onDismissObserved = false;
    this.promiseRejected = false;
    this.responseIdSuffix = null;
  }

  private clearSession(): void {
    this.session = null;
    this.inFlight = false;
  }
}
