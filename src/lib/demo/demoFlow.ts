import type { DemoScenarioId } from "@/lib/risk/scenarios";

export type DemoView =
  | "SELECT"
  | "ANALYZING"
  | "DECISION"
  | "PRAVA_PENDING"
  | "TRUSTED_REVIEW"
  | "TRUSTED_RESPONSE"
  | "TRUSTED_RETURN";

export interface AnalyzeResultShape {
  decision: "APPROVE" | "REQUEST_TRUSTED_CONTACT";
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
  proof: { pravaSessionCreated: boolean; paymentCredentialCreated: boolean };
}

export type TrustedContactChoice = "CONSISTENT" | "RECOMMEND_PAUSE";

export interface DemoFlowState {
  view: DemoView;
  selectedScenario: DemoScenarioId | null;
  analyzing: boolean;
  result: AnalyzeResultShape | null;
  error: string | null;
  trustedContactChoice: TrustedContactChoice | null;
}

/**
 * Pure, framework-agnostic controller for the unified Hero Demo flow.
 * Never calls fetch itself — the UI layer performs the single
 * POST /api/risk/analyze request and reports the outcome back in via
 * completeAnalysis()/failAnalysis(). This controller has no knowledge of
 * the payment provider at all: no method here creates a session, calls a
 * payment endpoint, or initializes any embedded card-collection SDK —
 * that boundary is structural, not just a convention.
 */
export class DemoFlowController {
  private view: DemoView = "SELECT";
  private selectedScenario: DemoScenarioId | null = null;
  private analyzing = false;
  private result: AnalyzeResultShape | null = null;
  private error: string | null = null;
  private trustedContactChoice: TrustedContactChoice | null = null;

  getState(): DemoFlowState {
    return {
      view: this.view,
      selectedScenario: this.selectedScenario,
      analyzing: this.analyzing,
      result: this.result,
      error: this.error,
      trustedContactChoice: this.trustedContactChoice,
    };
  }

  selectScenario(id: DemoScenarioId): void {
    if (this.analyzing) return;
    this.selectedScenario = id;
    this.view = "SELECT";
    this.result = null;
    this.error = null;
    this.trustedContactChoice = null;
  }

  /** Guards against duplicate submissions — at most one analysis request may be in flight. */
  canSubmit(): boolean {
    return Boolean(this.selectedScenario) && !this.analyzing;
  }

  /** Returns false (and does nothing) if a request is already in flight or nothing is selected. */
  beginAnalysis(): boolean {
    if (!this.canSubmit()) return false;
    this.analyzing = true;
    this.view = "ANALYZING";
    this.error = null;
    return true;
  }

  completeAnalysis(result: AnalyzeResultShape): void {
    this.analyzing = false;
    this.result = result;
    this.view = "DECISION";
  }

  failAnalysis(message: string): void {
    this.analyzing = false;
    this.error = message;
    this.view = "SELECT";
  }

  /** Routine (APPROVE) path only. Purely informational — never creates a Prava session. */
  continueToPravaPending(): void {
    if (this.result?.decision !== "APPROVE") return;
    this.view = "PRAVA_PENDING";
  }

  /** Risky (REQUEST_TRUSTED_CONTACT) path only. */
  askTrustedContact(): void {
    if (this.result?.decision !== "REQUEST_TRUSTED_CONTACT") return;
    this.view = "TRUSTED_REVIEW";
  }

  proceedToTrustedResponse(): void {
    if (this.view !== "TRUSTED_REVIEW") return;
    this.view = "TRUSTED_RESPONSE";
  }

  /**
   * The trusted contact can only leave a recommendation. This method has
   * no way to alter `result.decision`, `result.proof`, or create a
   * credential/session — it only records a label for display.
   */
  recordTrustedContactChoice(choice: TrustedContactChoice): void {
    if (this.view !== "TRUSTED_RESPONSE") return;
    this.trustedContactChoice = choice;
    this.view = "TRUSTED_RETURN";
  }

  reset(): void {
    this.view = "SELECT";
    this.selectedScenario = null;
    this.analyzing = false;
    this.result = null;
    this.error = null;
    this.trustedContactChoice = null;
  }
}
