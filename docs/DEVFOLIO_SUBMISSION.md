# Devfolio submission — copy-paste-ready fields

All copy below is verified against the repository (code, tests, and `docs/EVIDENCE_LEDGER.md`). Fill in the TODO links before submitting.

---

# Project name

Still Theirs

# Tagline

Pre-credential intent safety for AI commerce.

# One-sentence hook

The safest payment credential is sometimes the one that was never created.

# Problem it solves

Agentic commerce is standardizing on scoped credentials: give the AI agent a one-merchant, one-amount, one-purchase card so a misbehaving agent can only do bounded damage. That's necessary — but it starts too late. Every scoped credential still begins with a human deciding to create payment authority, and that moment is exactly where pressure scams do their work. A person being rushed by a new online "friend" into buying gift cards doesn't need a better-scoped credential; they need a system that notices the pressure before any credential exists, pauses, and offers a human way out.

Still Theirs is that earlier gate. It evaluates the purchase intent itself — deterministically, before any payment session or credential exists — and either allows an explicit, human-confirmed continuation into a scoped Prava credential, or holds the boundary closed and offers a real trusted-perspective request through Linq instead. Its proudest output is a credential-shaped absence: the Missing Card, stamped "Withheld."

# How the product works

A structured purchase intent (merchant familiarity, amount, urgency level, gift-card flag, coercive-language flag, and similar signals) is posted exactly once to `/api/risk/analyze`. A pure deterministic rule engine scores it and owns the decision — `APPROVE` or `REQUEST_TRUSTED_CONTACT`. Nothing downstream can change that decision: the OpenAI Responses API (with Structured Outputs, Zod-validated) is called only to draft a calm, plain-language explanation of the result the rules already reached, and an explanation that fails validation or contradicts the decision is discarded for a deterministic fallback.

On the routine path, the user sees the exact scoped payment instruction — merchant Gumroad, maximum CA$4.89, one purchase only, human confirmation required — and nothing is created until they explicitly continue to Gate A2 and explicitly click to create a Prava sandbox session. Verification runs phone-only over a QR-transferred one-time link, so the desktop never mounts the payment SDK; a sandbox credential is generated only after the human completes verification.

On the risky path, deterministic pressure signals pause the purchase. No Prava code path is reachable (enforced structurally and by tests). The user may send one real perspective request through Linq, delivered as an iMessage to a trusted contact — who receives perspective authority only, never payment authority. The credential territory shows the product's signature object: the Missing Card. "Credential / Not created."

# What makes it original

Every safeguard we've seen in this space constrains the agent after authority exists — spend limits, mandates, scoped credentials, revocation. Still Theirs moves the safety decision one step earlier and asks a different question: should payment authority be requested at all, right now, for this human, under this pressure? The decision is deterministic and auditable — AI explains it but cannot make or override it. The escalation path is human, not algorithmic: a real iMessage to a trusted person, who gets no power over the money. And the product treats *non-creation* as its hero outcome, giving it a literal shape — a dashed card silhouette at exact card proportions, sealed "Withheld" — so the safest result reads as an achievement rather than an error. It composes with, rather than competes against, scoped-credential systems.

# Challenges encountered

- **Preserving deterministic authority.** Keeping OpenAI in an explain-only role took structural work: the decision is computed first by a pure function, the model must acknowledge that decision in a validated structured output, and any mismatch discards the explanation — never the decision. Static-scan tests keep the boundary from regressing.
- **Integrating real Prava and Linq flows safely.** Our first real phone QR test failed with "Session Already Used": the desktop's embedded SDK mount was consuming the one-time session before the phone could open it. The fix was a true PHONE_ONLY mode that structurally never instantiates the SDK on desktop (ledger E032 → E033).
- **Proving a successful negative outcome.** The risky path's success is that nothing happened. We proved it with audit events (`pravaSessionCreated: false`, no session event in the run), browser network logs showing exactly one Linq request and zero Prava requests, and static tests making the Prava client unreachable from that path.
- **Maintaining honest sandbox boundaries.** An evidence ledger (E001–E037) records every live call, what it proves, and what it deliberately does not claim — including that merchant checkout has not been performed.
- **Making non-creation visually understandable.** Empty space reads as "loading." It took a locked design pass — the Missing Card's literal 1.586:1 silhouette, a one-shot resolve-then-withdraw pulse, and the Withheld seal — to make absence read as a deliberate verdict.

# Technologies used

Next.js 16 (App Router), React 19, TypeScript 5, `@prava-sdk/core`, OpenAI SDK (Responses API + Structured Outputs), Linq Partner API, Zod 4, `qrcode`, Vitest 4, Tailwind CSS 4.

# Sponsor integrations

- **Prava** — verification and scoped credential generation. A session is merchant- and amount-scoped (Gumroad, CA$4.89 maximum) and can only be created after the deterministic APPROVE decision plus two explicit human clicks. Phone-only sandbox verification with credential generation was demonstrated live (ledger E033).
- **OpenAI** — plain-language explanation of the deterministic decision via the Responses API with Structured Outputs and Zod validation. It cannot change the decision; both demo scenarios were validated live end-to-end (ledger E027/E028/E037).
- **Linq** — the trusted-perspective channel. One real perspective request was sent from the actual product UI and delivered as an iMessage (HTTP 201, ledger E035/E037). The message is fixed, non-identifying copy; the contact receives no payment authority.
- **Visa (through Prava)** — Still Theirs does not call Visa APIs directly; it integrates Prava, which supports Visa Intelligent Commerce where available, and adds the pre-credential intent-safety layer in front of it.

*(Only list the tracks that appear in the actual submission form.)*

# What was built during the hackathon

Everything except the `create-next-app` boilerplate. The first commit (2026-08-01) is the standard Next.js starter; the 46 commits that follow, across 2026-08-01 and 2026-08-02, contain all product work: the deterministic risk engine and sanitized schemas, the OpenAI explanation layer, the full Prava sandbox integration (health gate, session creation, desktop-embedded and phone-only Gate A2 with QR transfer), the Linq trusted-perspective provider and route, a reusable pre-credential safety SDK, the evidence ledger discipline, 245 automated tests, and the Missing Card product experience.

# Current limitations

1. The current gate evaluates structured pressure signals.
2. Extracting those signals from unrestricted natural-language purchase intents is an upstream capability and is not implemented in this prototype.
3. A Linq reply does not yet return into the application.
4. Merchant checkout execution remains the next implementation step.
5. The demonstrated payment evidence covers sandbox verification and scoped credential generation, not capture, authorization, clearing, or settlement.

# Links

- Live product: https://still-theirs-live.netlify.app/
- Guided demo: https://still-theirs-live.netlify.app/demo
- GitHub: https://github.com/Faadil1/still-theirs
- Video: TODO
- Architecture: https://github.com/Faadil1/still-theirs/blob/main/docs/ARCHITECTURE.md
- Supporting evidence: https://github.com/Faadil1/still-theirs/blob/main/docs/EVIDENCE_LEDGER.md

# Recommended screenshot order

1. `docs/media/01-missing-card-risky-desktop.png` — the Missing Card, risky path (lead with this)
2. `docs/media/02-selection-desktop.png` — scenario selection across the Held Line
3. `docs/media/03-approved-scoped-instruction.png` — approved path, scoped payment instruction with the Scoped seal
4. `docs/media/04-gate-a2-before-session.png` — Gate A2 before any session exists
5. `docs/media/05-risky-proof-record.png` — risky proof record (no session, no credential, authority still yours)
6. `docs/media/06-linq-request-sent.png` — Linq acknowledgement, "No authority transferred."
7. `docs/media/07-system-architecture.png` — TODO: render the architecture diagram from `docs/ARCHITECTURE.md` to an image
