import "server-only";
import { getServerEnv, getHealthEnv } from "@/lib/env";
import {
  healthResponseSchema,
  createSessionResponseSchema,
  paymentResultResponseSchema,
  reportStatusResponseSchema,
  type HealthResponse,
  type CreateSessionResponse,
  type PaymentResultResponse,
  type ReportStatusResponse,
} from "./schemas";
import { redact } from "./redact";

export class PravaApiError extends Error {
  readonly httpStatus: number;
  readonly responseId: string | null;
  readonly redactedBody: unknown;

  constructor(message: string, httpStatus: number, responseId: string | null, redactedBody: unknown) {
    super(message);
    this.name = "PravaApiError";
    this.httpStatus = httpStatus;
    this.responseId = responseId;
    this.redactedBody = redactedBody;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    const json = await res.json();
    return redact(json);
  } catch {
    return null;
  }
}

export async function checkPravaHealth(): Promise<HealthResponse> {
  const { PRAVA_BASE_URL } = getHealthEnv();

  let res: Response;
  try {
    res = await fetchWithTimeout(`${PRAVA_BASE_URL}/health`, { method: "GET" });
  } catch (err) {
    throw new PravaApiError(
      err instanceof Error && err.name === "AbortError" ? "Prava health check timed out" : "Prava health check network error",
      0,
      null,
      null
    );
  }

  const responseId = res.headers.get("x-response-id");

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new PravaApiError(`Prava health check failed with status ${res.status}`, res.status, responseId, body);
  }

  const json = await res.json();
  const parsed = healthResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PravaApiError("Prava health response failed schema validation", res.status, responseId, redact(json));
  }

  return parsed.data;
}

export interface CreateGrocerySessionInput {
  externalOrderRef: string;
}

export interface CreateSessionResult {
  data: CreateSessionResponse;
  httpStatus: number;
}

export async function createPravaSession(input: CreateGrocerySessionInput): Promise<CreateSessionResult> {
  const { PRAVA_BASE_URL, PRAVA_SECRET_KEY, PRAVA_TEST_USER_EMAIL, PRAVA_TEST_USER_ID } = getServerEnv();

  const body = {
    user_id: PRAVA_TEST_USER_ID,
    user_email: PRAVA_TEST_USER_EMAIL,
    total_amount: "4.89",
    currency: "CAD",
    purchase_context: [
      {
        merchant_details: {
          name: "Gumroad",
          url: "https://gumroad.com",
          country_code_iso2: "US",
        },
        product_details: [
          {
            product_id: "gumroad-digital-cookbook",
            description: "300+ Meals List WITH RECIPES - A Very Beginner Friendly Cookbook",
            unit_price: "4.89",
            quantity: 1,
          },
        ],
      },
    ],
    integration_type: "embedding",
    external_order_ref: input.externalOrderRef,
    description: "Controlled Gumroad digital cookbook sandbox checkout",
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${PRAVA_BASE_URL}/v1/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRAVA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new PravaApiError(
      err instanceof Error && err.name === "AbortError" ? "Create session request timed out" : "Create session network error",
      0,
      null,
      null
    );
  }

  const responseId = res.headers.get("x-response-id");

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    throw new PravaApiError(`Create session failed with status ${res.status}`, res.status, responseId, errBody);
  }

  const json = await res.json();
  const parsed = createSessionResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PravaApiError("Create session response failed schema validation", res.status, responseId, redact(json));
  }

  return { data: parsed.data, httpStatus: res.status };
}

export async function getPravaPaymentResult(sessionId: string): Promise<PaymentResultResponse> {
  const { PRAVA_BASE_URL, PRAVA_SECRET_KEY } = getServerEnv();

  let res: Response;
  try {
    res = await fetchWithTimeout(`${PRAVA_BASE_URL}/v1/sessions/${encodeURIComponent(sessionId)}/payment-result`, {
      method: "GET",
      headers: { Authorization: `Bearer ${PRAVA_SECRET_KEY}` },
    });
  } catch (err) {
    throw new PravaApiError(
      err instanceof Error && err.name === "AbortError" ? "Payment result request timed out" : "Payment result network error",
      0,
      null,
      null
    );
  }

  const responseId = res.headers.get("x-response-id");

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    throw new PravaApiError(`Payment result failed with status ${res.status}`, res.status, responseId, errBody);
  }

  const json = await res.json();
  const parsed = paymentResultResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PravaApiError("Payment result response failed schema validation", res.status, responseId, redact(json));
  }

  return parsed.data;
}

export interface ReportStatusInput {
  sessionId: string;
  txnRefId: string;
  txnStatus: "APPROVED" | "DECLINED";
  authorizationCode?: string;
  responseCode?: string;
}

export async function reportPravaStatus(input: ReportStatusInput): Promise<ReportStatusResponse> {
  if (!input.txnRefId) {
    throw new PravaApiError("report-status requires a txn_ref_id", 0, null, null);
  }

  const { PRAVA_BASE_URL, PRAVA_SECRET_KEY } = getServerEnv();

  const body = {
    txn_ref_id: input.txnRefId,
    txn_status: input.txnStatus,
    authorization_code: input.authorizationCode,
    response_code: input.responseCode,
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${PRAVA_BASE_URL}/v1/sessions/${encodeURIComponent(input.sessionId)}/report-status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRAVA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new PravaApiError(
      err instanceof Error && err.name === "AbortError" ? "report-status request timed out" : "report-status network error",
      0,
      null,
      null
    );
  }

  const responseId = res.headers.get("x-response-id");

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    throw new PravaApiError(`report-status failed with status ${res.status}`, res.status, responseId, errBody);
  }

  const json = await res.json();
  const parsed = reportStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PravaApiError("report-status response failed schema validation", res.status, responseId, redact(json));
  }

  return parsed.data;
}
