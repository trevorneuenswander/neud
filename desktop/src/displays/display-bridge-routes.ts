import type { IncomingMessage, ServerResponse } from "http";
import type { DisplayBridgeEvents, DisplayBridgeUpdatedEvent } from "./display-bridge-events";

export type DisplayBridgeRouteContext = {
  displayBridgeEvents: DisplayBridgeEvents;
  projectExists: (projectId: string) => boolean;
  getSyncState: (projectId: string) => { revision: number; contentHash: string | null };
};

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
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.write(": connected\n\n");

  const send = (event: DisplayBridgeUpdatedEvent) => {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
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
  }, 15000);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
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
