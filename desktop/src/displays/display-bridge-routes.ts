import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { DisplayBridgeEvents, DisplayBridgeUpdatedEvent } from "./display-bridge-events";

export type DisplayBridgePipelineEvent = {
  traceEventId?: string | null;
  stage:
    | "desktop.sse_connection_opened"
    | "desktop.sse_write_started"
    | "desktop.sse_write_finished"
    | "desktop.sse_flush_started"
    | "desktop.sse_flush_finished"
    | "desktop.sse_emitted";
  atMs?: number;
  revision?: number;
  connectionId?: string;
  detail?: Record<string, unknown>;
};

export type DisplayBridgeRouteContext = {
  displayBridgeEvents: DisplayBridgeEvents;
  projectExists: (projectId: string) => boolean;
  getSyncState: (projectId: string) => { revision: number; contentHash: string | null };
  onPipelineEvent?: (entry: DisplayBridgePipelineEvent) => void;
};

type FlushableResponse = ServerResponse & {
  flush?: () => void;
  flushHeaders?: () => void;
};

/** Serializes one SSE message with required blank-line terminator. */
export function formatDisplayBridgeSseEvent(event: DisplayBridgeUpdatedEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function handleDisplayBridgeRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ctx: DisplayBridgeRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/display-bridge\/(.+)$/);
  if (!match) {
    return false;
  }

  const projectId = decodeURIComponent(match[1]);
  const subpath = match[2];

  if (!ctx.projectExists(projectId)) {
    sendJson(response, 404, { error: "Project not found." });
    return true;
  }

  if (subpath === "events" && request.method === "GET") {
    handleDisplayBridgeEvents(request, response, projectId, ctx);
    return true;
  }

  sendJson(response, 404, { error: "Not found." });
  return true;
}

function handleDisplayBridgeEvents(
  request: IncomingMessage,
  response: ServerResponse,
  projectId: string,
  ctx: DisplayBridgeRouteContext,
) {
  const connectionId = randomUUID();
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const flushable = response as FlushableResponse;
  if (typeof flushable.flushHeaders === "function") {
    flushable.flushHeaders();
  }
  prepareSseSocket(response);
  response.write(": connected\n\n");
  flushSseResponse(response);

  ctx.onPipelineEvent?.({
    stage: "desktop.sse_connection_opened",
    connectionId,
    detail: { projectId },
  });

  const send = (event: DisplayBridgeUpdatedEvent) => {
    const traceEventId = event.traceEventId ?? null;
    if (traceEventId) {
      ctx.onPipelineEvent?.({
        traceEventId,
        stage: "desktop.sse_write_started",
        connectionId,
        revision: event.revision,
        atMs: Date.now(),
      });
    }

    response.write(formatDisplayBridgeSseEvent(event));

    if (traceEventId) {
      ctx.onPipelineEvent?.({
        traceEventId,
        stage: "desktop.sse_write_finished",
        connectionId,
        revision: event.revision,
        atMs: Date.now(),
      });
      ctx.onPipelineEvent?.({
        traceEventId,
        stage: "desktop.sse_flush_started",
        connectionId,
        revision: event.revision,
        atMs: Date.now(),
      });
    }

    flushSseResponse(response);

    if (traceEventId) {
      const flushedAt = Date.now();
      ctx.onPipelineEvent?.({
        traceEventId,
        stage: "desktop.sse_flush_finished",
        connectionId,
        revision: event.revision,
        atMs: flushedAt,
      });
      ctx.onPipelineEvent?.({
        traceEventId,
        stage: "desktop.sse_emitted",
        connectionId,
        revision: event.revision,
        atMs: flushedAt,
        detail: {
          emittedAtMs: event.emittedAtMs ?? null,
          eventType: event.type,
        },
      });
    }
  };

  const syncState = ctx.getSyncState(projectId);
  send({
    type: "neud-display-bridge.sync",
    projectId,
    revision: syncState.revision,
    contentHash: syncState.contentHash,
  });

  const unsubscribe = ctx.displayBridgeEvents.subscribe(projectId, send);

  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
    flushSseResponse(response);
  }, 4000);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function prepareSseSocket(response: ServerResponse): void {
  const socket = response.socket;
  if (socket && typeof socket.setNoDelay === "function") {
    socket.setNoDelay(true);
  }
}

function flushSseResponse(response: ServerResponse): void {
  const flush = (response as FlushableResponse).flush;
  if (typeof flush === "function") {
    flush.call(response);
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
  cors = false,
) {
  if (cors) {
    response.setHeader("Access-Control-Allow-Origin", "*");
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
