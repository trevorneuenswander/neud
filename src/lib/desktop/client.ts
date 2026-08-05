import type {
  DesktopCredentialsInput,
  EngineControlResult,
  EngineLogEntry,
  EngineStatusSnapshot,
  EngineStatusSnapshotEvent,
  ExecutionLogEntryEvent,
  ExecutionLogSnapshotEvent,
  NeudDesktopAPI,
  LocalEngineStatus,
  SessionExecutionLogEntry,
} from "@/lib/desktop/types";
import type { DataEngine } from "@/lib/data-engines/types";
import type { EngineCommand } from "@/lib/data-engines/constants";

export function isDesktopEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const desktop = window.neudDesktop;
    return desktop?.app?.isDesktop() === true;
  } catch {
    return false;
  }
}

export function getDesktopAPI(): NeudDesktopAPI | null {
  if (!isDesktopEnvironment()) {
    return null;
  }

  return window.neudDesktop ?? null;
}

export function shouldUseLocalDesktopEngine(engine: DataEngine): boolean {
  if (!isDesktopEnvironment()) {
    return false;
  }

  if (engine.engine_type !== "webpage-scraper") {
    return false;
  }

  // Packaged/desktop NEUD always runs webpage scrapers locally via IPC.
  return true;
}

export async function getDesktopEngineStatus(
  engineId: string,
): Promise<LocalEngineStatus | null> {
  const api = getDesktopAPI();
  if (!api) return null;
  return api.engines.getLocalStatus(engineId);
}

export async function controlDesktopEngine(
  engineId: string,
  command: EngineCommand,
  requestedBy?: string | null,
): Promise<EngineControlResult> {
  const api = getDesktopAPI();
  if (!api) {
    return {
      ok: false,
      code: "error",
      message: "Desktop API is unavailable.",
    };
  }

  const payload = { engineId, requestedBy: requestedBy ?? null };

  switch (command) {
    case "start":
      return api.engines.start(payload);
    case "stop":
      return api.engines.stop(payload);
    case "restart":
      return api.engines.restart(payload);
    case "run_once":
      return api.engines.runOnce(payload);
    default:
      return {
        ok: false,
        code: "error",
        message: "Unsupported command.",
      };
  }
}

export async function hasDesktopCredentials(engineId: string): Promise<boolean> {
  const meta = await getDesktopCredentialMeta(engineId);
  return meta.hasCredentials;
}

export async function getDesktopCredentialMeta(
  engineId: string,
): Promise<{ hasCredentials: boolean; email: string | null }> {
  const api = getDesktopAPI();
  if (!api) {
    return { hasCredentials: false, email: null };
  }
  return api.credentials.getCredentialMeta(engineId);
}

export async function getDesktopCredentials(
  engineId: string,
): Promise<{ email: string; password: string } | null> {
  const api = getDesktopAPI();
  if (!api) {
    return null;
  }
  return api.credentials.getCredentials(engineId);
}

export async function saveDesktopCredentials(
  engineId: string,
  credentials: DesktopCredentialsInput,
): Promise<void> {
  const api = getDesktopAPI();
  if (!api) {
    throw new Error("Desktop API is unavailable.");
  }

  await api.credentials.saveCredentials(engineId, credentials);
}

export async function clearDesktopCredentials(engineId: string): Promise<void> {
  const api = getDesktopAPI();
  if (!api) {
    throw new Error("Desktop API is unavailable.");
  }

  await api.credentials.clearCredentials(engineId);
}

export function subscribeToDesktopLogs(
  engineId: string,
  onEntry: (entry: EngineLogEntry) => void,
): () => void {
  const api = getDesktopAPI();
  if (!api) {
    return () => {};
  }

  void api.engines.subscribeLogs(engineId);
  const unsubscribe = api.engines.onLog((entry) => {
    if (entry.engineId === engineId) {
      onEntry(entry);
    }
  });

  return () => {
    unsubscribe();
    void api.engines.unsubscribeLogs(engineId);
  };
}

type DesktopExecutionLogHandlers = {
  onSnapshot: (entries: SessionExecutionLogEntry[]) => void;
  onEntry: (entry: SessionExecutionLogEntry) => void;
};

export function subscribeToDesktopExecutionLogs(
  engineId: string,
  handlers: DesktopExecutionLogHandlers,
): () => void {
  const api = getDesktopAPI();
  if (!api) {
    return () => {};
  }

  void api.engines.subscribeExecutionLogs(engineId);

  const unsubscribeSnapshot = api.engines.onExecutionLogSnapshot(
    (payload: ExecutionLogSnapshotEvent) => {
      if (payload.engineId === engineId) {
        handlers.onSnapshot(payload.entries);
      }
    },
  );

  const unsubscribeEntry = api.engines.onExecutionLogEntry(
    (payload: ExecutionLogEntryEvent) => {
      if (payload.engineId === engineId) {
        handlers.onEntry(payload.entry);
      }
    },
  );

  return () => {
    unsubscribeSnapshot();
    unsubscribeEntry();
    void api.engines.unsubscribeExecutionLogs(engineId);
  };
}

export async function clearDesktopExecutionLogSession(
  engineId: string,
): Promise<void> {
  const api = getDesktopAPI();
  if (!api) return;
  await api.engines.clearSessionLogs(engineId);
}

export function subscribeToDesktopEngineStatus(
  engineId: string,
  onSnapshot: (snapshot: EngineStatusSnapshot) => void,
): () => void {
  const api = getDesktopAPI();
  if (!api) {
    return () => {};
  }

  void api.engines.subscribeEngineStatus(engineId);

  const unsubscribe = api.engines.onEngineStatusSnapshot(
    (payload: EngineStatusSnapshotEvent) => {
      if (payload.engineId === engineId) {
        onSnapshot(payload.snapshot);
      }
    },
  );

  return () => {
    unsubscribe();
    void api.engines.unsubscribeEngineStatus(engineId);
  };
}

export type { EngineStatusSnapshot };
