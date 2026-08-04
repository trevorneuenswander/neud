import type { EngineManager } from "../services/engine-manager";
import { assertEngineId, isValidUuid } from "../utils/validate";
import { getSenderWindow } from "./credentials";
import { registerIpcHandler } from "./channels";

type ControlPayload = {
  engineId: string;
  requestedBy?: string | null;
};

function parseControlPayload(payload: unknown): ControlPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid control payload.");
  }

  const record = payload as Record<string, unknown>;
  const engineId = assertEngineId(String(record.engineId ?? ""));
  const requestedBy =
    typeof record.requestedBy === "string" && isValidUuid(record.requestedBy)
      ? record.requestedBy
      : null;

  return { engineId, requestedBy };
}

export function registerEnginesIpc(engineManager: EngineManager) {
  registerIpcHandler("neud:engines:getLocalStatus", (_event, engineId: unknown) => {
    return engineManager.getLocalStatus(assertEngineId(String(engineId)));
  });

  registerIpcHandler("neud:engines:start", (_event, payload: unknown) => {
    const { engineId, requestedBy } = parseControlPayload(payload);
    return engineManager.start(engineId, requestedBy);
  });

  registerIpcHandler("neud:engines:stop", (_event, payload: unknown) => {
    const { engineId, requestedBy } = parseControlPayload(payload);
    return engineManager.stop(engineId, requestedBy);
  });

  registerIpcHandler("neud:engines:restart", (_event, payload: unknown) => {
    const { engineId, requestedBy } = parseControlPayload(payload);
    return engineManager.restart(engineId, requestedBy);
  });

  registerIpcHandler("neud:engines:runOnce", (_event, payload: unknown) => {
    const { engineId, requestedBy } = parseControlPayload(payload);
    return engineManager.runOnce(engineId, requestedBy);
  });

  registerIpcHandler("neud:engines:subscribeLogs", (event, engineId: unknown) => {
    engineManager.subscribeLogs(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:unsubscribeLogs", (event, engineId: unknown) => {
    engineManager.unsubscribeLogs(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:subscribeExecutionLogs", (event, engineId: unknown) => {
    engineManager.subscribeExecutionLogs(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:unsubscribeExecutionLogs", (event, engineId: unknown) => {
    engineManager.unsubscribeExecutionLogs(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:clearSessionLogs", (_event, engineId: unknown) => {
    engineManager.clearSessionLogs(assertEngineId(String(engineId)));
    return { ok: true };
  });

  registerIpcHandler("neud:engines:subscribeEngineStatus", (event, engineId: unknown) => {
    engineManager.subscribeEngineStatus(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:unsubscribeEngineStatus", (event, engineId: unknown) => {
    engineManager.unsubscribeEngineStatus(
      getSenderWindow(event),
      assertEngineId(String(engineId)),
    );
  });

  registerIpcHandler("neud:engines:getBrowserSessionState", (_event, engineId: unknown) => {
    return engineManager.getBrowserSessionState(assertEngineId(String(engineId)));
  });
}
