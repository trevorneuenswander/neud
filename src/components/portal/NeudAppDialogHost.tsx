"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import { forceLocalSignOut } from "@/lib/auth/force-local-sign-out";
import { getDesktopAPI } from "@/lib/desktop/client";
import {
  getOutputInterruptionPromptCopy,
  type OutputInterruptionRequestDetail,
  type OutputInterruptionResponseDetail,
} from "@/lib/output/confirm-output-interruption";
import type { ActiveOutputSession } from "@/lib/output/output-interruption-guard";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type CloseDialogState =
  | { kind: "idle" }
  | {
      kind: "app-close";
      scraperActive: boolean;
      activeOutputs: ActiveOutputSession[];
      shutdownFailed?: boolean;
    }
  | { kind: "sign-out"; reason: string }
  | ({ kind: "output-interruption" } & OutputInterruptionRequestDetail);

const OUTPUT_INTERRUPTION_REQUEST = "neud-output-interruption-request";
const OUTPUT_INTERRUPTION_RESPONSE = "neud-output-interruption-response";

function respondToOutputInterruption(requestId: string, action: "cancel" | "continue") {
  window.dispatchEvent(
    new CustomEvent<OutputInterruptionResponseDetail>(OUTPUT_INTERRUPTION_RESPONSE, {
      detail: { requestId, action },
    }),
  );
}

export function NeudAppDialogHost() {
  const [closeDialog, setCloseDialog] = useState<CloseDialogState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const respond = useCallback(async (action: "cancel" | "confirm" | "force") => {
    const api = getDesktopAPI();
    if (!api?.app?.respondCloseRequest) return;
    await api.app.respondCloseRequest(action);
  }, []);

  useEffect(() => {
    const onSignOutConfirm = (event: Event) => {
      const reason =
        event instanceof CustomEvent && typeof event.detail?.reason === "string"
          ? event.detail.reason
          : "sign-out";
      setCloseDialog({ kind: "sign-out", reason });
      setBusy(false);
    };
    window.addEventListener("neud-sign-out-confirm", onSignOutConfirm);

    const onOutputInterruption = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as OutputInterruptionRequestDetail | undefined;
      if (!detail?.requestId || !detail.reason) return;
      setCloseDialog({ kind: "output-interruption", ...detail });
      setBusy(false);
    };
    window.addEventListener(OUTPUT_INTERRUPTION_REQUEST, onOutputInterruption);

    if (!shouldUseLocalDataClient()) {
      return () => {
        window.removeEventListener("neud-sign-out-confirm", onSignOutConfirm);
        window.removeEventListener(OUTPUT_INTERRUPTION_REQUEST, onOutputInterruption);
      };
    }
    const api = getDesktopAPI();
    if (!api?.app?.onCloseRequested) {
      return () => {
        window.removeEventListener("neud-sign-out-confirm", onSignOutConfirm);
        window.removeEventListener(OUTPUT_INTERRUPTION_REQUEST, onOutputInterruption);
      };
    }

    const removeClose = api.app.onCloseRequested((payload) => {
      if (payload?.shutdownFailed) {
        setCloseDialog({
          kind: "app-close",
          scraperActive: payload.scraperActive === true,
          activeOutputs: Array.isArray(payload.activeOutputs) ? payload.activeOutputs : [],
          shutdownFailed: true,
        });
        setBusy(false);
        return;
      }
      setCloseDialog({
        kind: "app-close",
        scraperActive: payload?.scraperActive === true,
        activeOutputs: Array.isArray(payload?.activeOutputs) ? payload.activeOutputs : [],
      });
      setBusy(false);
    });
    return () => {
      window.removeEventListener("neud-sign-out-confirm", onSignOutConfirm);
      window.removeEventListener(OUTPUT_INTERRUPTION_REQUEST, onOutputInterruption);
      removeClose();
    };
  }, []);

  async function handleKeepOpen() {
    setCloseDialog({ kind: "idle" });
    await respond("cancel");
  }

  async function handleStopAndExit() {
    setBusy(true);
    await respond("confirm");
  }

  async function handleReturnToNeud() {
    setCloseDialog({ kind: "idle" });
    setBusy(false);
    await respond("cancel");
  }

  async function handleForceExit() {
    setBusy(true);
    await respond("force");
  }

  if (closeDialog.kind === "idle") {
    return null;
  }

  if (closeDialog.kind === "output-interruption") {
    const copy = getOutputInterruptionPromptCopy(closeDialog.reason, {
      activeOutputs: closeDialog.activeOutputs,
      scraperActive: closeDialog.scraperActive,
    });
    return (
      <NeudModal
        title={copy.title}
        description={copy.description}
        onClose={() => {
          respondToOutputInterruption(closeDialog.requestId, "cancel");
          setCloseDialog({ kind: "idle" });
        }}
        closeOnBackdrop={false}
        icon={
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
            !
          </div>
        }
        initialFocusRef={confirmButtonRef}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                respondToOutputInterruption(closeDialog.requestId, "cancel");
                setCloseDialog({ kind: "idle" });
              }}
            >
              {copy.cancelLabel}
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                respondToOutputInterruption(closeDialog.requestId, "continue");
                setCloseDialog({ kind: "idle" });
                setBusy(false);
              }}
            >
              {busy ? copy.busyConfirmLabel : copy.confirmLabel}
            </Button>
          </div>
        }
      />
    );
  }

  if (closeDialog.kind === "sign-out") {
    return (
      <NeudModal
        title="Scraper is running"
        description="Signing out will stop all active data engines and output windows."
        onClose={() => setCloseDialog({ kind: "idle" })}
        closeOnBackdrop={false}
        icon={
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
            !
          </div>
        }
        initialFocusRef={confirmButtonRef}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setCloseDialog({ kind: "idle" })}
            >
              Cancel
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void forceLocalSignOut(closeDialog.reason).finally(() => {
                  setBusy(false);
                  setCloseDialog({ kind: "idle" });
                });
              }}
            >
              {busy ? "Stopping Scraper…" : "Stop Scraper and Sign Out"}
            </Button>
          </div>
        }
      />
    );
  }

  if (closeDialog.kind === "app-close") {
    const hasLiveOutputs = closeDialog.activeOutputs.length > 0;
    if (hasLiveOutputs) {
      const copy = getOutputInterruptionPromptCopy("quit", {
        activeOutputs: closeDialog.activeOutputs,
        scraperActive: closeDialog.scraperActive,
      });
      return (
        <NeudModal
          title={copy.title}
          description={copy.description}
          onClose={() => void handleKeepOpen()}
          closeOnBackdrop={false}
          closeOnEscape={closeDialog.shutdownFailed !== true}
          icon={
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
              !
            </div>
          }
          initialFocusRef={confirmButtonRef}
          footer={
            <div className="space-y-4">
              {closeDialog.shutdownFailed ? (
                <Alert variant="error">
                  NEUD could not shut down cleanly. You can return to NEUD or force exit.
                </Alert>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleKeepOpen()}
                >
                  {copy.cancelLabel}
                </Button>
                <Button
                  ref={confirmButtonRef}
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void (closeDialog.shutdownFailed ? handleForceExit() : handleStopAndExit())
                  }
                >
                  {busy
                    ? copy.busyConfirmLabel
                    : closeDialog.shutdownFailed
                      ? "Force Exit"
                      : copy.confirmLabel}
                </Button>
              </div>
            </div>
          }
        />
      );
    }

    if (closeDialog.shutdownFailed) {
      return (
        <NeudModal
          title="Unable to stop scraper"
          description="NEUD could not stop the Webpage Scraper cleanly. You can return to NEUD or force exit."
          onClose={() => void handleReturnToNeud()}
          closeOnBackdrop={false}
          closeOnEscape={false}
          icon={
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger">
              !
            </div>
          }
          initialFocusRef={confirmButtonRef}
          footer={
            <div className="space-y-4">
              <Alert variant="error">
                The scraper shutdown did not finish in time. Force Exit may leave a browser process
                running.
              </Alert>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleReturnToNeud()}
                >
                  Return to NEUD
                </Button>
                <Button
                  ref={confirmButtonRef}
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void handleForceExit()}
                >
                  {busy ? "Force Exiting…" : "Force Exit"}
                </Button>
              </div>
            </div>
          }
        />
      );
    }

    if (!closeDialog.scraperActive) {
      return null;
    }

    return (
      <NeudModal
        title="Exit NEUD?"
        description="The Webpage Scraper is still running. Exiting NEUD will stop the current scraper session."
        onClose={() => void handleKeepOpen()}
        closeOnBackdrop={false}
        icon={
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
            !
          </div>
        }
        initialFocusRef={confirmButtonRef}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleKeepOpen()}>
              Keep NEUD Open
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleStopAndExit()}
            >
              {busy ? "Stopping Scraper…" : "Stop Scraper and Exit"}
            </Button>
          </div>
        }
      />
    );
  }

  return null;
}
