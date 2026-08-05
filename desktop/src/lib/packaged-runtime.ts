import path from "path";
import { app } from "electron";

export function isPackagedDesktopRuntime(): boolean {
  if (app?.isPackaged === true) {
    return true;
  }

  return path.basename(process.execPath).toLowerCase() === "neud.exe";
}
