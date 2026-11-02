#!/usr/bin/env node
/**
 * Mic Tally connection health: blackhole detection, reconnect, idle retention.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function createFakeClock() {
  let now = 0;
  /** @type {Array<{ id:number, at:number, fn:Function, state?:{ cancelled:boolean } }>} */
  const timers = [];
  let nextId = 1;
  const removeId = (id) => {
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      if (timers[i].id === id) {
        if (timers[i].state) timers[i].state.cancelled = true;
        timers.splice(i, 1);
      }
    }
  };
  const api = {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      removeId(id);
    },
    setInterval(fn, ms) {
      const id = nextId++;
      const state = { cancelled: false };
      const wrap = () => {
        if (state.cancelled) return;
        fn();
        if (!state.cancelled) {
          timers.push({ id, at: now + ms, fn: wrap, state });
        }
      };
      timers.push({ id, at: now + ms, fn: wrap, state });
      return id;
    },
    clearInterval(id) {
      removeId(id);
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const due = timers
          .filter((t) => t.at <= target && !t.state?.cancelled)
          .sort((a, b) => a.at - b.at);
        if (due.length === 0) break;
        const next = due[0];
        const idx = timers.findIndex((t) => t === next);
        if (idx >= 0) timers.splice(idx, 1);
        now = next.at;
        next.fn();
        await Promise.resolve();
      }
      now = target;
    },
  };
  return api;
}

/** Minimal NRPN mute absolute response for Input 1 unmuted. */
function muteResponseIp1Unmuted(midiChannel = 1) {
  const s = 0xb0 | ((midiChannel - 1) & 0x0f);
  // MSB, LSB, data entry absolute unmute (value 0)
  return Buffer.from([
    s, 0x63, 0x00,
    s, 0x62, 0x00,
    s, 0x06, 0x00,
    s, 0x26, 0x00,
  ]);
}

async function listenMockMixer(handler) {
  /** @type {import('node:net').Socket[]} */
  const sockets = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    socket.on("close", () => {
      const idx = sockets.indexOf(socket);
      if (idx >= 0) sockets.splice(idx, 1);
    });
    handler(socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return {
    port: addr.port,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

test("health constants and transport live helper", async () => {
  const health = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/packages/mic-tally/mic-tally-connection-health.js"),
    ).href
  );
  assert.equal(health.MIC_TALLY_HEALTH_INTERVAL_MS, 2000);
  assert.equal(health.MIC_TALLY_HEALTH_TIMEOUT_MS, 3000);
  assert.equal(health.isMicTallyTransportLive("connected"), true);
  assert.equal(health.isMicTallyTransportLive("connection-lost"), false);
  assert.equal(health.isMicTallyTransportLive("reconnecting"), false);
  assert.equal(health.isMicTallyTransportLive("disconnected"), false);
});

test("idle retention still ignores freshness timeout (30+ minutes fake clock)", async () => {
  const tally = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/packages/mic-tally/tally-state.js")).href
  );
  const base = {
    connected: true,
    muted: false,
    muteConfidence: "known",
    fader14: 14000,
    faderConfidence: "known",
    faderThreshold14: 10447,
    lastUpdateMs: 0,
    freshnessTimeoutMs: 15_000,
  };
  assert.equal(
    tally.resolveTallyStatus({ ...base, nowMs: 30 * 60 * 1000 }),
    "LIVE",
  );
  assert.equal(
    tally.resolveTallyStatus({
      ...base,
      muted: true,
      nowMs: 30 * 60 * 1000,
    }),
    "MUTED",
  );
});

test("health monitor: responses during idle keep connection; blackhole times out", async () => {
  const { Sq5TcpClient } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/packages/mic-tally/sq5-tcp-client.js")).href
  );
  const clock = createFakeClock();
  let mode = "respond"; // respond | blackhole | close
  const mock = await listenMockMixer((socket) => {
    socket.on("data", () => {
      if (mode === "respond") {
        socket.write(muteResponseIp1Unmuted());
      } else if (mode === "close") {
        socket.destroy();
      }
      // blackhole: ignore
    });
  });

  /** @type {string[]} */
  const events = [];
  const client = new Sq5TcpClient({
    host: "127.0.0.1",
    port: mock.port,
    midiChannel: 1,
    clock,
    healthIntervalMs: 2000,
    healthTimeoutMs: 3000,
    onEvent: () => {},
    onConnectionChange: (connected, detail) => {
      events.push(connected ? `up:${detail}` : `down:${detail}`);
    },
    onHealthFailure: (detail) => {
      events.push(`health-fail:${detail}`);
    },
    onHealthSuccess: () => {
      events.push("health-ok");
    },
  });

  try {
    await client.connect();
    client.startHealthMonitor(1);

    // First health query after 500ms
    await clock.advance(500);
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(events.includes("health-ok"), `expected health-ok, got ${events.join("|")}`);

    // Stay healthy across several intervals with responses
    for (let i = 0; i < 3; i += 1) {
      await clock.advance(2000);
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(client.connected, true);

    // Blackhole: no TCP close, no responses
    mode = "blackhole";
    const beforeFail = events.filter((e) => e.startsWith("health-fail")).length;
    await clock.advance(2000); // send query
    await new Promise((r) => setTimeout(r, 20));
    await clock.advance(3000); // deadline
    await new Promise((r) => setTimeout(r, 20));
    const afterFail = events.filter((e) => e.startsWith("health-fail")).length;
    assert.equal(afterFail, beforeFail + 1, `health failure events=${events.join("|")}`);
    assert.equal(client.connected, false);
  } finally {
    client.disconnect();
    await mock.close();
  }
});

test("immediate socket close is reported as transport loss", async () => {
  const { Sq5TcpClient } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/packages/mic-tally/sq5-tcp-client.js")).href
  );
  const mock = await listenMockMixer((socket) => {
    // Peer resets as soon as the session is up (simulates abrupt link failure).
    setTimeout(() => socket.destroy(), 10);
  });
  /** @type {string[]} */
  const downs = [];
  const client = new Sq5TcpClient({
    host: "127.0.0.1",
    port: mock.port,
    midiChannel: 1,
    onEvent: () => {},
    onConnectionChange: (connected, detail) => {
      if (!connected) downs.push(detail);
    },
  });
  try {
    await client.connect();
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(downs.length >= 1, `expected transport down, got ${JSON.stringify(downs)}`);
  } finally {
    client.disconnect();
    await mock.close();
  }
});

test("client outbound surface is get-only (no mute-on / scene control builders used)", () => {
  const client = read("desktop/src/packages/mic-tally/sq5-tcp-client.ts");
  assert.match(client, /buildMuteGetRequest/);
  assert.match(client, /buildLevelToLrGetRequest/);
  assert.doesNotMatch(client, /mute on|scene recall|0x06,\s*0x7f/i);
  assert.match(client, /startHealthMonitor/);
  assert.match(client, /onHealthFailure/);
});

test("service state machine: manual disconnect disables auto-reconnect; loss invalidates", () => {
  const service = read("desktop/src/packages/mic-tally/mic-tally-service.ts");
  assert.match(service, /autoReconnectDesired/);
  assert.match(service, /Disconnected \(manual\)/);
  assert.match(service, /handleTransportLoss/);
  assert.match(service, /connection-lost/);
  assert.match(service, /reconnecting/);
  assert.match(service, /startClientHealthMonitor/);
  assert.match(service, /isMicTallyTransportLive/);
  // Manual disconnect clears desire before tearing down socket.
  const disconnectIdx = service.indexOf("disconnect(projectId: string)");
  const disconnectFn = service.slice(disconnectIdx, disconnectIdx + 500);
  assert.match(disconnectFn, /autoReconnectDesired\.set\(projectId, false\)/);
});

test("Data Source surfaces connection-lost / reconnecting and health diagnostics", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /Connection lost/);
  assert.match(client, /Reconnecting…/);
  assert.match(client, /Last mixer health response/);
  assert.match(client, /Reconnect attempts/);
});

test("migration 050 registers health columns", () => {
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migrate, /050_mic_tally_connection_health\.sql/);
  const sql = read("desktop/src/database/migrations/050_mic_tally_connection_health.sql");
  assert.match(sql, /last_health_response_at/);
  assert.match(sql, /last_health_query_at/);
  assert.match(sql, /reconnect_attempt_count/);
});

test("SEMA baseline remains 10; Broad Arrow package path untouched by health module", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 10/);
  const health = read("desktop/src/packages/mic-tally/mic-tally-connection-health.ts");
  assert.doesNotMatch(health, /sema|broad-arrow|bag-graphics/i);
});

test("Owner SOP documents unplug validation steps", () => {
  // Keep a durable Owner checklist next to existing SOP.
  const sopPath = path.join(
    repoRoot,
    "docs/alpha-v0.3.2/mic-tally/sq5-connection-health-owner-sop.md",
  );
  assert.ok(fs.existsSync(sopPath), "owner SOP missing");
  const sop = fs.readFileSync(sopPath, "utf8");
  assert.match(sop, /unplug/i);
  assert.match(sop, /UNKNOWN/);
  assert.match(sop, /Reconnect/);
  assert.match(sop, /Disconnect/);
});
