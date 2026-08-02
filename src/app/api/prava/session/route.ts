import { NextResponse } from "next/server";
import { createPravaSession, PravaApiError } from "@/lib/prava/server";
import { appendAuditEvent } from "@/lib/audit";
import { suffix6 } from "@/lib/prava/redact";

export async function POST() {
  const externalOrderRef = `gumroad-gate-${Date.now()}`;

  try {
    const { data: result, httpStatus } = await createPravaSession({ externalOrderRef });

    // Audit log stores only presence flags and truncated suffixes — never
    // the full session_id/order_id, and never session_token/iframe_url.
    await appendAuditEvent("prava.session.created", {
      httpStatus,
      sessionIdPresent: Boolean(result.session_id),
      sessionIdSuffix: suffix6(result.session_id),
      orderIdPresent: Boolean(result.order_id),
      orderIdSuffix: suffix6(result.order_id),
      expiresAt: result.expires_at,
      sessionTokenPresent: Boolean(result.session_token),
      iframeUrlPresent: Boolean(result.iframe_url),
      responseSchemaValid: true,
    });

    // sessionToken/iframeUrl ARE returned to the browser here by design —
    // the documented embedded SDK flow (collectPAN) requires them client-side.
    // They must never additionally be logged, persisted, or displayed (see
    // docs/SECURITY_NOTES.md and src/app/page.tsx's transient-state handling).
    return NextResponse.json({
      sessionId: result.session_id,
      sessionToken: result.session_token,
      iframeUrl: result.iframe_url,
      orderId: result.order_id,
      expiresAt: result.expires_at,
      sessionTokenPresent: Boolean(result.session_token),
      iframeUrlPresent: Boolean(result.iframe_url),
    });
  } catch (err) {
    if (err instanceof PravaApiError) {
      await appendAuditEvent("prava.session.error", {
        httpStatus: err.httpStatus,
        responseId: err.responseId,
        message: err.message,
        body: err.redactedBody,
      });
      return NextResponse.json(
        { error: err.message, httpStatus: err.httpStatus, responseId: err.responseId },
        { status: err.httpStatus || 502 }
      );
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    await appendAuditEvent("prava.session.unexpected_error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
