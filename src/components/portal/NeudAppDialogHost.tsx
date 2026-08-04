"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import { getDesktopAPI } from "@/lib/desktop/client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type CloseDialogState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "shutdown-failed" };

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
    if (!shouldUseLocalDataClient()) return;
    const api = getDesktopAPI();
    if (!api?.app?.onCloseRequested) return;

    return api.app.onCloseRequested((payload) => {
      if (payload?.shutdownFailed) {
        setCloseDialog({ kind: "shutdown-failed" });
        setBusy(false);
        return;
      }
      setCloseDialog({ kind: "confirm" });
      setBusy(false);
    });
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

  if (closeDialog.kind === "shutdown-failed") {
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
