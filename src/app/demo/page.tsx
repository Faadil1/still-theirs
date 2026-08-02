"use client";

import { useState } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/risk/scenarios";
import { DemoFlowController, type AnalyzeResultShape, type TrustedContactChoice } from "@/lib/demo/demoFlow";
import { ProductShell, ProductBrand, StatusBadge, SurfaceCard, DefinitionRow, PrimaryAction, SecondaryAction } from "@/components/ui";

const SCENARIO_LABELS: Record<DemoScenarioId, { title: string; description: string; outcome: string }> = {
  "routine-groceries": {
    title: "Routine digital purchase",
    description: "A small, low-cost digital cookbook purchase from a familiar platform.",
    outcome: "Eligible for scoped payment",
  },
  "urgent-gift-cards": {
    title: "Urgent gift cards",
    description: "A new online contact urgently asking for several gift cards.",
    outcome: "Pause before credential creation",
  },
};

const ANALYSIS_STEPS = [
  "Purchase intent received",
  "Deterministic safety rules applied",
  "OpenAI explanation generated",
  "Decision ready",
];

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
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
    setAnalysisStep(0);

    const scenarioId = state.selectedScenario;
    if (!scenarioId) return;

    try {
      for (let i = 0; i < ANALYSIS_STEPS.length - 1; i++) {
        await new Promise((r) => setTimeout(r, 250));
        setAnalysisStep(i + 1);
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

      setAnalysisStep(ANALYSIS_STEPS.length - 1);
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

  return (
    <ProductShell wide>
      <header className="mb-10 text-center">
        <ProductBrand />
        <h1 className="font-serif text-2xl italic leading-snug text-[var(--st-text)] sm:text-3xl">
          The safest payment credential is sometimes the one that was never created.
        </h1>
        <p className="mx-auto mt-3 max-w-xl font-sans text-sm text-[var(--st-text-secondary)]">
          Still Theirs evaluates the purchase before any payment credential exists.
        </p>
      </header>

      {view === "SELECT" && (
        <section aria-label="Choose a scenario" className="mx-auto max-w-3xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(Object.keys(DEMO_SCENARIOS) as DemoScenarioId[]).map((id) => {
              const isSelected = selectedScenario === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  aria-pressed={isSelected}
                  className={`min-h-[44px] rounded-2xl border p-5 text-left font-sans transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-text-muted)] ${
                    isSelected
                      ? "border-[var(--st-text)] bg-[var(--st-surface)] shadow-[0_2px_14px_rgba(28,26,23,0.07)]"
                      : "border-[var(--st-border)] bg-[var(--st-surface)]/60 hover:border-[var(--st-text-muted)]"
                  }`}
                >
                  <div className="mb-1 font-serif text-lg text-[var(--st-text)]">{SCENARIO_LABELS[id].title}</div>
                  <p className="mb-3 text-sm text-[var(--st-text-secondary)]">{SCENARIO_LABELS[id].description}</p>
                  <StatusBadge tone={id === "routine-groceries" ? "safe" : "paused"}>
                    {SCENARIO_LABELS[id].outcome}
                  </StatusBadge>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex justify-center">
            <PrimaryAction onClick={handleCheck} disabled={!controller.canSubmit()}>
              Check this purchase
            </PrimaryAction>
          </div>

          {error && <p className="mt-4 text-center font-sans text-sm text-[var(--st-text-muted)]">{error}</p>}
        </section>
      )}

      {view === "ANALYZING" && (
        <section aria-label="Analysis in progress" className="mx-auto max-w-xl">
          <SurfaceCard>
            <ol className="space-y-3 font-sans">
              {ANALYSIS_STEPS.map((step, i) => {
                const isDone = i < analysisStep;
                const isActive = i === analysisStep;
                return (
                  <li
                    key={step}
                    className={`flex items-center gap-3 text-sm transition-colors duration-200 ${
                      isDone || isActive ? "text-[var(--st-text)]" : "text-[var(--st-text-muted)]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200 ${
                        isDone
                          ? "border-[var(--st-safe)] bg-[var(--st-safe)]/10 text-[var(--st-safe)]"
                          : isActive
                            ? "animate-pulse border-[var(--st-text)]"
                            : "border-[var(--st-border)]"
                      }`}
                    >
                      {isDone ? "✓" : ""}
                    </span>
                    {step}
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 border-t border-[var(--st-border)] pt-4 font-sans text-xs text-[var(--st-text-muted)]">
              OpenAI explains the deterministic decision. It cannot override it.
            </p>
          </SurfaceCard>
        </section>
      )}

      {view === "DECISION" && result && (
        <section aria-label="Decision" className="mx-auto max-w-4xl space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div className="space-y-6">
              <SurfaceCard emphasis>
                <StatusBadge tone={result.decision === "APPROVE" ? "safe" : "paused"}>
                  {result.decision === "APPROVE" ? "Eligible for scoped payment" : "Purchase paused before credential creation"}
                </StatusBadge>
                <h2 className="mb-3 mt-3 font-serif text-xl text-[var(--st-text)]">{result.explanation.headline}</h2>
                <p className="font-sans text-[var(--st-text-secondary)]">{result.explanation.calmExplanation}</p>
              </SurfaceCard>

              <SurfaceCard>
                <h3 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-[var(--st-text-secondary)]">
                  What we noticed
                </h3>
                <ul className="space-y-2">
                  {result.explanation.signals.map((s) => (
                    <li key={s.code} className="font-sans text-sm text-[var(--st-text-secondary)]">
                      {s.plainLanguage}
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            </div>

            <div className="space-y-6 lg:sticky lg:top-8">
              {result.decision === "APPROVE" && scenario && (
                <SurfaceCard emphasis>
                  <p className="mb-1 font-sans text-xs uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
                    Payment instruction
                  </p>
                  <h3 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-[var(--st-text-secondary)]">
                    What the payment credential will be allowed to do
                  </h3>
                  <dl className="mb-4 space-y-2 font-sans text-sm text-[var(--st-text)]">
                    <div className="flex justify-between">
                      <dt>Merchant</dt>
                      <dd className="font-medium">{scenario.merchantLabel}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Maximum amount</dt>
                      <dd className="font-medium">{formatAmount(scenario.amountCents, scenario.currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Purpose</dt>
                      <dd className="font-medium">Digital cookbook</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Credential scope</dt>
                      <dd className="font-medium">One purchase only</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Human confirmation</dt>
                      <dd className="font-medium">Required before creation</dd>
                    </div>
                  </dl>
                  <p className="mb-2 font-sans text-sm text-[var(--st-text-secondary)]">
                    This instruction will be sent to Prava only after you explicitly continue.
                  </p>
                  <p className="font-sans text-xs text-[var(--st-text-muted)]">Visa Intelligent Commerce-enabled through Prava.</p>
                </SurfaceCard>
              )}

              {result.decision === "APPROVE" ? (
                <SurfaceCard>
                  <p className="mb-4 font-sans text-sm text-[var(--st-text-secondary)]">
                    No payment credential has been created yet.
                  </p>
                  <PrimaryAction href="/gate-a2?mode=phone&source=demo" className="w-full">
                    Continue to secure payment
                  </PrimaryAction>
                  <ol className="mt-5 space-y-1.5 font-sans text-xs text-[var(--st-text-muted)]">
                    <li>1. Intent approved</li>
                    <li>2. You explicitly continue</li>
                    <li>3. Prava may create the scoped credential</li>
                  </ol>
                </SurfaceCard>
              ) : (
                <SurfaceCard className="border-[var(--st-paused)]/30">
                  <p className="mb-4 font-serif text-lg italic text-[var(--st-text)]">No credential was created.</p>
                  <dl className="mb-5 divide-y divide-[var(--st-border)]">
                    <DefinitionRow term="Prava session" value="Not created" />
                    <DefinitionRow term="Payment credential" value="Not created" />
                    <DefinitionRow term="Trusted perspective" value={linqStatus === "SENT" ? "Sent through Linq" : "Available through Linq"} />
                    <DefinitionRow term="Financial authority" value="Still yours" />
                  </dl>

                  {linqStatus === "SENT" ? (
                    <SurfaceCard className="border-[var(--st-safe)]/30 bg-[var(--st-safe)]/5 p-4">
                      <p className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[var(--st-safe)]">
                        Perspective request sent
                      </p>
                      <dl className="space-y-1">
                        <DefinitionRow term="Prava session" value="Not created" />
                        <DefinitionRow term="Payment credential" value="Not created" />
                        <DefinitionRow term="Trusted perspective" value="Sent through Linq" />
                        <DefinitionRow term="Financial authority" value="Still yours" />
                      </dl>
                      <p className="mt-3 font-sans text-xs text-[var(--st-text-muted)]">No authority transferred.</p>
                    </SurfaceCard>
                  ) : (
                    <div className="space-y-3">
                      <PrimaryAction
                        onClick={handleSendPerspectiveRequest}
                        disabled={linqStatus === "SENDING"}
                        className="w-full"
                      >
                        {linqStatus === "SENDING" ? "Sending..." : linqStatus === "ERROR" ? "Try again" : "Send perspective request via iMessage"}
                      </PrimaryAction>
                      {linqStatus === "ERROR" && linqError && (
                        <p className="font-sans text-sm text-[var(--st-text-muted)]">{linqError}</p>
                      )}
                      <SecondaryAction onClick={handleAskTrustedContact} className="w-full">
                        Preview trusted review
                      </SecondaryAction>
                    </div>
                  )}
                </SurfaceCard>
              )}
            </div>
          </div>

          <div className="text-center">
            <SecondaryAction onClick={handleReset}>Start over</SecondaryAction>
          </div>
        </section>
      )}

      {view === "TRUSTED_REVIEW" && scenario && (
        <section aria-label="Review request" className="mx-auto max-w-xl">
          <SurfaceCard>
            <StatusBadge tone="neutral">Trusted perspective — no payment authority</StatusBadge>
            <p className="mb-2 mt-3 font-sans text-xs uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
              Still Theirs local safety step — review request
            </p>
            <dl className="mb-4 space-y-2 font-sans text-sm text-[var(--st-text-secondary)]">
              <div className="flex justify-between">
                <dt>Merchant category</dt>
                <dd>{scenario.merchantCategory}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Approximate amount</dt>
                <dd>{formatAmount(scenario.amountCents, scenario.currency)}</dd>
              </div>
            </dl>
            <div>
              <h3 className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-[var(--st-text-secondary)]">
                What stood out
              </h3>
              <ul className="space-y-1 font-sans text-sm text-[var(--st-text-secondary)]">
                {result?.explanation.signals.map((s) => (
                  <li key={s.code}>{s.plainLanguage}</li>
                ))}
              </ul>
            </div>
            <div className="mt-5 text-center">
              <PrimaryAction onClick={handleProceedToTrustedResponse}>Continue</PrimaryAction>
            </div>
          </SurfaceCard>
        </section>
      )}

      {view === "TRUSTED_RESPONSE" && (
        <section aria-label="Trusted contact response" className="mx-auto max-w-xl">
          <SurfaceCard>
            <StatusBadge tone="neutral">Trusted perspective — no payment authority</StatusBadge>
            <p className="mb-2 mt-3 font-sans text-xs uppercase tracking-[0.15em] text-[var(--st-text-muted)]">
              Trusted contact — their view only
            </p>
            <p className="mb-5 font-sans text-sm text-[var(--st-text-secondary)]">
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
          <SurfaceCard emphasis>
            <p className="mb-2 font-sans text-xs uppercase tracking-[0.15em] text-[var(--st-text-muted)]">Back to you</p>
            <p className="mb-2 font-sans text-[var(--st-text-secondary)]">
              Your trusted contact&rsquo;s recommendation:{" "}
              <span className="font-medium text-[var(--st-text)]">
                {trustedContactChoice === "CONSISTENT" ? "This seems consistent." : "They recommend pausing."}
              </span>
            </p>
            <p className="mb-2 font-sans text-[var(--st-text-secondary)]">The final choice remains yours. No credential was created.</p>
            <p className="mb-5 font-sans text-[var(--st-text-secondary)]">
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
