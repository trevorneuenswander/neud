import { registerIpcHandler } from "./channels";
import {
  checkForUpdates,
  getUpdateStatus,
  installDownloadedUpdate,
} from "../services/auto-update-service";

export function registerUpdateIpc(): void {
  registerIpcHandler("neud:updates:getStatus", () => getUpdateStatus());

  registerIpcHandler("neud:updates:check", async (_event, reason: unknown) => {
    const normalizedReason =
      reason === "startup" || reason === "manual" || reason === "menu"
        ? reason
        : "manual";
    return checkForUpdates(normalizedReason);
  });

  registerIpcHandler("neud:updates:install", () => installDownloadedUpdate());
}
