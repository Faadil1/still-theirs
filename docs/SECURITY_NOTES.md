# Security Notes — Prava Technical Gate

## Absolute rules (enforced throughout this project)

- Prava secret key (`PRAVA_SECRET_KEY`) never leaves server-side code. It is
  read only in modules under `src/lib/prava/server.ts` and API route handlers
  (server components / route handlers), never imported by client components.
- `.env.local` is git-ignored (default from `create-next-app`) and is never committed.
- Secret key is never printed to console, logs, or the audit log.
- `session_token` is never logged, persisted, or rendered in the UI — kept only
  in transient client component state, passed directly to `collectPAN()`.
- Payment `token` and `dynamic_cvv` are never returned to the browser, logged,
  or persisted to disk/DB. They exist only transiently in server memory during
  the controlled sandbox merchant simulator step, then are discarded.
- No raw card number, CVV, payment token, or dynamic CVV is ever stored.
- Redaction: all Prava error objects and log entries pass through a recursive
  redaction helper (`src/lib/prava/redact.ts`) before being written anywhere,
  stripping known-sensitive keys (`session_token`, `token`, `dynamic_cvv`,
  `secret`, `authorization`, `PRAVA_SECRET_KEY`, etc.) even from nested objects.
- The publishable key (`NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY`) is the only Prava
  credential intentionally exposed to the browser (by design, per Prava docs).

## Safe evidence fields (allowed in logs / audit / docs)

HTTP status, session ID, order ID, expiration timestamp, `sessionTokenPresent`,
`iframeUrlPresent`, `credentialPresent`, `dynamicCvvPresent`, masked last4,
transaction reference ID, final status, response code, Visa confirmation.

## What this project will never do

- Never automate or bypass WebAuthn/passkey.
- Never mock a Prava response — a failed live call is reported as blocked, not
  silently replaced with fake data.
- Never call the controlled sandbox merchant simulator a "real merchant."
- Never let the risky-intent path import or call the Prava session client.
