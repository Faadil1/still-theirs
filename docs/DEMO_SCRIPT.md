# Demo video script — Still Theirs

**Target duration:** 2:40–3:00.
**Hero Demo Moment:** the video opens and closes on the Missing Card — "CREDENTIAL / Not created." with the **Withheld** seal.

**Hard rules for recording**

- Do **not** make new live integration calls just for the recording. The routine Prava section and the Linq section use already-recorded evidence (ledger E033, E035/E037) or the product's existing screens; the risky analysis screens can be shown from the recorded safe walkthrough captures in `docs/media/`.
- If the flow is driven live on screen, drive it against stubbed/fixture responses (as used for the committed screenshots), never against live OpenAI, Linq, or Prava.
- No copyrighted music. Voice narration only, or clearly licensed audio.
- No dead waiting time — cut every pause longer than a beat.

## Shot-by-shot

| # | Time | Visual shown | Narration | Cursor / action | Evidence displayed | Transition |
|---|---|---|---|---|---|---|
| 1 | 00:00–00:10 | Full-frame: the risky Missing Card — dashed rust card, "CREDENTIAL / Not created.", Withheld seal (`docs/media/01-missing-card-risky-desktop.png` or the live risky screen) | "The safest payment credential is sometimes the one that was never created." | None — hold still | The Missing Card itself | Hard cut |
| 2 | 00:10–00:30 | Slide or title card contrasting "after approval" safeguards vs. the pre-credential gate (two-line text, no logos) | "AI agents are getting scoped payment credentials — one merchant, one amount. But every safeguard today starts *after* someone decides to create payment authority. Pressure scams live exactly at that moment. Still Theirs gates the moment itself." | None | — | Cut to product |
| 3 | 00:30–00:42 | `/demo` Selection screen; select "Routine digital purchase" | "Two purchase intents. A routine digital cookbook — and a stranger urgently demanding gift cards. Notice: the credential territory is empty. Nothing exists yet." | Click the routine card; hover the Held Line | Neutral context tags; "Nothing exists here yet." | Click "Check this purchase" |
| 4 | 00:42–00:56 | Analysis screen: four staged steps, static placeholders on the right, Held seal settles | "Deterministic rules decide. OpenAI only explains — it can't override. Through all four stages, the credential side never moves. The boundary is held." | None — let the stagger play | Fixed "Purchase intent under review" eyebrow; Held seal | Auto-resolve to decision |
| 5 | 00:56–01:10 | Approved screen: scoped payment instruction, Scoped seal; then click through to `/gate-a2` | "Approved — as a *scoped instruction*: Gumroad, four dollars eighty-nine maximum, one purchase only. Still not created. Creating it takes an explicit human step, then phone verification through Prava." | Click "Continue to secure payment"; show Gate A2 idle | "Not yet created" status; Gate A2 step indicator at step 1 | Cut to evidence still |
| 6 | 01:10–01:14 | Evidence still: recorded PHONE_ONLY verification result (ledger E033 summary card or screenshot — masked) | "We verified this end-to-end in the Prava sandbox: phone-only session, OTP accepted, credential generated." | None | E033 summary (suffixes only) | Hard cut back to `/demo` |
| 7 | 01:14–01:30 | Selection screen; select "Urgent gift cards"; run analysis | "Now the risky one. Same four stages — no early verdict, no drama." | Click risky card, then "Check this purchase" | Same neutral analysis | Auto-resolve |
| 8 | 01:30–01:55 | Risky screen: "Purchase paused" badge, pressure signals, status table; then the Missing Card pulse + Withheld seal landing | "Pressure signals detected. The purchase pauses. Look at the record: Prava session — not created. Payment credential — not created. Financial authority — still yours. And on the credential side: the card that was never issued. It briefly tries to resolve — and is withheld." | Slow scroll down the left column; hold on the Missing Card entrance | Status table rows; Withheld seal | Hold on left column |
| 9 | 01:55–02:15 | The Linq action and its sent state (recorded evidence or the already-captured sent-state screen — do not send a new live message) | "Instead of a credential, Still Theirs offers a human: one real perspective request, sent through Linq as an iMessage. We sent one from this exact UI — delivered. The trusted contact gets perspective authority only. No authority transferred." | Point at "Send perspective request via iMessage"; show sent state | "Perspective request sent" block; "No authority transferred."; E035/E037 reference | Cut to diagram |
| 10 | 02:15–02:40 | Architecture diagram (from `docs/ARCHITECTURE.md`) | "The architecture is the argument. Deterministic rules own the decision. OpenAI explains it. Prava receives authority only after explicit human continuation. Linq adds human perspective with zero payment authority. One hairline separates human intent from credential territory — and it only opens on the human's say-so." | Trace the two paths with the cursor | The decision-boundary diagram | Cut to plain slide |
| 11 | 02:40–02:55 | Plain limitations slide, three lines | "Honestly, today: the gate reads structured signals — free-text extraction is upstream work. The Linq reply doesn't return into the app yet. And merchant checkout is the next step — we claim sandbox verification and credential generation, nothing more." | None | Limitation text | Cut to final frame |
| 12 | 02:55–03:00 | The Missing Card, full frame, still | "Still Theirs protects the moment when the power to spend is created." | None — hold to end | The Missing Card | Fade out |

## Recording checklist

- [ ] 1440×900 (or larger 16:9) browser window, 100% zoom, light theme
- [ ] 720p minimum export; 2–4 minutes total
- [ ] Voice narration recorded (script above), no copyrighted music
- [ ] All animations play once — don't cut mid-seal-settle
- [ ] No dead waiting time; trim analysis stagger if needed
- [ ] Final frame is the Missing Card

## Tabs to prepare

1. `/demo` (fresh load, Selection state)
2. `/gate-a2?mode=phone&source=demo` (idle — do not click "Create secure phone session")
3. `docs/ARCHITECTURE.md` rendered (for the diagram section)
4. Evidence stills folder (`docs/media/` + any masked E033/E037 summaries)

## Exact sensitive values to mask (if any evidence still shows them)

- Any full session ID or order ID (only `...SUFFIX` forms may appear)
- Any full chat/message ID from Linq (only `...012283`-style suffixes)
- Phone numbers (both directions), email addresses
- `PRAVA_SECRET_KEY`, `OPENAI_API_KEY`, `LINQ_API_KEY`, session tokens, iframe URLs
- Prava dashboard: mask account identifiers, emails, and any full IDs before showing
- Browser devtools, local file paths, and OS notifications — keep them out of frame

## Do not

- Do not send a new live Linq message for the recording
- Do not create a new live Prava session for the recording
- Do not call live OpenAI for the recording
- Do not show or imply merchant checkout, capture, or settlement
- Do not show the trusted contact's phone content beyond the already-verified message copy
