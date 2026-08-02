import { NextRequest, NextResponse } from "next/server";
import { appendAuditEvent } from "@/lib/audit";
import { LinqApiError, LinqTrustedPerspectiveProvider } from "@/lib/linq/server";
import { linqTrustedPerspectiveRequestSchema } from "@/lib/linq/schema";

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const parsed = linqTrustedPerspectiveRequestSchema.safeParse(json);
  if (!parsed.success) {
    // Also the enforcement point for "Linq is only reachable from
    // REQUEST_TRUSTED_CONTACT" — an APPROVE (or any other) decision value
    // fails the z.literal check above and never reaches the provider.
    return NextResponse.json({ error: "Request did not match the approved schema" }, { status: 400 });
  }

  const { decision, reasonCodes, merchantName } = parsed.data;

  try {
    const provider = new LinqTrustedPerspectiveProvider();
    const result = await provider.sendPerspectiveRequest({ decision, reasonCodes, merchantName: merchantName ?? "" });

    await appendAuditEvent("linq.perspective.sent", {
      httpStatus: result.httpStatus,
      chatIdPresent: result.chatIdPresent,
      chatIdSuffix: result.chatIdSuffix,
    });

    return NextResponse.json({
      success: true,
      provider: "LINQ",
      deliveryRequested: true,
      chatIdSuffix: result.chatIdSuffix ?? undefined,
    });
  } catch (err) {
    if (err instanceof LinqApiError) {
      await appendAuditEvent("linq.perspective.error", {
        httpStatus: err.httpStatus,
        failureCategory: err.failureCategory,
      });
      let status = 502;
      if (err.failureCategory === "ALREADY_IN_PROGRESS") status = 429;
      else if (err.failureCategory === "CONFIG_MISSING") status = 500;
      else if (err.httpStatus >= 400) status = err.httpStatus;
      return NextResponse.json(
        { success: false, provider: "LINQ", deliveryRequested: false, statusCategory: err.failureCategory },
        { status }
      );
    }

    await appendAuditEvent("linq.perspective.unexpected_error", {});
    return NextResponse.json(
      { success: false, provider: "LINQ", deliveryRequested: false, statusCategory: "UNKNOWN" },
      { status: 500 }
    );
  }
}
