# Evidence Ledger

| ID | UTC timestamp | Phase | Hypothesis tested | Command/action | Expected result | Observed result | Status | Artifact/source | Blocker/impact | Commit hash |
|----|----------------|-------|--------------------|-----------------|------------------|-------------------|--------|-------------------|------------------|--------------|
| E001 | 2026-08-01T00:00:00Z | Setup | Official docs match task prompt assumptions | Fetched 8 docs.prava.space pages | Schemas match prompt scaffolding | `merchant_details.category` not in documented schema; `/sdk/collect-pan` path is actually `/sdk/cards/collect-pan` | NEEDS_VERIFICATION | docs/API_CONTRACT_NOTES.md discrepancies section | None — resolved by following live docs | (pending) |
| E002 | | Setup | Project scaffolds cleanly with create-next-app | `npx create-next-app@latest ...` | Project created, git initialized | Project created successfully, git repo initialized | PASS | terminal output | none | (pending) |
