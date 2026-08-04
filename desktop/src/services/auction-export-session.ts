import type { BrowserSessionState } from "./engine-manager";

export type AuctionSessionState = BrowserSessionState | "unavailable";

export type ExportSessionDiagnostics = {
  projectId: string;
  engineFound: boolean;
  workerFound: boolean;
  workerRunning: boolean;
  sessionState: AuctionSessionState;
  browserConnected: boolean;
  authenticated: boolean;
  exportCommandSent: boolean;
  exportCommandAccepted: boolean;
  operationId: string | null;
};

export class ExportSessionError extends Error {
  readonly code:
    | "scraper-stopped"
    | "session-timeout"
    | "browser-disconnected"
    | "authentication-lost"
    | "worker-unavailable"
    | "worker-mismatch";

  constructor(
    code: ExportSessionError["code"],
    message: string,
    readonly diagnostics?: Partial<ExportSessionDiagnostics>,
  ) {
    super(message);
    this.name = "ExportSessionError";
    this.code = code;
  }
}

export const EXPORT_SESSION_MESSAGES = {
  scraperStopped: "Start the Webpage Scraper before downloading the Current Webpage.",
  sessionTimeout:
    "The Webpage Scraper started, but its authenticated auction session did not become ready. Check the Execution Log and try again.",
  browserDisconnected:
    "The auction browser disconnected before the download began. Restart the Webpage Scraper and try again.",
  authenticationLost:
    "The auction session is no longer authenticated. Restart the Webpage Scraper and try again.",
  workerUnavailable:
    "No active export-capable worker was found for this project.",
} as const;

export function mapExportSessionError(error: unknown): ExportSessionError {
  if (error instanceof ExportSessionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error ?? "Export failed.");

  if (/Start the Webpage Scraper before downloading/i.test(message)) {
    return new ExportSessionError("scraper-stopped", message);
  }
  if (/authenticated auction session did not become ready/i.test(message)) {
    return new ExportSessionError("session-timeout", message);
  }
  if (/browser disconnected/i.test(message)) {
    return new ExportSessionError("browser-disconnected", message);
  }
  if (/no longer authenticated/i.test(message)) {
    return new ExportSessionError("authentication-lost", message);
  }
  if (/export-capable worker/i.test(message)) {
    return new ExportSessionError("worker-mismatch", message);
  }
  if (/Start the Webpage Scraper and try again/i.test(message)) {
    return new ExportSessionError("scraper-stopped", EXPORT_SESSION_MESSAGES.scraperStopped);
  }
  if (/browser session is unavailable/i.test(message)) {
    return new ExportSessionError("worker-unavailable", EXPORT_SESSION_MESSAGES.scraperStopped);
  }

  return new ExportSessionError("worker-unavailable", message);
}

export function isAuthenticatedSessionState(state: AuctionSessionState): boolean {
  return state === "ready" || state === "authenticating";
}
