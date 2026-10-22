import { dialog, shell } from "electron";
import type { LocalDataService } from "../services/local-data-service";
import { serializeOutputDevice, type OutputEngine } from "../output/output-engine-core";
import { broadcastToAllRenderers, registerIpcHandler } from "./channels";
import { getSenderWindow } from "./credentials";

function publishSessionChanged(engine: OutputEngine) {
  broadcastToAllRenderers("neud:output:sessionChanged", engine.getOutputTally());
}

export function registerOutputIpc(input: {
  engine: OutputEngine;
  data: LocalDataService;
}) {
  registerIpcHandler("neud:output:listDevices", () =>
    input.engine.discoverDevices().map(serializeOutputDevice),
  );
  registerIpcHandler("neud:output:decklinkAvailability", () => input.engine.decklinkAvailability());
  registerIpcHandler("neud:output:listRoutes", () => input.engine.list());
  registerIpcHandler("neud:output:nextDefaultName", () => input.engine.nextDefaultOutputName());
  registerIpcHandler("neud:output:nextDefaultRecordName", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return "Record 1";
    }
    return input.engine.nextDefaultRecordName(projectId.trim());
  });
  registerIpcHandler("neud:output:hasActiveSession", () => input.engine.hasActiveSession());
  registerIpcHandler("neud:output:getActiveOutputs", () => input.engine.getActiveOutputs());
  registerIpcHandler("neud:output:getTally", () => input.engine.getOutputTally());
  registerIpcHandler("neud:output:recordingCodecs", () => input.engine.diskRecordingCodecs());
  registerIpcHandler("neud:output:pickRecordingFolder", async (event) => {
    const window = getSenderWindow(event);
    const result = await dialog.showOpenDialog(window, {
      title: "Choose recording folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, cancelled: true as const };
    }
    return { ok: true as const, path: result.filePaths[0] };
  });
  registerIpcHandler("neud:output:openRecordingFolder", async (_event, folderPath: unknown) => {
    if (typeof folderPath !== "string" || !folderPath.trim()) {
      return { ok: false as const, error: "A folder path is required." };
    }
    const openResult = await shell.openPath(folderPath.trim());
    if (openResult) {
      return { ok: false as const, error: openResult || "Unable to open the recording folder." };
    }
    return { ok: true as const, path: folderPath.trim() };
  });
  registerIpcHandler("neud:output:stopRoutes", (_event, routeIds: unknown) => {
    if (!Array.isArray(routeIds)) {
      return { ok: false as const, error: "Route ids are required." };
    }
    input.engine.stopRoutes(routeIds.map((value) => String(value)));
    publishSessionChanged(input.engine);
    return { ok: true as const };
  });
  registerIpcHandler("neud:output:diagnostics", () => input.engine.diagnostics());
  registerIpcHandler("neud:output:catalog", () => {
    const projects = input.data.listProjects().map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
    }));
    const displays = projects.flatMap((project) => {
      const records = input.data.listProjectDisplays(project.id);
      return records.map((display) => ({
        id: display.id,
        projectId: project.id,
        name: display.name,
        slug: display.display_key,
        width: display.width ?? 1920,
        height: display.height ?? 1080,
        enabled: display.enabled,
      }));
    });
    const stacks = projects.flatMap((project) =>
      input.data.listOutputSourceStacks(project.id).map((stack) => ({
        ...stack,
        projectId: project.id,
      })),
    );
    return { projects, displays, stacks };
  });
  registerIpcHandler("neud:output:create", (_event, payload: unknown) => {
    const record = payload as Record<string, unknown>;
    const sourceType = record.sourceType === "stack" ? "stack" : "display";
    const sourceId =
      typeof record.sourceId === "string" && record.sourceId.trim()
        ? String(record.sourceId)
        : String(record.displayId ?? "");
    const recording =
      record.recording && typeof record.recording === "object"
        ? (record.recording as Record<string, unknown>)
        : undefined;
    return input.engine.create({
      name: typeof record.name === "string" ? record.name : undefined,
      projectId: String(record.projectId ?? ""),
      displayId: sourceType === "display" ? sourceId : "",
      sourceType,
      sourceId,
      deviceId: String(record.deviceId ?? ""),
      alwaysOnTop: record.alwaysOnTop !== false,
      hideCursor: record.hideCursor !== false,
      displayModeId: typeof record.displayModeId === "string" ? record.displayModeId : undefined,
      presentationMode:
        record.presentationMode === "keyFill" || record.presentationMode === "fill"
          ? record.presentationMode
          : undefined,
      keyDeviceId: typeof record.keyDeviceId === "string" ? record.keyDeviceId : undefined,
      recording: recording
        ? {
            format: typeof recording.format === "string" ? (recording.format as never) : undefined,
            destinationFolder:
              typeof recording.destinationFolder === "string"
                ? recording.destinationFolder
                : undefined,
            width: typeof recording.width === "number" ? recording.width : undefined,
            height: typeof recording.height === "number" ? recording.height : undefined,
            frameRateId:
              typeof recording.frameRateId === "string"
                ? (recording.frameRateId as never)
                : undefined,
            alphaMode:
              recording.alphaMode === "preserve" || recording.alphaMode === "flatten"
                ? recording.alphaMode
                : undefined,
            backgroundColor:
              typeof recording.backgroundColor === "string"
                ? recording.backgroundColor
                : undefined,
          }
        : undefined,
    });
  });
  registerIpcHandler("neud:output:update", (_event, payload: unknown) => {
    const record = payload as Record<string, unknown>;
    const sourceType =
      record.sourceType === "stack" || record.sourceType === "display"
        ? record.sourceType
        : undefined;
    const sourceId = typeof record.sourceId === "string" ? record.sourceId : undefined;
    const recording =
      record.recording && typeof record.recording === "object"
        ? (record.recording as Record<string, unknown>)
        : undefined;
    return input.engine.update(String(record.id ?? ""), {
      name: typeof record.name === "string" ? record.name : undefined,
      projectId: typeof record.projectId === "string" ? record.projectId : undefined,
      displayId: typeof record.displayId === "string" ? record.displayId : undefined,
      sourceType,
      sourceId,
      deviceId: typeof record.deviceId === "string" ? record.deviceId : undefined,
      alwaysOnTop: typeof record.alwaysOnTop === "boolean" ? record.alwaysOnTop : undefined,
      hideCursor: typeof record.hideCursor === "boolean" ? record.hideCursor : undefined,
      displayModeId: typeof record.displayModeId === "string" ? record.displayModeId : undefined,
      presentationMode:
        record.presentationMode === "keyFill" || record.presentationMode === "fill"
          ? record.presentationMode
          : undefined,
      keyDeviceId: typeof record.keyDeviceId === "string" ? record.keyDeviceId : undefined,
      recording: recording
        ? {
            format: typeof recording.format === "string" ? (recording.format as never) : undefined,
            destinationFolder:
              typeof recording.destinationFolder === "string"
                ? recording.destinationFolder
                : undefined,
            width: typeof recording.width === "number" ? recording.width : undefined,
            height: typeof recording.height === "number" ? recording.height : undefined,
            frameRateId:
              typeof recording.frameRateId === "string"
                ? (recording.frameRateId as never)
                : undefined,
            alphaMode:
              recording.alphaMode === "preserve" || recording.alphaMode === "flatten"
                ? recording.alphaMode
                : undefined,
            backgroundColor:
              typeof recording.backgroundColor === "string"
                ? recording.backgroundColor
                : undefined,
          }
        : undefined,
    });
  });
  registerIpcHandler("neud:output:delete", (_event, id: unknown) => {
    input.engine.delete(String(id ?? ""));
    return { ok: true };
  });
  registerIpcHandler("neud:output:start", async (_event, payload: unknown) => {
    const record = payload as { id?: string; confirmPrimary?: boolean };
    const result = await input.engine.start(String(record.id ?? ""), {
      confirmPrimary: record.confirmPrimary === true,
    });
    publishSessionChanged(input.engine);
    return result;
  });
  registerIpcHandler("neud:output:stop", (_event, id: unknown) => {
    const result = input.engine.stop(String(id ?? ""));
    publishSessionChanged(input.engine);
    return result;
  });
  registerIpcHandler("neud:output:restart", async (_event, payload: unknown) => {
    const record = payload as { id?: string; confirmPrimary?: boolean };
    const result = await input.engine.restart(String(record.id ?? ""), {
      confirmPrimary: record.confirmPrimary === true,
    });
    publishSessionChanged(input.engine);
    return result;
  });
}

export { publishSessionChanged };

