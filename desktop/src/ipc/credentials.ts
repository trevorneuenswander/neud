import { BrowserWindow } from "electron";
import type { CredentialStore } from "../services/credential-store";
import { assertEmail, assertEngineId, assertPassword } from "../utils/validate";
import { registerIpcHandler } from "./channels";

export function registerCredentialsIpc(credentials: CredentialStore) {
  registerIpcHandler("neud:credentials:has", (_event, engineId: unknown) => {
    return credentials.hasRunnableAuth(assertEngineId(String(engineId)));
  });

  registerIpcHandler("neud:credentials:getMeta", (_event, engineId: unknown) => {
    return credentials.getCredentialMeta(assertEngineId(String(engineId)));
  });

  registerIpcHandler("neud:credentials:get", (_event, engineId: unknown) => {
    return credentials.getCredentialsForRenderer(assertEngineId(String(engineId)));
  });

  registerIpcHandler(
    "neud:credentials:save",
    (_event, engineId: unknown, payload: unknown) => {
      const id = assertEngineId(String(engineId));
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid credentials payload.");
      }

      const record = payload as Record<string, unknown>;
      const passwordValue = String(record.password ?? "");
      if (!passwordValue.trim()) {
        throw new Error("Auction Password is required.");
      }

      credentials.saveCredentials(id, {
        email: assertEmail(String(record.email ?? "")),
        password: assertPassword(passwordValue),
      });
    },
  );

  registerIpcHandler("neud:credentials:clear", (_event, engineId: unknown) => {
    credentials.clearCredentials(assertEngineId(String(engineId)));
  });
}

export function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error("Unable to resolve sender window.");
  }

  return window;
}
