import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { NativeVideoFrame } from "./native-video-addon";
import type { VideoPlaybackService } from "./video-playback-service";

type Client = {
  socket: WebSocket;
  displayId: string;
};

/**
 * Localhost WebSocket fan-out of decoded BGRA frames into Chromium video layers.
 * Binary frame layout (little-endian):
 *   u32 width | u32 height | u32 stride | f64 ptsUs | u32 reserved | BGRA bytes
 */
export class VideoFrameHub {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<Client>();
  private readonly onFrame: (displayId: string, frame: NativeVideoFrame) => void;
  private readonly onState: (displayId: string) => void;

  constructor(private readonly playback: VideoPlaybackService) {
    this.onFrame = (displayId, frame) => this.broadcastFrame(displayId, frame);
    this.onState = (displayId) => this.broadcastStatus(displayId);
    this.playback.on("frame", this.onFrame);
    this.playback.on("state", this.onState);
  }

  attach(server: HttpServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const match = url.pathname.match(/^\/api\/video\/frames\/([^/]+)$/);
      if (!match) {
        socket.destroy();
        return;
      }
      const displayId = decodeURIComponent(match[1]!);
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.acceptClient(ws, displayId, request);
      });
    });
  }

  dispose(): void {
    this.playback.off("frame", this.onFrame);
    this.playback.off("state", this.onState);
    for (const client of this.clients) {
      try {
        client.socket.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  private acceptClient(socket: WebSocket, displayId: string, _request: IncomingMessage): void {
    const client: Client = { socket, displayId };
    this.clients.add(client);
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
    socket.on("message", (raw) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const msg = JSON.parse(text) as { type?: string };
        if (msg.type === "subscribe") {
          void this.playback.ensureOpen(displayId).then(() => {
            const latest = this.playback.getLatestFrame(displayId);
            if (latest) this.sendFrame(socket, latest);
            // Session ack only — do not surface a user-visible "Subscribed" toast.
            this.sendJson(socket, {
              type: "session",
              session: this.playback.getSession(displayId),
            });
          }).catch((error) => {
            this.sendJson(socket, {
              type: "error",
              error: error instanceof Error ? error.message : "Unable to open video.",
            });
          });
        }
      } catch {
        // ignore malformed client messages
      }
    });
  }

  private broadcastFrame(displayId: string, frame: NativeVideoFrame): void {
    for (const client of this.clients) {
      if (client.displayId !== displayId) continue;
      if (client.socket.readyState !== client.socket.OPEN) continue;
      this.sendFrame(client.socket, frame);
    }
  }

  private broadcastStatus(displayId: string): void {
    const session = this.playback.getSession(displayId);
    for (const client of this.clients) {
      if (client.displayId !== displayId) continue;
      if (client.socket.readyState !== client.socket.OPEN) continue;
      this.sendJson(client.socket, { type: "status", session });
    }
  }

  private sendFrame(socket: WebSocket, frame: NativeVideoFrame): void {
    const header = Buffer.alloc(24);
    header.writeUInt32LE(frame.width, 0);
    header.writeUInt32LE(frame.height, 4);
    header.writeUInt32LE(frame.stride, 8);
    header.writeDoubleLE(frame.ptsUs, 12);
    header.writeUInt32LE(0, 20);
    // Prefer tight packed rows when stride === width*4; otherwise send full stride buffer.
    const payload = frame.bgra;
    socket.send(Buffer.concat([header, payload]), { binary: true });
  }

  private sendJson(socket: WebSocket, value: unknown): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(value));
  }
}
