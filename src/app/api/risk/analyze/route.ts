import { NextRequest, NextResponse } from "next/server";
import { purchaseIntentSchema } from "@/lib/risk/schema";
import { evaluatePurchaseIntent } from "@/lib/risk/rules";
import { generateExplanation } from "@/lib/risk/openaiExplanation";
import { appendAuditEvent } from "@/lib/audit";

// Simple single-flight guard for this demo: rejects a second request that
// arrives while one is still in progress, preventing duplicate analysis
// requests from a double-click or a re-entrant call.
let requestInFlight = false;

function latencyBucket(ms: number): string {
  if (ms < 500) return "<500ms";
  if (ms < 1500) return "500-1500ms";
  if (ms < 4000) return "1500-4000ms";
  return ">=4000ms";
}

function scoreBand(score: number): string {
  if (score < 20) return "LOW";
  if (score < 40) return "MEDIUM";
  return "HIGH";
}

export async function POST(req: NextRequest) {
  if (requestInFlight) {
    return NextResponse.json({ error: "Another analysis request is already in progress" }, { status: 429 });
  }
  requestInFlight = true;

  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
    }

    const parsedIntent = purchaseIntentSchema.safeParse(json);
    if (!parsedIntent.success) {
      return NextResponse.json({ error: "Purchase intent did not match the sanitized schema" }, { status: 400 });
    }
    const intent = parsedIntent.data;

    await appendAuditEvent("risk.intent.received", { scenarioId: intent.scenarioId });

    // Deterministic rules run first and own the routing decision — nothing
    // below this line can change `evaluation.decision`.
    const evaluation = evaluatePurchaseIntent(intent);

    await appendAuditEvent("risk.rules.completed", {
      scenarioId: intent.scenarioId,
      decision: evaluation.decision,
      scoreBand: scoreBand(evaluation.score),
      reasonCodes: evaluation.reasonCodes,
    });

    const { explanation, diagnostics } = await generateExplanation(intent, evaluation);

    await appendAuditEvent(diagnostics.schemaValid ? "risk.openai.completed" : "risk.openai.fallback", {
      scenarioId: intent.scenarioId,
      explanationSource: explanation.source,
      modelUsed: diagnostics.modelUsed,
      latencyBucket: latencyBucket(diagnostics.latencyMs),
      responseIdSuffix: diagnostics.responseIdSuffix,
      schemaValid: diagnostics.schemaValid,
    });

    await appendAuditEvent("risk.decision.ready", {
      scenarioId: intent.scenarioId,
      decision: evaluation.decision,
      explanationSource: explanation.source,
    });

    // This endpoint never calls Prava in this phase, for either decision.
    await appendAuditEvent("risk.prava.not_created", {
      scenarioId: intent.scenarioId,
      pravaSessionCreated: false,
      paymentCredentialCreated: false,
    });

    return NextResponse.json({
      decision: evaluation.decision,
      score: evaluation.score,
      reasonCodes: evaluation.reasonCodes,
      safeToCreatePravaSession: evaluation.safeToCreatePravaSession,
      credentialCreationAllowed: evaluation.credentialCreationAllowed,
      explanation: {
        headline: explanation.headline,
        calmExplanation: explanation.calmExplanation,
        signals: explanation.signals,
        questionsToConsider: explanation.questionsToConsider,
        nextStep: explanation.nextStep,
        confidenceBand: explanation.confidenceBand,
        source: explanation.source,
      },
      proof: {
        pravaSessionCreated: false,
        paymentCredentialCreated: false,
      },
    });
  } finally {
    requestInFlight = false;
  }
}
