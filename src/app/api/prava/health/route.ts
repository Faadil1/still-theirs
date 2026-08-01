import { NextResponse } from "next/server";
import { checkPravaHealth, PravaApiError } from "@/lib/prava/server";
import { appendAuditEvent } from "@/lib/audit";

export async function GET() {
  try {
    const result = await checkPravaHealth();
    await appendAuditEvent("prava.health.success", { httpStatus: 200, status: result.status });
    return NextResponse.json({
      status: result.status,
      timestamp: result.timestamp,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof PravaApiError) {
      await appendAuditEvent("prava.health.error", {
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
    await appendAuditEvent("prava.health.unexpected_error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
