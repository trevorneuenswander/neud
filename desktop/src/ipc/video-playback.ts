import type { VideoPlaybackService } from "../media/video/video-playback-service";
import type { DeveloperToolsService } from "../services/developer-tools-service";
import { registerIpcHandler } from "./channels";

export function registerVideoPlaybackIpc(
  playback: VideoPlaybackService,
  developerTools?: DeveloperToolsService | null,
) {
  registerIpcHandler("neud:video:platform", async () => playback.platform());

  registerIpcHandler("neud:video:getStatus", async (_event, displayId: unknown) => {
    if (typeof displayId !== "string" || !displayId.trim()) {
      return { ok: false as const, error: "displayId required" };
    }
    const session = playback.getSession(displayId);
    if (session) return { ok: true as const, session };
    try {
      const opened = await playback.ensureOpen(displayId);
      return { ok: true as const, session: opened };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to open video session.",
      };
    }
  });

  for (const action of ["play", "pause", "stop", "restart"] as const) {
    registerIpcHandler(`neud:video:${action}`, async (_event, displayId: unknown) => {
      if (typeof displayId !== "string" || !displayId.trim()) {
        return { ok: false as const, error: "displayId required" };
      }
      try {
        const session = await playback[action](displayId);
        return { ok: true as const, session };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : `Unable to ${action} video.`,
        };
      }
    });
  }

  registerIpcHandler(
    "neud:video:setLoop",
    async (_event, input: { displayId?: unknown; enabled?: unknown }) => {
      if (typeof input?.displayId !== "string" || !input.displayId.trim()) {
        return { ok: false as const, error: "displayId required" };
      }
      try {
        const enabled = input.enabled === true;
        const session = await playback.setLoop(input.displayId, enabled);
        try {
          developerTools?.setVideoDisplayLoop(input.displayId, enabled);
        } catch {
          // Media-store loop already updated; display settings sync is best-effort.
        }
        return { ok: true as const, session };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Unable to update loop.",
        };
      }
    },
  );

  registerIpcHandler("neud:video:thumbnail", async (_event, displayId: unknown) => {
    if (typeof displayId !== "string" || !displayId.trim()) {
      return { ok: false as const, error: "displayId required" };
    }
    try {
      await playback.ensureOpen(displayId);
      const frame = playback.getLatestFrame(displayId);
      if (!frame) return { ok: false as const, error: "No frame available." };
      return {
        ok: true as const,
        frame: {
          width: frame.width,
          height: frame.height,
          stride: frame.stride,
          ptsUs: frame.ptsUs,
          bgraBase64: frame.bgra.toString("base64"),
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to load thumbnail.",
      };
    }
  });
}
