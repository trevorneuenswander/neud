import type { WebContents } from "electron";

export type OutputCleanFeedLog = (message: string, detail?: Record<string, unknown>) => void;

const BLACK_HTML =
  "<!doctype html><html><head><meta charset=\"utf-8\" /><title>NEUD Output</title>" +
  "<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>" +
  "</head><body></body></html>";

/**
 * Output / offscreen program surfaces must never show operator dialogs,
 * Chromium error chrome, or crash UI on the captured feed.
 * Errors go to logs only; prefer last good frame (caller) or black.
 */
export function attachOutputCleanFeedGuards(
  contents: WebContents,
  input: { label: string; log?: OutputCleanFeedLog } = { label: "output" },
): () => void {
  const log: OutputCleanFeedLog =
    input.log ||
    ((message, detail) => {
      console.error(`[${input.label}-clean-feed]`, message, detail ? JSON.stringify(detail) : "");
    });

  const onDialog = (
    event: Electron.Event & {
      preventDefault: () => void;
      dialogType?: string;
      messageText?: string;
      frame?: { url?: string } | null;
    },
  ) => {
    event.preventDefault();
    log("suppressed-js-dialog", {
      type: event.dialogType || "unknown",
      message: event.messageText || "",
      url: event.frame?.url || contents.getURL(),
    });
  };

  const onFailLoad = (
    _event: Electron.Event,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean,
  ) => {
    if (!isMainFrame) return;
    log("load-failed", { errorCode, errorDescription, url: validatedURL });
    if (contents.isDestroyed()) return;
    void contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BLACK_HTML)}`).catch((error) => {
      log("black-fallback-failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const onRenderGone = (
    _event: Electron.Event,
    details: { reason?: string; exitCode?: number },
  ) => {
    log("render-process-gone", {
      reason: details.reason || "unknown",
      exitCode: details.exitCode ?? null,
      url: contents.getURL(),
    });
    if (contents.isDestroyed()) return;
    void contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BLACK_HTML)}`).catch(() => {
      // Keep last good frame in the DeckLink path; black is best-effort for window hosts.
    });
  };

  const onUnresponsive = () => {
    log("renderer-unresponsive", { url: contents.getURL() });
  };

  // Electron 33: suppress alert/confirm before native MessageBox (including offscreen).
  // Typed loosely — `dialog` is present at runtime on WebContents.
  const contentsAny = contents as WebContents & {
    on(event: "dialog", listener: typeof onDialog): WebContents;
    removeListener(event: "dialog", listener: typeof onDialog): WebContents;
  };
  contentsAny.on("dialog", onDialog);
  contents.on("did-fail-load", onFailLoad);
  contents.on("render-process-gone", onRenderGone);
  contents.on("unresponsive", onUnresponsive);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));

  return () => {
    if (contents.isDestroyed()) return;
    contentsAny.removeListener("dialog", onDialog);
    contents.removeListener("did-fail-load", onFailLoad);
    contents.removeListener("render-process-gone", onRenderGone);
    contents.removeListener("unresponsive", onUnresponsive);
  };
}
