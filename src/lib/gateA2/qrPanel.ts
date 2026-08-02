export const QR_AUTO_HIDE_MS = 60_000;

/**
 * Pure timing check for the dev-only QR phone-transfer panel: true once
 * either the 60-second auto-hide window has elapsed since it was opened,
 * or the session's own expires_at has passed — whichever comes first.
 * Never touches the iframe URL itself.
 */
export function shouldAutoHideQr(
  openedAtMs: number | null,
  expiresAtIso: string | null,
  nowMs: number,
  autoHideMs: number = QR_AUTO_HIDE_MS
): boolean {
  const elapsed = openedAtMs !== null ? nowMs - openedAtMs : 0;
  const expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : null;
  const expired = expiresAtMs !== null && nowMs >= expiresAtMs;
  return elapsed >= autoHideMs || expired;
}
