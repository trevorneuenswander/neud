import path from "path";
import { app } from "electron";
import { isNeudProtocolUrl } from "../integrations/zoom/zoom-deep-link";

export const NEUD_PROTOCOL_SCHEME = "neud";

type ProtocolUrlHandler = (url: string) => void | Promise<void>;

let queuedProtocolUrl: string | null = null;
let protocolHandler: ProtocolUrlHandler | null = null;
let registered = false;

export function extractNeudProtocolUrl(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === "string" && isNeudProtocolUrl(arg)) {
      return arg.trim();
    }
  }
  return null;
}

export function registerNeudProtocolClient(): void {
  if (registered) return;
  registered = true;

  if (process.defaultApp) {
    // Development: Electron binary + app path must be passed for protocol registration.
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(NEUD_PROTOCOL_SCHEME, process.execPath, [
        path.resolve(process.argv[1] ?? "."),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(NEUD_PROTOCOL_SCHEME);
  }
}

export function queueOrDeliverProtocolUrl(url: string): void {
  if (!isNeudProtocolUrl(url)) {
    console.info("[neud-protocol] ignored non-neud URL");
    return;
  }
  if (protocolHandler) {
    void Promise.resolve(protocolHandler(url)).catch((error) => {
      console.info("[neud-protocol] handler failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }
  queuedProtocolUrl = url;
  console.info("[neud-protocol] queued deep link until app ready");
}

export function setNeudProtocolHandler(handler: ProtocolUrlHandler | null): void {
  protocolHandler = handler;
  if (handler && queuedProtocolUrl) {
    const url = queuedProtocolUrl;
    queuedProtocolUrl = null;
    void Promise.resolve(handler(url)).catch(() => {});
  }
}

export function captureStartupProtocolUrlFromArgv(): void {
  const url = extractNeudProtocolUrl(process.argv);
  if (url) {
    queuedProtocolUrl = url;
  }
}
