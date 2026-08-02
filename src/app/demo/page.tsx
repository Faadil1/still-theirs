"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/risk/scenarios";
import { DemoFlowController, type AnalyzeResultShape, type TrustedContactChoice } from "@/lib/demo/demoFlow";

const SCENARIO_LABELS: Record<DemoScenarioId, { title: string; description: string; expected: string }> = {
  "routine-groceries": {
    title: "Routine groceries",
    description: "A small, everyday grocery order from a familiar merchant.",
    expected: "Expected: eligible to proceed",
  },
  "urgent-gift-cards": {
    title: "Urgent gift cards",
    description: "A new online contact urgently asking for several gift cards.",
    expected: "Expected: pause for a second perspective",
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

export default function DemoPage() {
  const [controller] = useState(() => new DemoFlowController());
  const [state, setState] = useState(() => controller.getState());
  const [analysisStep, setAnalysisStep] = useState(0);

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

  const { view, selectedScenario, result, error, trustedContactChoice } = state;
  const scenario = selectedScenario ? DEMO_SCENARIOS[selectedScenario] : null;

  return (
    <div className="min-h-screen bg-[#faf8f5] px-4 py-10 font-serif text-[#1c1a17] dark:bg-[#141210] dark:text-[#f2ede6] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 text-center">
          <p className="mb-2 text-xs font-sans font-medium uppercase tracking-[0.2em] text-[#8a7f6d] dark:text-[#a89a82]">
            Still Theirs
          </p>
          <h1 className="text-2xl italic leading-snug sm:text-3xl">
            The safest payment credential is sometimes the one that was never created.
          </h1>
        </header>

        {view === "SELECT" && (
          <section aria-label="Choose a scenario">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(Object.keys(DEMO_SCENARIOS) as DemoScenarioId[]).map((id) => {
                const isSelected = selectedScenario === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelect(id)}
                    aria-pressed={isSelected}
                    className={`rounded-lg border p-5 text-left font-sans transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7f6d] ${
                      isSelected
                        ? "border-[#1c1a17] bg-white shadow-sm dark:border-[#f2ede6] dark:bg-[#1c1a17]"
                        : "border-[#ded6c8] bg-white/60 hover:border-[#b8ac95] dark:border-[#3a352c] dark:bg-[#1c1a17]/40"
                    }`}
                  >
                    <div className="mb-1 font-serif text-lg">{SCENARIO_LABELS[id].title}</div>
                    <p className="mb-2 text-sm text-[#5c5546] dark:text-[#c9bfa9]">{SCENARIO_LABELS[id].description}</p>
                    <p className="text-xs uppercase tracking-wide text-[#8a7f6d] dark:text-[#a89a82]">
                      {SCENARIO_LABELS[id].expected}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={handleCheck}
                disabled={!controller.canSubmit()}
                className="rounded-full bg-[#1c1a17] px-8 py-3 font-sans text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#f2ede6] dark:text-[#1c1a17] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
              >
                Check this purchase
              </button>
            </div>

            {error && <p className="mt-4 text-center font-sans text-sm text-[#8a7f6d]">{error}</p>}
          </section>
        )}

        {view === "ANALYZING" && (
          <section aria-label="Analysis in progress" className="rounded-lg border border-[#ded6c8] bg-white/70 p-6 font-sans dark:border-[#3a352c] dark:bg-[#1c1a17]/40">
            <ol className="space-y-3">
              {ANALYSIS_STEPS.map((step, i) => (
                <li key={step} className={`flex items-center gap-3 text-sm ${i <= analysisStep ? "text-[#1c1a17] dark:text-[#f2ede6]" : "text-[#b8ac95]"}`}>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                      i <= analysisStep ? "border-[#1c1a17] dark:border-[#f2ede6]" : "border-[#ded6c8]"
                    }`}
                  >
                    {i < analysisStep ? "✓" : ""}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        )}

        {view === "DECISION" && result && (
          <section aria-label="Decision" className="space-y-5">
            <div className="rounded-lg border border-[#ded6c8] bg-white/80 p-6 dark:border-[#3a352c] dark:bg-[#1c1a17]/50">
              <p className="mb-1 font-sans text-xs uppercase tracking-[0.15em] text-[#8a7f6d] dark:text-[#a89a82]">
                {result.decision === "APPROVE" ? "Eligible for secure payment" : "Payment paused before credential creation"}
              </p>
              <h2 className="mb-3 text-xl">{result.explanation.headline}</h2>
              <p className="font-sans text-[#3a352c] dark:text-[#d8cfbd]">{result.explanation.calmExplanation}</p>
            </div>

            <div className="rounded-lg border border-[#ded6c8] bg-white/60 p-6 font-sans dark:border-[#3a352c] dark:bg-[#1c1a17]/30">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#5c5546] dark:text-[#c9bfa9]">
                What we noticed
              </h3>
              <ul className="space-y-2">
                {result.explanation.signals.map((s) => (
                  <li key={s.code} className="text-sm text-[#3a352c] dark:text-[#d8cfbd]">
                    {s.plainLanguage}
                  </li>
                ))}
              </ul>
            </div>

            {result.decision === "APPROVE" ? (
              <div className="rounded-lg border border-[#ded6c8] bg-white/60 p-6 font-sans dark:border-[#3a352c] dark:bg-[#1c1a17]/30">
                <p className="mb-4 text-sm text-[#5c5546] dark:text-[#c9bfa9]">
                  No payment credential has been created yet.
                </p>
                <Link
                  href="/gate-a2?mode=phone&source=demo"
                  className="inline-block rounded-full bg-[#1c1a17] px-6 py-2.5 text-sm font-medium text-white dark:bg-[#f2ede6] dark:text-[#1c1a17] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
                >
                  Continue to secure payment
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-[#1c1a17] bg-white p-6 font-sans dark:border-[#f2ede6] dark:bg-[#1c1a17]">
                <p className="mb-4 text-lg italic">No credential was created.</p>
                <dl className="mb-4 space-y-1 text-sm text-[#3a352c] dark:text-[#d8cfbd]">
                  <div className="flex justify-between">
                    <dt>Prava session created</dt>
                    <dd className="font-medium">No</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Payment credential created</dt>
                    <dd className="font-medium">No</dd>
                  </div>
                </dl>
                <button
                  onClick={handleAskTrustedContact}
                  className="rounded-full bg-[#1c1a17] px-6 py-2.5 text-sm font-medium text-white dark:bg-[#f2ede6] dark:text-[#1c1a17] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
                >
                  Ask someone I trust
                </button>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={handleReset}
                className="font-sans text-sm text-[#8a7f6d] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7f6d]"
              >
                Start over
              </button>
            </div>
          </section>
        )}

        {view === "TRUSTED_REVIEW" && scenario && (
          <section aria-label="Review request" className="space-y-5 rounded-lg border border-[#ded6c8] bg-white/80 p-6 font-sans dark:border-[#3a352c] dark:bg-[#1c1a17]/50">
            <p className="text-xs uppercase tracking-[0.15em] text-[#8a7f6d] dark:text-[#a89a82]">
              Still Theirs local safety step — review request
            </p>
            <dl className="space-y-2 text-sm text-[#3a352c] dark:text-[#d8cfbd]">
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
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#5c5546] dark:text-[#c9bfa9]">
                What stood out
              </h3>
              <ul className="space-y-1 text-sm text-[#3a352c] dark:text-[#d8cfbd]">
                {result?.explanation.signals.map((s) => (
                  <li key={s.code}>{s.plainLanguage}</li>
                ))}
              </ul>
            </div>
            <div className="text-center">
              <button
                onClick={handleProceedToTrustedResponse}
                className="rounded-full bg-[#1c1a17] px-6 py-2.5 text-sm font-medium text-white dark:bg-[#f2ede6] dark:text-[#1c1a17] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {view === "TRUSTED_RESPONSE" && (
          <section aria-label="Trusted contact response" className="space-y-5 rounded-lg border border-[#ded6c8] bg-white/80 p-6 font-sans dark:border-[#3a352c] dark:bg-[#1c1a17]/50">
            <p className="text-xs uppercase tracking-[0.15em] text-[#8a7f6d] dark:text-[#a89a82]">
              Trusted contact — their view only
            </p>
            <p className="text-sm text-[#5c5546] dark:text-[#c9bfa9]">
              The trusted contact can share a view. They cannot purchase, approve payment, create a credential, or
              change this decision.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => handleTrustedChoice("CONSISTENT")}
                className="flex-1 rounded-full border border-[#1c1a17] px-6 py-2.5 text-sm font-medium dark:border-[#f2ede6] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
              >
                This seems consistent
              </button>
              <button
                onClick={() => handleTrustedChoice("RECOMMEND_PAUSE")}
                className="flex-1 rounded-full border border-[#1c1a17] px-6 py-2.5 text-sm font-medium dark:border-[#f2ede6] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
              >
                I recommend pausing
              </button>
            </div>
          </section>
        )}

        {view === "TRUSTED_RETURN" && (
          <section aria-label="Return to user" className="space-y-5 rounded-lg border border-[#1c1a17] bg-white p-6 font-sans dark:border-[#f2ede6] dark:bg-[#1c1a17]">
            <p className="text-xs uppercase tracking-[0.15em] text-[#8a7f6d] dark:text-[#a89a82]">Back to you</p>
            <p className="text-[#3a352c] dark:text-[#d8cfbd]">
              Your trusted contact&rsquo;s recommendation:{" "}
              <span className="font-medium">
                {trustedContactChoice === "CONSISTENT" ? "This seems consistent." : "They recommend pausing."}
              </span>
            </p>
            <p className="text-[#3a352c] dark:text-[#d8cfbd]">The final choice remains yours. No credential was created.</p>
            <p className="text-[#3a352c] dark:text-[#d8cfbd]">
              You can stop here, reconsider, or begin a new purchase later.
            </p>
            <div className="text-center">
              <button
                onClick={handleReset}
                className="rounded-full bg-[#1c1a17] px-6 py-2.5 text-sm font-medium text-white dark:bg-[#f2ede6] dark:text-[#1c1a17] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#8a7f6d]"
              >
                Start over
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
