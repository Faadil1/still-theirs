import "server-only";
import { randomUUID } from "crypto";
import { getLinqEnv } from "@/lib/env";
import { suffix6 } from "@/lib/prava/redact";
import type { TrustedPerspectiveProvider, TrustedPerspectiveRequest, TrustedPerspectiveResult } from "@/sdk/types";
import type { LinqSendResult, LinqFailureCategory } from "./types";

const LINQ_CHATS_URL = "https://api.linqapp.com/api/partner/v3/chats";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The only message this adapter ever sends. Deliberately static — no
 * merchant name, amount, scenario detail, or link is ever interpolated
 * into a message a real person receives.
 */
export const TRUSTED_PERSPECTIVE_MESSAGE =
  "Still Theirs paused an unusual purchase before any payment credential was created. " +
  "The person asked for a second perspective. You can share your view, but you cannot approve, block, or spend.";

export class LinqApiError extends Error {
  readonly httpStatus: number;
  readonly failureCategory: LinqFailureCategory;

  constructor(message: string, httpStatus: number, failureCategory: LinqFailureCategory) {
    super(message);
    this.name = "LinqApiError";
    this.httpStatus = httpStatus;
    this.failureCategory = failureCategory;
  }
}

function categorizeLinqFailure(status: number): LinqFailureCategory {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM_ERROR";
  if (status >= 400) return "CLIENT_ERROR";
  return "UNKNOWN";
}

/** Never returns or retains the raw parsed body — only a possible chat id. */
function extractChatId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const candidate =
    obj.id ?? obj.chat_id ?? (typeof obj.chat === "object" && obj.chat ? (obj.chat as Record<string, unknown>).id : null);
  return typeof candidate === "string" ? candidate : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Module-level single-flight guard: at most one Linq send may be in
// progress at a time, regardless of how many callers invoke this function
// concurrently (protects against rapid double-clicks reaching the server).
let requestInFlight = false;

/**
 * Sends exactly one plain-text trusted-perspective message via the Linq
 * Partner API. No automatic retries. Never logs or persists the raw
 * request/response body, the API key, or a full phone number.
 */
export async function sendLinqTrustedPerspectiveMessage(): Promise<LinqSendResult> {
  if (requestInFlight) {
    throw new LinqApiError("A perspective request is already in progress", 0, "ALREADY_IN_PROGRESS");
  }
  requestInFlight = true;

  try {
    let apiKey: string;
    let fromNumber: string;
    let toNumber: string;
    try {
      ({ LINQ_API_KEY: apiKey, LINQ_FROM_NUMBER: fromNumber, LINQ_TRUSTED_CONTACT_NUMBER: toNumber } = getLinqEnv());
    } catch {
      throw new LinqApiError("Linq is not configured", 0, "CONFIG_MISSING");
    }

    const body = {
      from: fromNumber,
      to: [toNumber],
      message: {
        idempotency_key: randomUUID(),
        parts: [{ type: "text", value: TRUSTED_PERSPECTIVE_MESSAGE }],
      },
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(LINQ_CHATS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LinqApiError(
        err instanceof Error && err.name === "AbortError" ? "Linq request timed out" : "Linq network error",
        0,
        err instanceof Error && err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR"
      );
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new LinqApiError(`Linq request failed with status ${res.status}`, res.status, categorizeLinqFailure(res.status));
    }

    const chatId = extractChatId(json);
    return {
      success: true,
      httpStatus: res.status,
      chatIdPresent: Boolean(chatId),
      chatIdSuffix: suffix6(chatId),
    };
  } finally {
    requestInFlight = false;
  }
}

/**
 * Concrete Linq implementation of the SDK's TrustedPerspectiveProvider.
 * There is no webhook yet (out of scope for this phase), so a successful
 * send can only report that delivery was requested — never an actual
 * recommendation from the trusted contact, and never a decision override.
 */
export class LinqTrustedPerspectiveProvider implements TrustedPerspectiveProvider {
  async sendPerspectiveRequest(input: TrustedPerspectiveRequest): Promise<TrustedPerspectiveResult & LinqSendResult> {
    // input (decision/reasonCodes/merchantName) is intentionally unused —
    // the outgoing message is always the fixed, sanitized copy above.
    void input;
    const result = await sendLinqTrustedPerspectiveMessage();
    return { recommendation: "PENDING", ...result };
  }
}
