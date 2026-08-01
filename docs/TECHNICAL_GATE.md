# Prava Technical Gate — Overview

## Purpose

Prove the real Prava sandbox payment lifecycle end-to-end before building the
final purchase-safety-agent product. This is a technical validation gate, not
the product itself.

## Central claim under test

"The safest payment credential is sometimes the one that was never created."

A routine purchase proceeds to Prava (session created, card collected, passkey
approved, payment completed). A risky purchase is paused before any Prava
session exists — proven structurally, not just by UI copy.

## Gates

- A0 — Sandbox health check
- A1 — Real sandbox session creation
- A2 — Embedded card collection + real passkey (manual, on-device)
- A3 — Poll payment result (redacted)
- A4 — Controlled sandbox merchant simulator + report-status + final state
- Negative path — risky intent creates zero Prava sessions (structural proof)

Each gate stops for user confirmation before the next begins, per project rules.
See `docs/TECHNICAL_GATE_VERDICT.md` for the final scored verdict.
