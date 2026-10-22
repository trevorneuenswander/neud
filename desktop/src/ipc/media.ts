import path from "path";
import { BrowserWindow, dialog } from "electron";
import type { DeveloperToolsService } from "../services/developer-tools-service";
import { probeMovProRes4444 } from "../media/mov-prores-probe";
import { registerIpcHandler } from "./channels";
import { getSenderWindow } from "./credentials";

export function registerMediaIpc(developerTools: DeveloperToolsService) {
  registerIpcHandler("neud:media:pickProResMov", async (event) => {
    const window = getSenderWindow(event);
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: "Choose ProRes 4444 movie",
          properties: ["openFile"],
          filters: [{ name: "QuickTime Movie", extensions: ["mov"] }],
        })
      : await dialog.showOpenDialog({
          title: "Choose ProRes 4444 movie",
          properties: ["openFile"],
          filters: [{ name: "QuickTime Movie", extensions: ["mov"] }],
        });

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, cancelled: true as const };
    }

    const sourceFilePath = result.filePaths[0];
    const originalFileName = path.basename(sourceFilePath);
    const probe = await probeMovProRes4444(sourceFilePath);
    if (!probe.ok) {
      return { ok: false as const, cancelled: false as const, error: probe.error };
    }

    return {
      ok: true as const,
      probe: {
        codecLabel: probe.profileLabel,
        width: probe.width,
        height: probe.height,
        durationSeconds: probe.durationSeconds,
        fileSizeBytes: probe.fileSizeBytes,
        originalFileName,
        sourceFilePath,
      },
    };
  });

  registerIpcHandler(
    "neud:media:createProResDisplay",
    async (
      _event,
      input: {
        projectSlug?: unknown;
        name?: unknown;
        description?: unknown;
        sourceFilePath?: unknown;
        originalFileName?: unknown;
        loopEnabled?: unknown;
      },
    ) => {
      try {
        if (
          typeof input?.projectSlug !== "string" ||
          typeof input?.name !== "string" ||
          typeof input?.sourceFilePath !== "string" ||
          typeof input?.originalFileName !== "string"
        ) {
          return { ok: false as const, error: "Invalid video display create request." };
        }
        const created = await developerTools.createProResVideoDisplay(input.projectSlug, {
          name: input.name,
          description: typeof input.description === "string" ? input.description : undefined,
          sourceFilePath: input.sourceFilePath,
          originalFileName: input.originalFileName,
          loopEnabled: input.loopEnabled === true,
        });
        return { ok: true as const, display: created.display };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Unable to create video display.",
        };
      }
    },
  );

  registerIpcHandler(
    "neud:media:recoverOrphanVideoDisplays",
    async (_event, input: { projectSlug?: unknown }) => {
      try {
        if (typeof input?.projectSlug !== "string" || !input.projectSlug.trim()) {
          return { ok: false as const, error: "projectSlug required" };
        }
        const result = developerTools.recoverOrphanVideoDisplays(input.projectSlug);
        return { ok: true as const, recovered: result.recovered };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Unable to recover orphan video displays.",
        };
      }
    },
  );
}

/** Keep BrowserWindow import used for typing consistency with other IPC modules. */
export type MediaIpcWindow = BrowserWindow;
