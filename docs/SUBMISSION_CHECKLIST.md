# Submission checklist — Still Theirs

## Product

- [ ] Production build passes locally (`npm run build`)
- [ ] Live URLs deployed and loading (`/demo`, `/gate-a2`) — TODO: add URLs
- [ ] Both paths walk end-to-end on the live URL (routine → Gate A2 idle; risky → Missing Card)
- [ ] Mobile layout checked at 390px (Missing Card leads the risky screen)
- [ ] No exposed secrets on the live deployment (no `.env` values in client bundles; only `NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY` is browser-visible by design)
- [ ] No live retest required for judging — recorded evidence (ledger E027/E028, E033, E035/E037) stands on its own

## GitHub

- [ ] README is the judge-first version (no create-next-app boilerplate)
- [ ] `docs/ARCHITECTURE.md` present, Mermaid renders on GitHub
- [ ] Clean working tree at the submission commit (`git status --short`)
- [ ] Meaningful commit history (47 commits across 2026-08-01/02, evidence-entry discipline)
- [ ] Repository visibility set correctly (public or judge-accessible) — TODO
- [ ] No private evidence in the repo (audit log contains suffixes/booleans only; ledger rows sanitized)
- [ ] No environment files committed (`.env.local`, `.env.recovered`, `.env.vercel.local`, backups — all git-ignored; verify with `git ls-files | findstr env`)

## Devfolio

- [ ] Project name: Still Theirs
- [ ] Tagline: Pre-credential intent safety for AI commerce.
- [ ] Problem section pasted from `docs/DEVFOLIO_SUBMISSION.md`
- [ ] Challenges section pasted
- [ ] Technologies list pasted (verified stack only)
- [ ] Sponsor integrations: Prava, OpenAI, Linq, Visa-through-Prava (only tracks visible in the actual form)
- [ ] GitHub link added
- [ ] Live demo link added
- [ ] Video link added
- [ ] Seven screenshots uploaded in the recommended order
- [ ] Missing Card screenshot first
- [ ] Limitations section included verbatim
- [ ] Work-during-hackathon disclosure included (boilerplate first commit + all product work during the event)
- [ ] Applicable prize selections chosen — TODO: confirm on the form

## Video

- [ ] 720p minimum
- [ ] 2–4 minutes (script targets 2:40–3:00)
- [ ] Voice narration
- [ ] No copyrighted music
- [ ] Sensitive information masked (full IDs, phone numbers, emails, keys, tokens, dashboard identifiers)
- [ ] Product shown in action (both paths)
- [ ] No dead waits
- [ ] Final frame is the Missing Card

## Final truthfulness sweep

- [ ] No direct Visa API claim anywhere (only "through Prava, where available")
- [ ] No completed merchant-checkout claim (E039 explicitly not yet performed)
- [ ] No natural-language extraction claim (structured signals only)
- [ ] No Linq reply-ingestion claim (delivery only)
- [ ] No transferred-authority claim (perspective authority only, "No authority transferred.")
- [ ] OpenAI is described as explaining, never deciding, in every document
- [ ] Credential-generation evidence attributed accurately (E033 ran under the earlier US$45.00 session values; Gumroad/CA$4.89 run not yet recorded)
- [ ] No settlement/capture/clearing language anywhere
