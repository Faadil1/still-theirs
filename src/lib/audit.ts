import { promises as fs } from "fs";
import path from "path";
import { redact } from "./prava/redact";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

export interface AuditEvent {
  timestamp: string;
  event: string;
  detail: unknown;
}

export async function appendAuditEvent(event: string, detail: unknown): Promise<void> {
  const safeDetail = redact(detail);
  const entry: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    detail: safeDetail,
  };

  let existing: AuditEvent[] = [];
  try {
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    existing = [];
  }

  existing.push(entry);
  await fs.writeFile(AUDIT_LOG_PATH, JSON.stringify(existing, null, 2), "utf-8");
}
