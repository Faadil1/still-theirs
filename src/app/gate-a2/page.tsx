"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PravaSDK } from "@prava-sdk/core";
import QRCode from "qrcode";
import { GateA2Controller, type GateA2PublicState } from "@/lib/gateA2/sessionManager";
import { SdkInitGuard } from "@/lib/gateA2/sdkGuard";
import { getClientEnv } from "@/lib/env";
import { shouldAutoHideQr } from "@/lib/gateA2/qrPanel";
import { ROUTINE_GROCERIES_INTENT } from "@/lib/risk/scenarios";
import { ProductShell, ProductBrand, StatusBadge, SurfaceCard, PrimaryAction, SecondaryAction } from "@/components/ui";

// This gate is fixed to the routine-groceries scenario — the same values
// already sent in the Prava session request (src/lib/prava/server.ts) are
// reused here for display, rather than duplicating the merchant/amount as
// separate literals.
function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// Only the literal values below are ever honored from the URL. Anything
// else (including no param at all) is treated as absent — this is the only
// place query-string input from /demo influences this page's behavior.
function sanitizeModeParam(raw: string | null): "phone" | null {
  return raw === "phone" ? "phone" : null;
}

function sanitizeSourceParam(raw: string | null): "demo" | null {
  return raw === "demo" ? "demo" : null;
}

// Development/sandbox-only helper: transfers the transient iframe URL to a
// phone via a client-generated QR code. Never rendered in production.
const IS_DEV_OR_SANDBOX = process.env.NODE_ENV !== "production";

type GateA2Mode = "DESKTOP_EMBEDDED" | "PHONE_ONLY";

const STATUS_MESSAGES: Record<GateA2PublicState["status"], string> = {
  IDLE: "Ready when you are.",
  CREATING_SESSION: "Setting up a secure sandbox session...",
  READY_FOR_CARD: "Enter your sandbox test card details below.",
  AWAITING_USER_AUTHENTICATION: "Please complete the verification prompt to continue.",
  COMPLETED: "Card verification completed.",
  CANCELLED: "Cancelled. Nothing was charged.",
  SAFE_ERROR: "Something didn't go through. You can try again.",
};

// PHONE_ONLY mode never mounts collectPAN, so it needs its own status
// copy — the desktop card-entry messages above don't apply.
const PHONE_ONLY_STATUS_MESSAGES: Partial<Record<GateA2PublicState["status"], string>> = {
  READY_FOR_CARD: "Complete the verification on your phone. Confirm the result using the Prava screen or dashboard.",
  AWAITING_USER_AUTHENTICATION:
    "Complete the verification on your phone. Confirm the result using the Prava screen or dashboard.",
};

async function postGateA2Event(event: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await fetch("/api/prava/gate-a2-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...detail }),
    });
  } catch {
    // Audit logging is best-effort; never block or surface this to the user.
  }
}

function GateA2PageInner() {
  const searchParams = useSearchParams();
  // Read once, at mount, from the current URL only — never re-derived from
  // any Prava/session state, and never anything beyond these two flags.
  const [initialModeParam] = useState(() => sanitizeModeParam(searchParams.get("mode")));
  const [sourceParam] = useState(() => sanitizeSourceParam(searchParams.get("source")));

  const [controller] = useState(() => new GateA2Controller());
  const [sdkGuard] = useState(() => new SdkInitGuard());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedForSessionRef = useRef<string | null>(null);

  const [publicState, setPublicState] = useState<GateA2PublicState>(() => controller.getPublicState());
  // Preselecting a mode from the URL only ever sets local component state —
  // it never creates a session. Session creation still requires the
  // explicit "Create secure phone session" click below.
  const [mode, setMode] = useState<GateA2Mode | null>(() => (initialModeParam === "phone" ? "PHONE_ONLY" : null));

  // QR phone-transfer panel state. The iframe URL itself is never stored in
  // React state — it is read directly from controller.getSessionForSdk()
  // only at the moment the QR is drawn, and never rendered as text.
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrPanelOpen, setQrPanelOpen] = useState(false);
  const qrOpenedAtRef = useRef<number | null>(null);

  function sync() {
    setPublicState(controller.getPublicState());
  }

  function selectMode(m: GateA2Mode) {
    // Mode may only be chosen before any session exists.
    if (publicState.status !== "IDLE" && publicState.status !== "CANCELLED" && publicState.status !== "SAFE_ERROR" && publicState.status !== "COMPLETED") return;
    setMode(m);
  }

  async function createSession(): Promise<boolean> {
    await controller.startSession(async () => {
      const res = await fetch("/api/prava/session", { method: "POST" });
      return { ok: res.ok, status: res.status, json: () => res.json() };
    });
    sync();

    const state = controller.getPublicState();
    if (state.status === "READY_FOR_CARD") {
      await postGateA2Event("gateA2.session.created", {
        sessionIdPresent: state.sessionIdPresent,
        sessionIdSuffix: state.sessionIdSuffix,
        orderIdPresent: state.orderIdPresent,
        orderIdSuffix: state.orderIdSuffix,
      });
      return true;
    }
    return false;
  }

  // DESKTOP_EMBEDDED: create the session; the mount effect below picks it up.
  async function handleStart() {
    await createSession();
  }

  // PHONE_ONLY: create the session, then immediately display the QR.
  // This path never touches PravaSDK/collectPAN and never mounts anything —
  // the iframe URL's only use here is as QR-encoder input.
  async function handleCreatePhoneSession() {
    const ready = await createSession();
    if (!ready) return;
    const sessionForSdk = controller.getSessionForSdk();
    if (!sessionForSdk) return;
    qrOpenedAtRef.current = Date.now();
    setQrPanelOpen(true);
  }

  function closeQrPanel() {
    setQrPanelOpen(false);
    qrOpenedAtRef.current = null;
  }

  function handleOpenOnPhone() {
    if (!IS_DEV_OR_SANDBOX) return;
    const sessionForSdk = controller.getSessionForSdk();
    if (!sessionForSdk) return;
    qrOpenedAtRef.current = Date.now();
    setQrPanelOpen(true);
  }

  function handleCancel() {
    sdkGuard.destroy();
    mountedForSessionRef.current = null;
    if (containerRef.current) containerRef.current.innerHTML = "";
    closeQrPanel();
    controller.cancel();
    sync();
    setMode(null);
    void postGateA2Event("gateA2.flow.cancelled", { cancelled: true });
  }

  // Mount the embedded card-collection UI exactly once per fresh session.
  // PHONE_ONLY mode never reaches this: it must never initialize PravaSDK,
  // call collectPAN, or mount an iframe on the desktop.
  useEffect(() => {
    if (mode !== "DESKTOP_EMBEDDED") return;
    if (publicState.status !== "READY_FOR_CARD") return;
    if (!containerRef.current) return;

    const sessionKey = `${publicState.sessionIdSuffix ?? ""}:${publicState.orderIdSuffix ?? ""}`;
    if (mountedForSessionRef.current === sessionKey) return;
    mountedForSessionRef.current = sessionKey;

    const sessionForSdk = controller.getSessionForSdk();
    if (!sessionForSdk) return;

    let publishableKey: string;
    try {
      publishableKey = getClientEnv().NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY;
    } catch {
      controller.fail({ code: "PUBLISHABLE_KEY_MISSING" });
      queueMicrotask(sync);
      return;
    }

    let sdk;
    try {
      sdk = sdkGuard.getOrCreate(() => new PravaSDK({ publishableKey }));
    } catch (initError) {
      controller.fail(initError, "sdkInit");
      queueMicrotask(sync);
      void postErrorDiagnostics();
      return;
    }
    if (sdkGuard.timesInitialized === 1) {
      void postGateA2Event("gateA2.sdk.initialized", { sdkInitialized: true });
    }

    void postGateA2Event("gateA2.collection.opened", { collectionOpened: true });

    function postErrorDiagnostics() {
      const state = controller.getPublicState();
      return postGateA2Event("gateA2.flow.error", {
        errorCategory: state.errorCategory,
        stage: state.stage,
        pravaErrorCode: state.pravaErrorCode,
        sanitizedMessageCategory: state.sanitizedMessageCategory,
        passkeyPromptObserved: state.passkeyPromptObserved,
        onErrorObserved: state.onErrorObserved,
        onDismissObserved: state.onDismissObserved,
        promiseRejected: state.promiseRejected,
        responseIdSuffix: state.responseIdSuffix,
      });
    }

    sdk
      .collectPAN({
        sessionToken: sessionForSdk.sessionToken,
        iframeUrl: sessionForSdk.iframeUrl,
        container: containerRef.current,
        onReady: () => {
          controller.markIframeReady();
          sync();
          void postGateA2Event("gateA2.authentication.requested", { authenticationRequested: true });
        },
        onChange: (state) => {
          if (state.isComplete) {
            controller.markCardValidationComplete();
            sync();
          }
        },
        onSuccess: () => {
          controller.complete();
          sync();
          void postGateA2Event("gateA2.flow.completed", { flowCompleted: true });
        },
        onError: (error) => {
          controller.fail(error, "onError");
          sync();
          void postErrorDiagnostics();
        },
        onDismiss: (payload) => {
          controller.dismiss(payload?.reason);
          sync();
          const state = controller.getPublicState();
          void postGateA2Event("gateA2.flow.cancelled", {
            cancelled: true,
            sanitizedMessageCategory: state.sanitizedMessageCategory,
          });
        },
      })
      .catch((error: unknown) => {
        controller.fail(error, "promiseRejection");
        sync();
        void postErrorDiagnostics();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, publicState.status, publicState.sessionIdSuffix, publicState.orderIdSuffix]);

  // Cleanup on unmount only.
  useEffect(() => {
    return () => {
      sdkGuard.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draws the QR code directly into the canvas when the panel opens. The
  // iframe URL is read fresh from the controller here and never stored in
  // React state, logged, or rendered as text.
  useEffect(() => {
    if (!qrPanelOpen) return;
    const sessionForSdk = controller.getSessionForSdk();
    if (!sessionForSdk || !qrCanvasRef.current) {
      closeQrPanel();
      return;
    }
    QRCode.toCanvas(qrCanvasRef.current, sessionForSdk.iframeUrl, { width: 220, margin: 1 }).catch(() => {
      closeQrPanel();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrPanelOpen]);

  // Auto-hides the QR after 60 seconds or as soon as the session's
  // expires_at passes, whichever comes first.
  useEffect(() => {
    if (!qrPanelOpen) return;
    const interval = setInterval(() => {
      if (shouldAutoHideQr(qrOpenedAtRef.current, publicState.expiresAt, Date.now())) {
        closeQrPanel();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [qrPanelOpen, publicState.expiresAt]);

  // Hides the QR whenever the session is no longer active — covers reset,
  // cancel, completion, and error paths generically. Deferred to a
  // microtask since this effect only reacts to state that already changed.
  useEffect(() => {
    if (publicState.status !== "READY_FOR_CARD" && publicState.status !== "AWAITING_USER_AUTHENTICATION") {
      queueMicrotask(closeQrPanel);
    }
  }, [publicState.status]);

  const canStart = publicState.status === "IDLE" || publicState.status === "CANCELLED" || publicState.status === "SAFE_ERROR" || publicState.status === "COMPLETED";
  const canCancel = publicState.status === "CREATING_SESSION" || publicState.status === "READY_FOR_CARD" || publicState.status === "AWAITING_USER_AUTHENTICATION";

  // Quiet step indicator only — never marks a step complete ahead of the
  // actual controller/session state. IDLE/CANCELLED/SAFE_ERROR never count
  // as "session created", even though SAFE_ERROR can occur before a
  // session ever existed — status alone (not a broad "not IDLE" check) is
  // the only truthful source here.
  const step2Active = publicState.status === "CREATING_SESSION";
  const step2Complete =
    publicState.status === "READY_FOR_CARD" ||
    publicState.status === "AWAITING_USER_AUTHENTICATION" ||
    publicState.status === "COMPLETED";
  const step3Active = publicState.status === "READY_FOR_CARD" || publicState.status === "AWAITING_USER_AUTHENTICATION";
  const step3Complete = publicState.status === "COMPLETED";

  return (
    <ProductShell>
      <header className="mb-8">
        <ProductBrand />
        <div className="mb-3">
          <StatusBadge tone="neutral">Prava sandbox · no real charge</StatusBadge>
        </div>
        <h1 className="mb-2 font-serif text-2xl text-[var(--st-text)] sm:text-3xl">Create the scoped payment credential</h1>
        <p className="font-sans text-sm text-[var(--st-text-secondary)]">
          The purchase intent is approved. You remain in control of whether the Prava session is created.
        </p>
      </header>

      <ol className="mb-6 flex flex-col gap-1.5 font-sans text-xs text-[var(--st-text-muted)] sm:flex-row sm:gap-6">
        <li className="text-[var(--st-safe)]">{"✓"} Purchase approved</li>
        <li className={step2Complete ? "text-[var(--st-safe)]" : step2Active ? "text-[var(--st-text)]" : ""}>
          {step2Complete ? "✓" : "2."} Create Prava session
        </li>
        <li className={step3Complete ? "text-[var(--st-safe)]" : step3Active ? "text-[var(--st-text)]" : ""}>
          {step3Complete ? "✓" : "3."} Complete sandbox verification
        </li>
      </ol>

      {sourceParam === "demo" && (
        <SurfaceCard emphasis className="mb-6">
          <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-[var(--st-text-muted)]">
            Approved payment instruction
          </p>
          <p className="mb-3 font-serif text-lg text-[var(--st-text)]">Routine digital purchase</p>
          <dl className="mb-3 space-y-1.5 font-sans text-sm text-[var(--st-text-secondary)]">
            <div className="flex justify-between">
              <dt>Merchant</dt>
              <dd className="font-medium text-[var(--st-text)]">{ROUTINE_GROCERIES_INTENT.merchantLabel}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Maximum amount</dt>
              <dd className="font-medium text-[var(--st-text)]">
                {formatAmount(ROUTINE_GROCERIES_INTENT.amountCents, ROUTINE_GROCERIES_INTENT.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Purpose</dt>
              <dd className="font-medium text-[var(--st-text)]">Digital cookbook</dd>
            </div>
            <div className="flex justify-between">
              <dt>Credential scope</dt>
              <dd className="font-medium text-[var(--st-text)]">One purchase only</dd>
            </div>
          </dl>
          <p className="mb-1 font-sans text-sm text-[var(--st-text-secondary)]">Still Theirs approved the purchase intent.</p>
          <p className="mb-3 font-sans text-sm text-[var(--st-text-secondary)]">No Prava session exists until you create it below.</p>
          <p className="font-sans text-xs text-[var(--st-text-muted)]">
            Visa Intelligent Commerce-enabled through Prava.
            <br />
            Sandbox only — no real charge.
          </p>
        </SurfaceCard>
      )}

      {sourceParam === "demo" && (
        <Link href="/demo" className="mb-6 inline-block font-sans text-xs text-[var(--st-text-secondary)] underline underline-offset-4">
          Back to demo
        </Link>
      )}

      <SurfaceCard>
        {mode === null && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => selectMode("PHONE_ONLY")}
              className="min-h-[44px] rounded-2xl border border-[var(--st-text)] bg-[var(--st-surface)] p-4 text-left font-sans transition duration-200 hover:shadow-[0_2px_14px_rgba(28,26,23,0.07)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-text-muted)]"
            >
              <div className="mb-1 text-sm font-semibold text-[var(--st-text)]">Use my phone</div>
              <div className="text-xs text-[var(--st-text-muted)]">Recommended for the demo</div>
            </button>
            <button
              onClick={() => selectMode("DESKTOP_EMBEDDED")}
              className="min-h-[44px] rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] p-4 text-left font-sans transition duration-200 hover:border-[var(--st-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-text-muted)]"
            >
              <div className="mb-1 text-sm font-semibold text-[var(--st-text)]">Use this computer</div>
              <div className="text-xs text-[var(--st-text-muted)]">Embedded sandbox verification</div>
            </button>
          </div>
        )}

        {mode === "DESKTOP_EMBEDDED" && (
          <PrimaryAction
            onClick={handleStart}
            disabled={!canStart || publicState.status === "CREATING_SESSION"}
            className="w-full sm:w-auto"
          >
            {publicState.status === "CREATING_SESSION" ? "Setting up..." : "Start secure payment check"}
          </PrimaryAction>
        )}

        {mode === "PHONE_ONLY" && (
          <PrimaryAction
            onClick={handleCreatePhoneSession}
            disabled={!canStart || publicState.status === "CREATING_SESSION"}
            className="w-full sm:w-auto"
          >
            {publicState.status === "CREATING_SESSION" ? "Setting up..." : "Create secure phone session"}
          </PrimaryAction>
        )}

        {mode !== null && canCancel && (
          <SecondaryAction onClick={handleCancel} className="ml-0 mt-3 sm:ml-2 sm:mt-0">
            Cancel
          </SecondaryAction>
        )}

        {mode === "DESKTOP_EMBEDDED" &&
          IS_DEV_OR_SANDBOX &&
          publicState.sessionIdPresent &&
          (publicState.status === "READY_FOR_CARD" || publicState.status === "AWAITING_USER_AUTHENTICATION") &&
          !qrPanelOpen && (
            <button
              onClick={handleOpenOnPhone}
              className="ml-0 mt-3 rounded-full border border-[var(--st-border)] px-4 py-2 font-sans text-xs text-[var(--st-text-secondary)] sm:ml-2 sm:mt-0"
            >
              Open on phone (dev only)
            </button>
          )}

        {mode !== null && (
          <p className="mt-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg)] p-3 font-sans text-sm text-[var(--st-text-secondary)]">
            {mode === "PHONE_ONLY" && PHONE_ONLY_STATUS_MESSAGES[publicState.status]
              ? PHONE_ONLY_STATUS_MESSAGES[publicState.status]
              : STATUS_MESSAGES[publicState.status]}
            {publicState.status === "SAFE_ERROR" && publicState.pravaErrorCode && (
              <span className="mt-1 block text-xs text-[var(--st-text-muted)]">Code: {publicState.pravaErrorCode}</span>
            )}
          </p>
        )}

        {qrPanelOpen && (
          <div className="mt-4 rounded-xl border border-[var(--st-border)] p-4 text-center">
            <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-[var(--st-text-muted)]">
              {mode === "PHONE_ONLY"
                ? "Open once on your phone — do not open this session on this computer"
                : "Temporary Prava session — expires shortly"}
            </p>
            <canvas ref={qrCanvasRef} className="mx-auto" aria-label="QR code to open this Prava session on your phone" />
            <button onClick={closeQrPanel} className="mt-3 rounded-full border border-[var(--st-border)] px-3 py-1 font-sans text-xs text-[var(--st-text-secondary)]">
              Close
            </button>
          </div>
        )}

        {mode === "DESKTOP_EMBEDDED" && <div id="prava-card-form" ref={containerRef} className="mt-4 min-h-[1px]" />}
      </SurfaceCard>
    </ProductShell>
  );
}

export default function GateA2Page() {
  return (
    <Suspense fallback={null}>
      <GateA2PageInner />
    </Suspense>
  );
}
