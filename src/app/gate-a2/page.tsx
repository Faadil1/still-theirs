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

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans text-sm text-black dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-bold">Still Theirs</h1>
        <p className="mb-4 inline-block rounded bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-900">
          Sandbox test — no real charge
        </p>

        <p className="mb-6 text-zinc-700 dark:text-zinc-300">
          Routine purchase scenario: a small, everyday grocery order. This screen lets you
          walk through the secure payment check yourself, at your own pace.
        </p>

        {sourceParam === "demo" && (
          <div className="mb-4 rounded border border-zinc-300 p-4 text-sm dark:border-zinc-700">
            <p className="mb-1 font-semibold">Routine groceries</p>
            <p className="mb-1 text-zinc-700 dark:text-zinc-300">Approved by the Still Theirs safety gate.</p>
            <p className="mb-1 text-zinc-700 dark:text-zinc-300">Payment credential not created yet.</p>
            <p className="text-zinc-700 dark:text-zinc-300">Verification continues on your phone.</p>
          </div>
        )}

        {sourceParam === "demo" && (
          <Link href="/demo" className="mb-4 inline-block text-xs underline underline-offset-4">
            Back to demo
          </Link>
        )}

        {mode === null && (
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => selectMode("DESKTOP_EMBEDDED")}
              className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Use this computer
            </button>
            <button
              onClick={() => selectMode("PHONE_ONLY")}
              className="rounded border border-zinc-400 px-4 py-2"
            >
              Use my phone
            </button>
          </div>
        )}

        {mode === "DESKTOP_EMBEDDED" && (
          <button
            onClick={handleStart}
            disabled={!canStart || publicState.status === "CREATING_SESSION"}
            className="mb-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {publicState.status === "CREATING_SESSION" ? "Setting up..." : "Start secure payment check"}
          </button>
        )}

        {mode === "PHONE_ONLY" && (
          <button
            onClick={handleCreatePhoneSession}
            disabled={!canStart || publicState.status === "CREATING_SESSION"}
            className="mb-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {publicState.status === "CREATING_SESSION" ? "Setting up..." : "Create secure phone session"}
          </button>
        )}

        {mode !== null && canCancel && (
          <button onClick={handleCancel} className="mb-4 ml-2 rounded border border-zinc-400 px-4 py-2">
            Cancel
          </button>
        )}

        {mode === "DESKTOP_EMBEDDED" &&
          IS_DEV_OR_SANDBOX &&
          publicState.sessionIdPresent &&
          (publicState.status === "READY_FOR_CARD" || publicState.status === "AWAITING_USER_AUTHENTICATION") &&
          !qrPanelOpen && (
            <button
              onClick={handleOpenOnPhone}
              className="mb-4 ml-2 rounded border border-zinc-400 px-4 py-2 text-xs"
            >
              Open on phone (dev only)
            </button>
          )}

        {mode !== null && (
          <p className="mb-4 rounded border border-zinc-300 p-3 dark:border-zinc-700">
            {mode === "PHONE_ONLY" && PHONE_ONLY_STATUS_MESSAGES[publicState.status]
              ? PHONE_ONLY_STATUS_MESSAGES[publicState.status]
              : STATUS_MESSAGES[publicState.status]}
            {publicState.status === "SAFE_ERROR" && publicState.pravaErrorCode && (
              <span className="mt-1 block text-xs text-zinc-500">Code: {publicState.pravaErrorCode}</span>
            )}
          </p>
        )}

        {qrPanelOpen && (
          <div className="mb-4 rounded border border-zinc-300 p-4 text-center dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {mode === "PHONE_ONLY"
                ? "Open once on your phone — do not open this session on this computer"
                : "Temporary Prava session — expires shortly"}
            </p>
            <canvas ref={qrCanvasRef} className="mx-auto" aria-label="QR code to open this Prava session on your phone" />
            <button onClick={closeQrPanel} className="mt-3 rounded border border-zinc-400 px-3 py-1 text-xs">
              Close
            </button>
          </div>
        )}

        {mode === "DESKTOP_EMBEDDED" && <div id="prava-card-form" ref={containerRef} className="min-h-[1px]" />}
      </div>
    </div>
  );
}

export default function GateA2Page() {
  return (
    <Suspense fallback={null}>
      <GateA2PageInner />
    </Suspense>
  );
}
