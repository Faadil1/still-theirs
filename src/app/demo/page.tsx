"use client";

import { useState } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/risk/scenarios";

type Progress = "idle" | "intent" | "rules" | "explanation" | "ready";

interface AnalyzeResult {
  decision: "APPROVE" | "REQUEST_TRUSTED_CONTACT";
  score: number;
  reasonCodes: string[];
  safeToCreatePravaSession: boolean;
  credentialCreationAllowed: boolean;
  explanation: {
    headline: string;
    calmExplanation: string;
    signals: { code: string; plainLanguage: string }[];
    questionsToConsider: string[];
    nextStep: string;
    confidenceBand: string;
    source: "OPENAI" | "DETERMINISTIC_FALLBACK";
  };
  proof: {
    pravaSessionCreated: boolean;
    paymentCredentialCreated: boolean;
  };
}

const SCENARIO_LABELS: Record<DemoScenarioId, { title: string; description: string }> = {
  "routine-groceries": {
    title: "Routine groceries",
    description: "A small, everyday grocery order from a familiar merchant.",
  },
  "urgent-gift-cards": {
    title: "Urgent gift cards",
    description: "A new online contact urgently asking for several gift cards.",
  },
};

export default function DemoPage() {
  const [selected, setSelected] = useState<DemoScenarioId | null>(null);
  const [progress, setProgress] = useState<Progress>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setSelected(null);
    setProgress("idle");
    setResult(null);
    setError(null);
    setBusy(false);
  }

  async function handleReview() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress("intent");

    try {
      const intent = DEMO_SCENARIOS[selected];
      // Visual progression only — the actual work happens in one request.
      await new Promise((r) => setTimeout(r, 200));
      setProgress("rules");
      await new Promise((r) => setTimeout(r, 200));
      setProgress("explanation");

      const res = await fetch("/api/risk/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      const data = await res.json();

      if (!res.ok) {
        setError("Something didn't go through. You can try again.");
        setProgress("idle");
        return;
      }

      setResult(data);
      setProgress("ready");
    } catch {
      setError("Something didn't go through. You can try again.");
      setProgress("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans text-sm text-black dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-bold">Still Theirs</h1>
        <p className="mb-6 text-lg text-zinc-700 dark:text-zinc-300">
          The safest payment credential is sometimes the one that was never created.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(Object.keys(DEMO_SCENARIOS) as DemoScenarioId[]).map((id) => (
            <button
              key={id}
              onClick={() => {
                setSelected(id);
                setResult(null);
                setError(null);
                setProgress("idle");
              }}
              className={`rounded border p-4 text-left ${
                selected === id ? "border-black dark:border-white" : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <div className="font-semibold">{SCENARIO_LABELS[id].title}</div>
              <div className="text-zinc-600 dark:text-zinc-400">{SCENARIO_LABELS[id].description}</div>
            </button>
          ))}
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={handleReview}
            disabled={!selected || busy}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy ? "Reviewing..." : "Review this purchase"}
          </button>
          <button onClick={reset} className="rounded border border-zinc-400 px-4 py-2">
            Reset
          </button>
        </div>

        {progress !== "idle" && (
          <div className="mb-6 rounded border border-zinc-300 p-4 dark:border-zinc-700">
            <ol className="space-y-1">
              <li>{progress ? "✓" : "○"} Intent received</li>
              <li>{["rules", "explanation", "ready"].includes(progress) ? "✓" : "○"} Deterministic checks completed</li>
              <li>{["explanation", "ready"].includes(progress) ? "✓" : "○"} Explanation prepared</li>
              <li>{progress === "ready" ? "✓" : "○"} Decision ready</li>
            </ol>
          </div>
        )}

        {error && <p className="mb-6 rounded border border-zinc-300 p-3 dark:border-zinc-700">{error}</p>}

        {result && (
          <div className="space-y-4">
            <section className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
              <h2 className="mb-1 font-bold">{result.explanation.headline}</h2>
              <p>{result.explanation.calmExplanation}</p>
            </section>

            <section className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
              <h3 className="mb-2 font-semibold">What we noticed</h3>
              <ul className="list-inside list-disc space-y-1">
                {result.explanation.signals.map((s) => (
                  <li key={s.code}>{s.plainLanguage}</li>
                ))}
              </ul>
            </section>

            {result.explanation.questionsToConsider.length > 0 && (
              <section className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
                <h3 className="mb-2 font-semibold">Questions worth considering</h3>
                <ul className="list-inside list-disc space-y-1">
                  {result.explanation.questionsToConsider.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
              <h3 className="mb-1 font-semibold">Next step</h3>
              <p>{result.explanation.nextStep}</p>
            </section>

            <section className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
              <h3 className="mb-2 font-semibold">Credential proof</h3>
              <p>Prava session created: {result.proof.pravaSessionCreated ? "Yes" : "No"}</p>
              <p>Payment credential created: {result.proof.paymentCredentialCreated ? "Yes" : "No"}</p>
              {result.decision === "APPROVE" && (
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Eligible to create a Prava session later — not created in this demo step.
                </p>
              )}
              {result.decision === "REQUEST_TRUSTED_CONTACT" && (
                <p className="mt-2 font-medium">
                  The safest payment credential is sometimes the one that was never created.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
