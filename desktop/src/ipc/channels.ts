import { ipcMain, BrowserWindow, type IpcMainInvokeEvent, type WebContents } from "electron";

const NEUD_PREFIX = "neud:";

export function toNeudChannel(channel: string): string {
  return channel.startsWith(NEUD_PREFIX) ? channel : `${NEUD_PREFIX}${channel}`;
}

type IpcHandler = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => unknown | Promise<unknown>;

export function registerIpcHandler(channel: string, handler: IpcHandler): void {
  ipcMain.handle(toNeudChannel(channel), handler);
}

export function broadcastToAllRenderers(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      sendToRenderer(window, channel, ...args);
    }
  }
}

export function sendToRenderer(
  target: WebContents | BrowserWindow,
  channel: string,
  ...args: unknown[]
): void {
  const webContents = "webContents" in target ? target.webContents : target;
  webContents.send(toNeudChannel(channel), ...args);
}
