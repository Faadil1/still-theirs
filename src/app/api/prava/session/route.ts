import { NextResponse } from "next/server";
import { createPravaSession, PravaApiError } from "@/lib/prava/server";
import { appendAuditEvent } from "@/lib/audit";

export async function POST() {
  const externalOrderRef = `grocery-gate-${Date.now()}`;

  try {
    const result = await createPravaSession({ externalOrderRef });

    await appendAuditEvent("prava.session.created", {
      httpStatus: 201,
      sessionId: result.session_id,
      orderId: result.order_id,
      expiresAt: result.expires_at,
      sessionTokenPresent: Boolean(result.session_token),
      iframeUrlPresent: Boolean(result.iframe_url),
    });

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
