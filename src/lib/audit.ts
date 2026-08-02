import { promises as fs } from "fs";
import path from "path";
import { redact } from "./prava/redact";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

export interface AuditEvent {
  timestamp: string;
  event: string;
  detail: unknown;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// Serializes all read-modify-write cycles against the local audit log file
// (development only — see isProduction() below). Without this, concurrent
// appendAuditEvent() calls (e.g. two client events fired back-to-back) can
// race: both read the same on-disk array before either writes, and the
// second write silently clobbers the first.
let writeQueue: Promise<void> = Promise.resolve();

async function writeToFile(entry: AuditEvent): Promise<void> {
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

/**
 * Always resolves — audit logging must never interrupt a risk decision,
 * OpenAI fallback, Prava flow, or Linq flow. In production the deployed
 * project filesystem is never written to (it may be read-only or
 * ephemeral); the already-redacted event is emitted to console.info
 * instead. In local development the existing JSON audit-file behavior is
 * preserved, and a failed file write is swallowed rather than propagated.
 */
export async function appendAuditEvent(event: string, detail: unknown): Promise<void> {
  const safeDetail = redact(detail);
  const entry: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    detail: safeDetail,
  };

  if (isProduction()) {
    try {
      console.info(JSON.stringify(entry));
    } catch {
      // A logging failure must never interrupt the caller.
    }
    return;
  }

  // Keep the queue alive even if this particular write fails, so later
  // writes aren't permanently blocked — and so this call itself never
  // rejects regardless of the filesystem's state.
  const task = writeQueue.then(() => writeToFile(entry)).catch(() => {});
  writeQueue = task;
  return task;
}
