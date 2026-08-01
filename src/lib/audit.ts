import { promises as fs } from "fs";
import path from "path";
import { redact } from "./prava/redact";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

export interface AuditEvent {
  timestamp: string;
  event: string;
  detail: unknown;
}

// Serializes all read-modify-write cycles against the audit log file.
// Without this, concurrent appendAuditEvent() calls (e.g. two client events
// fired back-to-back) can race: both read the same on-disk array before
// either writes, and the second write silently clobbers the first.
let writeQueue: Promise<void> = Promise.resolve();

export async function appendAuditEvent(event: string, detail: unknown): Promise<void> {
  const safeDetail = redact(detail);
  const entry: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    detail: safeDetail,
  };

  const task = writeQueue.then(async () => {
    let existing: AuditEvent[] = [];
    try {
      const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
      existing = JSON.parse(raw);
    } catch {
      existing = [];
    }

    existing.push(entry);
    await fs.writeFile(AUDIT_LOG_PATH, JSON.stringify(existing, null, 2), "utf-8");
  });

  // Keep the queue alive even if this particular write fails, so later
  // writes aren't permanently blocked.
  writeQueue = task.catch(() => {});
  return task;
}
