"use client";

import { useState, type ReactNode } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/risk/scenarios";
import { DemoFlowController, type AnalyzeResultShape, type TrustedContactChoice } from "@/lib/demo/demoFlow";
import {
  ProductShell,
  ProductHeader,
  SpineBar,
  HeldLine,
  Seal,
  CredentialArtifact,
  StatusBadge,
  SurfaceCard,
  DefinitionRow,
  PrimaryAction,
  SecondaryAction,
} from "@/components/ui";

const SCENARIO_LABELS: Record<DemoScenarioId, { title: string; description: string; context: string }> = {
  "routine-groceries": {
    title: "Routine digital purchase",
    description: "A small, low-cost digital cookbook purchase from a familiar platform.",
    context: "Known platform · low amount",
  },
  "urgent-gift-cards": {
    title: "Urgent gift cards",
    description: "A new online contact urgently asking for several gift cards.",
    context: "New contact · time pressure",
  },
};

const ANALYSIS_STEPS: { label: string; copy: string; marginalia?: string }[] = [
  {
    label: "Purchase intent received",
    copy: "The requested purchase is logged before any credential is considered.",
  },
  {
    label: "Deterministic safety rules applied",
    copy: "Fixed rules — merchant familiarity, amount, urgency signals — decide eligibility.",
  },
  {
    label: "OpenAI explanation generated",
    copy: "A plain-language explanation is drafted for the outcome the rules already reached.",
    marginalia: "OpenAI explains the result. The boundary remains deterministic.",
  },
  {
    label: "Decision ready",
    copy: "The boundary has not opened. A decision is ready for your review.",
  },
];

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function WhatWeNoticed({ signals }: { signals: { code: string; plainLanguage: string }[] }) {
  return (
    <div>
      <h3 className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--st-text-secondary)]">
        What we noticed
      </h3>
      <ul className="border-t border-[var(--st-border)]">
        {signals.map((s) => (
          <li
            key={s.code}
            className="flex gap-2.5 border-b border-[var(--st-border)] py-2.5 font-sans text-[13px] text-[var(--st-text)]"
          >
            <span aria-hidden="true" className="text-[var(--st-text-muted)]">
              —
            </span>
            {s.plainLanguage}
          </li>
        ))}
      </ul>
    </div>
  );
}

type LinqRequestStatus = "IDLE" | "SENDING" | "SENT" | "ERROR";

export default function DemoPage() {
  const [controller] = useState(() => new DemoFlowController());
  const [state, setState] = useState(() => controller.getState());
  const [analysisStep, setAnalysisStep] = useState(0);
  const [linqStatus, setLinqStatus] = useState<LinqRequestStatus>("IDLE");
  const [linqError, setLinqError] = useState<string | null>(null);

  function sync() {
    setState(controller.getState());
  }

  function handleSelect(id: DemoScenarioId) {
    controller.selectScenario(id);
    sync();
  }

  async function handleCheck() {
    if (!controller.canSubmit()) return;
    controller.beginAnalysis();
    sync();
    setAnalysisStep(1);

    const scenarioId = state.selectedScenario;
    if (!scenarioId) return;

    try {
      // The first three steps reveal on a steady stagger while the single
      // real analysis request is in flight. The fourth ("Decision ready")
      // only reveals once the deterministic decision has actually returned.
      for (let revealed = 2; revealed < ANALYSIS_STEPS.length; revealed++) {
        await new Promise((r) => setTimeout(r, 250));
        setAnalysisStep(revealed);
      }

      const res = await fetch("/api/risk/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEMO_SCENARIOS[scenarioId]),
      });
      const data: AnalyzeResultShape & { error?: string } = await res.json();

      if (!res.ok) {
        controller.failAnalysis("Something didn't go through. You can try again.");
        sync();
        return;
      }

      setAnalysisStep(ANALYSIS_STEPS.length);
      controller.completeAnalysis(data);
      sync();
    } catch {
      controller.failAnalysis("Something didn't go through. You can try again.");
      sync();
    }
  }

  function handleReset() {
    controller.reset();
    setAnalysisStep(0);
    sync();
  }

  function handleAskTrustedContact() {
    controller.askTrustedContact();
    sync();
  }

  function handleProceedToTrustedResponse() {
    controller.proceedToTrustedResponse();
    sync();
  }

  function handleTrustedChoice(choice: TrustedContactChoice) {
    controller.recordTrustedContactChoice(choice);
    sync();
  }

  // Sends a real, human-visible perspective request via Linq — separate
  // from the local "Preview trusted review" simulation below. Never
  // reachable unless the decision is REQUEST_TRUSTED_CONTACT (guarded
  // here, and again on the server side, by the API route itself). Never
  // falls through to Prava on either success or failure.
  async function handleSendPerspectiveRequest() {
    if (linqStatus === "SENDING") return; // guards rapid double-clicks
    if (!result || result.decision !== "REQUEST_TRUSTED_CONTACT") return;

    setLinqStatus("SENDING");
    setLinqError(null);

    try {
      const res = await fetch("/api/linq/trusted-perspective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: result.decision, reasonCodes: result.reasonCodes }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setLinqStatus("ERROR");
        setLinqError("Something didn't go through. You can try again.");
        return;
      }

      setLinqStatus("SENT");
    } catch {
      setLinqStatus("ERROR");
      setLinqError("Something didn't go through. You can try again.");
    }
  }

  const { view, selectedScenario, result, error, trustedContactChoice } = state;
  const scenario = selectedScenario ? DEMO_SCENARIOS[selectedScenario] : null;
  const allStepsRevealed = analysisStep === ANALYSIS_STEPS.length;

  let headerMeta: ReactNode;
  switch (view) {
    case "SELECT":
      headerMeta = (
        <>
          Pre-credential review
          <br />
          No session open
        </>
      );
      break;
    case "ANALYZING":
      headerMeta = (
        <>
          Pre-credential checkpoint
          <br />
          No credential exists
        </>
      );
      break;
    case "DECISION":
      headerMeta = (
        <>
          {result?.decision === "APPROVE" ? "Decision — routine purchase" : "Decision — urgent gift cards"}
          <br />
          No credential exists
        </>
      );
      break;
    default:
      headerMeta = (
        <>
          Trusted perspective
          <br />
          No credential exists
        </>
      );
  }

  return (
    <ProductShell
      wide
      header={
        <>
          <ProductHeader meta={headerMeta} />
          {view !== "SELECT" && <SpineBar />}
        </>
      }
    >
      {view === "SELECT" && (
        <section aria-label="Choose a scenario" className="mx-auto max-w-[1080px]">
          <div className="mb-8 max-w-[640px] lg:mb-10">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--st-text-secondary)]">
              Pre-credential intent safety
            </p>
            <h1 className="mb-3.5 mt-2.5 font-serif text-[26px] leading-[1.15] tracking-[-0.01em] text-[var(--st-text)] lg:text-[42px]">
              The safest payment credential is sometimes the one that was never created.
            </h1>
            <p className="max-w-[520px] font-sans text-[15px] leading-[1.55] text-[var(--st-text-secondary)]">
              Still Theirs evaluates the purchase before any payment credential exists. Choose a scenario to see how
              it&rsquo;s reviewed.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1px_1fr] lg:gap-10">
            <div className="flex flex-col gap-3.5">
              {(Object.keys(DEMO_SCENARIOS) as DemoScenarioId[]).map((id) => {
                const isSelected = selectedScenario === id;
                const isDimmed = selectedScenario !== null && !isSelected;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelect(id)}
                    aria-pressed={isSelected}
                    className={`relative min-h-[44px] border bg-[var(--st-surface)] px-5.5 py-5 text-left font-sans transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-text-muted)] ${
                      isSelected
                        ? "border-[var(--st-text)] shadow-[2px_2px_0_rgba(27,24,18,0.06)]"
                        : "border-[var(--st-border)] hover:border-[var(--st-text-secondary)]"
                    } ${isDimmed ? "opacity-45" : ""}`}
                  >
                    {isSelected && (
                      <span className="absolute -top-[9px] right-4 bg-[var(--st-bg)] px-1.5 font-mono text-[9.5px] tracking-[0.12em] text-[var(--st-text)]">
                        SELECTED
                      </span>
                    )}
                    <span className="mb-1.5 block font-serif text-[19px] text-[var(--st-text)]">
                      {SCENARIO_LABELS[id].title}
                    </span>
                    <span className="mb-3 block font-sans text-[13.5px] leading-[1.5] text-[var(--st-text-secondary)]">
                      {SCENARIO_LABELS[id].description}
                    </span>
                    <span className="block border-t border-dotted border-[var(--st-border)] pt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--st-text-muted)]">
                      {SCENARIO_LABELS[id].context}
                    </span>
                  </button>
                );
              })}
            </div>

            <HeldLine />

            <div className="flex flex-col gap-5">
              <CredentialArtifact tag="Credential territory">
                <p className="px-2 py-8 text-center font-mono text-xs leading-[1.6] tracking-[0.03em] text-[var(--st-text-muted)]">
                  Nothing exists here yet.
                </p>
              </CredentialArtifact>
              <div>
                <PrimaryAction onClick={handleCheck} disabled={!controller.canSubmit()} className="w-full">
                  Check this purchase
                </PrimaryAction>
                <p className="mt-2 text-center font-mono text-[10.5px] text-[var(--st-text-muted)]">
                  {selectedScenario ? "Nothing has been created yet." : "Select a scenario to continue"}
                </p>
              </div>
            </div>
          </div>

          {error && <p className="mt-6 text-center font-sans text-sm text-[var(--st-text-muted)]">{error}</p>}
        </section>
      )}

      {view === "ANALYZING" && (
        <section aria-label="Analysis in progress" className="mx-auto max-w-[1080px]">
          <div>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--st-text-secondary)]">
              Purchase intent under review
            </p>
            <h2 className="mb-1.5 mt-2 font-serif text-xl text-[var(--st-text)] lg:text-[28px]">
              Pre-credential checkpoint
            </h2>
            <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--st-text-muted)] lg:mb-9">
              {selectedScenario === "routine-groceries"
                ? "Scenario — routine digital purchase"
                : "Scenario — urgent gift cards"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1px_0.9fr] lg:gap-11">
            <ol className="flex flex-col">
              {ANALYSIS_STEPS.map((step, i) => {
                const revealed = i < analysisStep;
                const isFinal = i === ANALYSIS_STEPS.length - 1;
                return (
                  <li
                    key={step.label}
                    className={`flex gap-4 border-b border-[var(--st-border)] py-4 transition-all duration-[400ms] last:border-b-0 ${
                      revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                    }`}
                  >
                    <span className="w-5 pt-0.5 font-mono text-[11px] text-[var(--st-text-muted)]">0{i + 1}</span>
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] transition-colors duration-300 ${
                        revealed && isFinal
                          ? "border-[var(--st-safe)] bg-[var(--st-safe)]"
                          : revealed
                            ? "border-[var(--st-safe)]"
                            : "border-[var(--st-text-muted)]"
                      }`}
                    />
                    <span className="flex-1">
                      <span className="mb-0.5 block font-sans text-[14.5px] font-semibold text-[var(--st-text)]">
                        {step.label}
                      </span>
                      <span className="block max-w-[420px] font-sans text-[12.5px] leading-[1.5] text-[var(--st-text-secondary)]">
                        {step.copy}
                      </span>
                      {step.marginalia && (
                        <span className="mt-1.5 block border-l-2 border-[var(--st-paused-tint)] pl-3.5 font-serif text-[12.5px] italic text-[var(--st-text-secondary)]">
                          {step.marginalia}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>

            <HeldLine />

            <div>
              <CredentialArtifact tag="Credential territory" className="relative">
                {/* Static neutral placeholders for the entire sequence, for
                    both scenarios — nothing is progressively constructed on
                    this side of the line. */}
                <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--st-text-muted)]">Merchant</span>
                  <span className="text-[var(--st-text-muted)]">— · · ·</span>
                </div>
                <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--st-text-muted)]">Amount</span>
                  <span className="text-[var(--st-text-muted)]">— · · ·</span>
                </div>
                <div className="flex items-baseline justify-between py-2 font-mono text-[13px]">
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--st-text-muted)]">Scope</span>
                  <span className="text-[var(--st-text-muted)]">— · · ·</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--st-text)] pt-3.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--st-text-muted)]">
                    Status
                  </span>
                  <span className="font-mono text-sm font-medium tracking-[0.03em] text-[var(--st-text)]">
                    {allStepsRevealed ? "Decision ready" : "Awaiting decision"}
                  </span>
                </div>
                <Seal
                  verdict="held"
                  className={`-top-4 right-6 transition-opacity duration-300 ${allStepsRevealed ? "opacity-100" : "opacity-0"}`}
                >
                  Held
                </Seal>
              </CredentialArtifact>
            </div>
          </div>
        </section>
      )}

      {view === "DECISION" && result && (
        <section aria-label="Decision" className="mx-auto max-w-[1160px]">
          {result.decision === "APPROVE" ? (
            <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_1px_1fr] lg:gap-12">
              <div>
                <div className="mb-5">
                  <StatusBadge tone="safe">Eligible for scoped payment</StatusBadge>
                </div>
                <h2 className="mb-3.5 font-serif text-xl leading-[1.25] text-[var(--st-text)] lg:text-[26px]">
                  {result.explanation.headline}
                </h2>
                <p className="mb-6 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
                  {result.explanation.calmExplanation}
                </p>
                <WhatWeNoticed signals={result.explanation.signals} />
              </div>

              <HeldLine />

              <div>
                {result.decision === "APPROVE" && scenario && (
                  <div className="st-fade-settle relative">
                    <CredentialArtifact tag="Scoped payment instruction" locked className="p-8">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
                        Payment instruction
                      </p>
                      <h3 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--st-text-secondary)]">
                        What the payment credential will be allowed to do
                      </h3>
                      <dl className="[&_dd]:text-right [&_dd]:font-medium [&_dd]:text-[var(--st-text)] [&_dt]:text-[10.5px] [&_dt]:uppercase [&_dt]:tracking-[0.06em] [&_dt]:text-[var(--st-text-muted)]">
                        <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                          <dt>Merchant</dt>
                          <dd>{scenario.merchantLabel}</dd>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                          <dt>Maximum amount</dt>
                          <dd>{formatAmount(scenario.amountCents, scenario.currency)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                          <dt>Purpose</dt>
                          <dd>Digital cookbook</dd>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-dotted border-[var(--st-border)] py-2 font-mono text-[13px]">
                          <dt>Credential scope</dt>
                          <dd>One purchase only</dd>
                        </div>
                        <div className="flex items-baseline justify-between py-2 font-mono text-[13px]">
                          <dt>Human confirmation</dt>
                          <dd>Required before creation</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center justify-between border-t border-[var(--st-text)] pt-3.5">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--st-text-muted)]">
                          Status
                        </span>
                        <span className="font-mono text-sm font-medium tracking-[0.03em] text-[var(--st-text)]">
                          Not yet created
                        </span>
                      </div>
                      <p className="mt-4 font-sans text-[12.5px] leading-[1.5] text-[var(--st-text-secondary)]">
                        This instruction will be sent to Prava only after you explicitly continue.
                      </p>
                      <p className="mt-1.5 font-sans text-[11px] text-[var(--st-text-muted)]">
                        Visa Intelligent Commerce-enabled through Prava.
                      </p>
                    </CredentialArtifact>
                    <Seal verdict="scoped" className="-top-4 right-6">
                      Scoped
                    </Seal>
                  </div>
                )}

                <div className="mt-6">
                  <p className="mb-4 font-sans text-sm text-[var(--st-text-secondary)]">
                    No payment credential has been created yet.
                  </p>
                  <PrimaryAction href="/gate-a2?mode=phone&source=demo" className="w-full">
                    Continue to secure payment
                  </PrimaryAction>
                  <p className="mt-2.5 text-center font-mono text-[10.5px] leading-[1.6] text-[var(--st-text-muted)]">
                    Prava may create the scoped credential only after your explicit verification.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[0.85fr_1px_1.3fr] lg:gap-12">
              <div className="order-3 lg:order-none">
                <div className="mb-5">
                  <StatusBadge tone="paused">Purchase paused</StatusBadge>
                </div>
                <h2 className="mb-3 font-serif text-lg leading-[1.3] text-[var(--st-text)] lg:text-[22px]">
                  {result.explanation.headline}
                </h2>
                <p className="mb-6 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
                  {result.explanation.calmExplanation}
                </p>
                <div className="mb-6">
                  <WhatWeNoticed signals={result.explanation.signals} />
                </div>

                <dl className="mb-6 border-t border-[var(--st-border)]">
                  <DefinitionRow term="Prava session" value="Not created" />
                  <DefinitionRow term="Payment credential" value="Not created" />
                  <DefinitionRow
                    term="Trusted perspective"
                    value={
                      <span className="text-[var(--st-safe-deep)]">
                        {linqStatus === "SENT" ? "Sent through Linq" : "Available through Linq"}
                        {linqStatus === "SENT" && (
                          <span aria-hidden="true" className="ml-1.5">
                            ✓
                          </span>
                        )}
                      </span>
                    }
                  />
                  <DefinitionRow term="Financial authority" value="Still yours" />
                </dl>

                <div className="flex flex-col gap-2.5">
                  {linqStatus === "SENT" ? (
                    <div className="flex min-h-[44px] items-center justify-center border border-[var(--st-safe-deep)] bg-[var(--st-safe-deep)] px-6 py-3 font-sans text-xs font-semibold uppercase tracking-[0.08em] text-[var(--st-bg)]">
                      Perspective request sent
                    </div>
                  ) : (
                    <PrimaryAction
                      onClick={handleSendPerspectiveRequest}
                      disabled={linqStatus === "SENDING"}
                      className="w-full"
                    >
                      {linqStatus === "SENDING"
                        ? "Sending..."
                        : linqStatus === "ERROR"
                          ? "Try again"
                          : "Send perspective request via iMessage"}
                    </PrimaryAction>
                  )}
                  {linqStatus === "ERROR" && linqError && (
                    <p className="font-sans text-sm text-[var(--st-text-muted)]">{linqError}</p>
                  )}
                  <SecondaryAction onClick={handleAskTrustedContact} className="w-full">
                    Preview trusted review
                  </SecondaryAction>
                </div>

                {/* Additive confirmation only — the verdict badge and title
                    above never change when a perspective request is sent. */}
                {linqStatus === "SENT" && (
                  <div className="mt-6 border-t border-[var(--st-border)] pt-5">
                    <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--st-safe-deep)]">
                      Perspective request sent
                    </p>
                    <dl>
                      <DefinitionRow
                        term="Trusted perspective"
                        value={<span className="text-[var(--st-safe-deep)]">Sent through Linq</span>}
                      />
                      <DefinitionRow term="Financial authority" value="Still yours" />
                    </dl>
                    <p className="mt-4 font-serif text-sm italic text-[var(--st-text-secondary)]">
                      No authority transferred.
                    </p>
                  </div>
                )}
              </div>

              <HeldLine className="order-2 lg:order-none" />

              <div className="order-1 flex min-h-[300px] flex-col items-center justify-center py-3.5 lg:order-none lg:min-h-[400px] lg:py-5">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--st-text-muted)]">
                  Credential territory
                </p>
                <div className="relative">
                  <div className="flex w-[230px] items-center justify-center border-[1.5px] border-dashed border-[var(--st-paused)] bg-[var(--st-surface)] p-4 [aspect-ratio:1.586/1] lg:w-[340px] lg:p-6">
                    <div className="text-center">
                      <span className="mb-2.5 block font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--st-paused-deep)]">
                        Credential
                      </span>
                      <span className="block font-serif text-[22px] italic leading-[1.12] tracking-[-0.01em] text-[var(--st-text)] lg:text-[34px]">
                        Not created.
                      </span>
                    </div>
                  </div>
                  <span aria-hidden="true" className="st-resolve-pulse" />
                  <Seal verdict="withheld" className="st-seal-settle -bottom-2.5 -right-2.5 lg:-bottom-4 lg:-right-4">
                    Withheld
                  </Seal>
                </div>
                <p className="mt-4 text-center font-mono text-[9.5px] tracking-[0.03em] text-[var(--st-text-muted)] lg:text-[10.5px]">
                  No credential issued · authority withheld.
                </p>
              </div>
            </div>
          )}

          <div className="mt-10 text-center">
            <SecondaryAction onClick={handleReset}>Start over</SecondaryAction>
          </div>
        </section>
      )}

      {view === "TRUSTED_REVIEW" && scenario && (
        <section aria-label="Review request" className="mx-auto max-w-xl">
          <SurfaceCard className="p-7">
            <StatusBadge tone="neutral">Trusted perspective — no payment authority</StatusBadge>
            <p className="mb-2 mt-3.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
              Still Theirs local safety step — review request
            </p>
            <dl className="mb-4">
              <DefinitionRow term="Merchant category" value={scenario.merchantCategory} />
              <DefinitionRow term="Approximate amount" value={formatAmount(scenario.amountCents, scenario.currency)} />
            </dl>
            <div>
              <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--st-text-secondary)]">
                What stood out
              </h3>
              <ul className="space-y-1.5 font-sans text-sm text-[var(--st-text-secondary)]">
                {result?.explanation.signals.map((s) => (
                  <li key={s.code}>{s.plainLanguage}</li>
                ))}
              </ul>
            </div>
            <div className="mt-6 text-center">
              <PrimaryAction onClick={handleProceedToTrustedResponse}>Continue</PrimaryAction>
            </div>
          </SurfaceCard>
        </section>
      )}

      {view === "TRUSTED_RESPONSE" && (
        <section aria-label="Trusted contact response" className="mx-auto max-w-xl">
          <SurfaceCard className="p-7">
            <StatusBadge tone="neutral">Trusted perspective — no payment authority</StatusBadge>
            <p className="mb-2 mt-3.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
              Trusted contact — their view only
            </p>
            <p className="mb-5 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
              The trusted contact can share a view. They cannot purchase, approve payment, create a credential, or
              change this decision.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SecondaryAction onClick={() => handleTrustedChoice("CONSISTENT")} className="flex-1">
                This seems consistent
              </SecondaryAction>
              <SecondaryAction onClick={() => handleTrustedChoice("RECOMMEND_PAUSE")} className="flex-1">
                I recommend pausing
              </SecondaryAction>
            </div>
          </SurfaceCard>
        </section>
      )}

      {view === "TRUSTED_RETURN" && (
        <section aria-label="Return to user" className="mx-auto max-w-xl">
          <SurfaceCard emphasis className="p-7">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
              Back to you
            </p>
            <p className="mb-2 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
              Your trusted contact&rsquo;s recommendation:{" "}
              <span className="font-medium text-[var(--st-text)]">
                {trustedContactChoice === "CONSISTENT" ? "This seems consistent." : "They recommend pausing."}
              </span>
            </p>
            <p className="mb-2 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
              The final choice remains yours. No credential was created.
            </p>
            <p className="mb-5 font-sans text-sm leading-[1.6] text-[var(--st-text-secondary)]">
              You can stop here, reconsider, or begin a new purchase later.
            </p>
            <div className="text-center">
              <PrimaryAction onClick={handleReset}>Start over</PrimaryAction>
            </div>
          </SurfaceCard>
        </section>
      )}
    </ProductShell>
  );
}
