export type SessionExecutionLogEntry = {
  sequenceId: number;
  id: string;
  engine_id: string;
  level: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SessionBucket = {
  entries: SessionExecutionLogEntry[];
  nextSequenceId: number;
};

type IncomingLog = {
  id: string;
  engineId: string;
  level: string;
  eventType?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

const EXECUTION_EVENT_TYPES = new Set([
  "bag.diagnostic",
  "scrape.failed",
  "engine.execution",
]);

const SESSION_LIMIT = 500;

function isExecutionLogEvent(eventType: string | null | undefined): boolean {
  return typeof eventType === "string" && EXECUTION_EVENT_TYPES.has(eventType);
}

function formatExecutionMessage(log: IncomingLog): string {
  if (
    log.eventType === "scrape.failed" &&
    typeof log.metadata?.step === "string"
  ) {
    return `Stage failed: ${log.metadata.step}. ${log.message}`;
  }

  return log.message;
}

export class ExecutionLogSessionStore {
  private sessions = new Map<string, SessionBucket>();

  append(log: IncomingLog): SessionExecutionLogEntry | null {
    const eventType = log.eventType ?? "";
    if (!isExecutionLogEvent(eventType)) {
      return null;
    }

    const bucket = this.sessions.get(log.engineId) ?? {
      entries: [],
      nextSequenceId: 1,
    };

    const sequenceId = bucket.nextSequenceId;
    bucket.nextSequenceId += 1;

    const entry: SessionExecutionLogEntry = {
      sequenceId,
      id: log.id,
      engine_id: log.engineId,
      level: log.level,
      event_type: eventType,
      message: formatExecutionMessage(log),
      metadata: log.metadata ?? null,
      created_at: log.createdAt,
    };

    bucket.entries.push(entry);
    if (bucket.entries.length > SESSION_LIMIT) {
      bucket.entries.shift();
    }

    this.sessions.set(log.engineId, bucket);
    return entry;
  }

  getSnapshot(engineId: string): SessionExecutionLogEntry[] {
    return [...(this.sessions.get(engineId)?.entries ?? [])];
  }

  clear(engineId: string) {
    this.sessions.delete(engineId);
  }

  clearAll() {
    this.sessions.clear();
  }
}
