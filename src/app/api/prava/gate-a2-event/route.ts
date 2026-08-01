import { NextRequest, NextResponse } from "next/server";
import { appendAuditEvent } from "@/lib/audit";
import { gateA2EventSchema } from "@/lib/gateA2/eventSchema";

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const parsed = gateA2EventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Event did not match the approved schema" }, { status: 400 });
  }

  // Only whitelisted fields ever reach the audit logger; anything else was
  // already stripped by the strict Zod schema above.
  const { event, ...detail } = parsed.data;
  await appendAuditEvent(event, detail);

  return NextResponse.json({ recorded: true });
}
