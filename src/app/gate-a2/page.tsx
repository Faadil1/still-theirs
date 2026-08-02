"use client";

import { useEffect, useRef, useState } from "react";
import { PravaSDK } from "@prava-sdk/core";
import QRCode from "qrcode";
import { GateA2Controller, type GateA2PublicState } from "@/lib/gateA2/sessionManager";
import { SdkInitGuard } from "@/lib/gateA2/sdkGuard";
import { getClientEnv } from "@/lib/env";
import { shouldAutoHideQr } from "@/lib/gateA2/qrPanel";

// Development/sandbox-only helper: transfers the transient iframe URL to a
// phone via a client-generated QR code. Never rendered in production.
const IS_DEV_OR_SANDBOX = process.env.NODE_ENV !== "production";

const STATUS_MESSAGES: Record<GateA2PublicState["status"], string> = {
  IDLE: "Ready when you are.",
  CREATING_SESSION: "Setting up a secure sandbox session...",
  READY_FOR_CARD: "Enter your sandbox test card details below.",
  AWAITING_USER_AUTHENTICATION: "Please complete the verification prompt to continue.",
  COMPLETED: "Card verification completed.",
  CANCELLED: "Cancelled. Nothing was charged.",
  SAFE_ERROR: "Something didn't go through. You can try again.",
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

export default function GateA2Page() {
  const [controller] = useState(() => new GateA2Controller());
  const [sdkGuard] = useState(() => new SdkInitGuard());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedForSessionRef = useRef<string | null>(null);

  const [publicState, setPublicState] = useState<GateA2PublicState>(() => controller.getPublicState());

  // QR phone-transfer panel state. The iframe URL itself is never stored in
  // React state — it is read directly from controller.getSessionForSdk()
  // only at the moment the QR is drawn, and never rendered as text.
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrPanelOpen, setQrPanelOpen] = useState(false);
  const qrOpenedAtRef = useRef<number | null>(null);

  function sync() {
    setPublicState(controller.getPublicState());
  }

  async function handleStart() {
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
    }
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
    void postGateA2Event("gateA2.flow.cancelled", { cancelled: true });
  }

  // Mount the embedded card-collection UI exactly once per fresh session.
  useEffect(() => {
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
  }, [publicState.status, publicState.sessionIdSuffix, publicState.orderIdSuffix]);

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

        <button
          onClick={handleStart}
          disabled={!canStart || publicState.status === "CREATING_SESSION"}
          className="mb-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {publicState.status === "CREATING_SESSION" ? "Setting up..." : "Start secure payment check"}
        </button>

        {canCancel && (
          <button onClick={handleCancel} className="mb-4 ml-2 rounded border border-zinc-400 px-4 py-2">
            Cancel
          </button>
        )}

        {IS_DEV_OR_SANDBOX &&
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

        <p className="mb-4 rounded border border-zinc-300 p-3 dark:border-zinc-700">
          {STATUS_MESSAGES[publicState.status]}
          {publicState.status === "SAFE_ERROR" && publicState.pravaErrorCode && (
            <span className="mt-1 block text-xs text-zinc-500">Code: {publicState.pravaErrorCode}</span>
          )}
        </p>

        {qrPanelOpen && (
          <div className="mb-4 rounded border border-zinc-300 p-4 text-center dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Temporary Prava session — expires shortly
            </p>
            <canvas ref={qrCanvasRef} className="mx-auto" aria-label="QR code to open this Prava session on your phone" />
            <button onClick={closeQrPanel} className="mt-3 rounded border border-zinc-400 px-3 py-1 text-xs">
              Close
            </button>
          </div>
        )}

        <div id="prava-card-form" ref={containerRef} className="min-h-[1px]" />
      </div>
    </div>
  );
}
