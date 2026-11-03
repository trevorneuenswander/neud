#!/usr/bin/env node
/**
 * NEUD v0.3.3 — SQ-5 Mic Tally connection lifecycle.
 *
 * Connect → quit → restart must start Disconnected with no stale LIVE tallies.
 * Saved host/port/slots/labels survive. No launch auto-connect is introduced.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const desktopRoot = path.join(repoRoot, "desktop");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function createTestPaths(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `neud-sq5-life-${name}-`));
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "neud.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    logs: path.join(root, "logs"),
    repoRoot,
  };
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.projects, { recursive: true });
  return paths;
}

/** Minimal MIDI-TCP acceptor that accepts connections and stays open. */
function listenMockMixer(onSocket) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    onSocket?.(socket);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        close: () =>
          new Promise((res) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => res());
          }),
      });
    });
  });
}

function seedKnownLiveChannels(db, projectId) {
  const now = new Date().toISOString();
  const channelState = {
    "1": {
      muted: false,
      muteConfidence: "known",
      fader14: 14000,
      faderNormalized: 0.9,
      faderConfidence: "known",
      lastMuteAt: now,
      lastFaderAt: now,
      lastUpdateAt: now,
    },
    "2": {
      muted: true,
      muteConfidence: "known",
      fader14: 12000,
      faderNormalized: 0.7,
      faderConfidence: "known",
      lastMuteAt: now,
      lastFaderAt: now,
      lastUpdateAt: now,
    },
    "3": {
      muted: false,
      muteConfidence: "known",
      fader14: 0,
      faderNormalized: 0,
      faderConfidence: "known",
      lastMuteAt: now,
      lastFaderAt: now,
      lastUpdateAt: now,
    },
  };
  db.prepare(
    `UPDATE mic_tally_state SET
      mixer_host = ?, mixer_port = ?, midi_channel = ?,
      slot1_input_channel = 1, slot2_input_channel = 2, slot3_input_channel = 3,
      slot1_label_override = ?, slot2_label_override = ?, slot3_label_override = ?,
      auto_connect = 1, reconnect_enabled = 1,
      connection_status = 'connected', last_error = NULL,
      channel_state_json = ?, state_revision = state_revision + 1, updated_at = ?
     WHERE project_id = ?`,
  ).run(
    "192.168.2.87",
    51325,
    1,
    "Host",
    "Guest",
    "Floor",
    JSON.stringify(channelState),
    now,
    projectId,
  );
}

async function openServiceHarness() {
  const distService = path.join(desktopRoot, "dist/packages/mic-tally/mic-tally-service.js");
  const distConnection = path.join(desktopRoot, "dist/database/connection.js");
  const distProjects = path.join(desktopRoot, "dist/repositories/projects-repository.js");
  assert.ok(
    fs.existsSync(distService),
    "desktop dist missing — run tsc -p desktop/tsconfig.json first",
  );
  const { LocalDatabase } = require(distConnection);
  const { ProjectsRepository } = require(distProjects);
  const { MicTallyService } = await import(pathToFileURL(distService).href);

  const paths = createTestPaths("svc");
  const db = await LocalDatabase.open(paths);
  const projects = new ProjectsRepository(db);
  const project = projects.create({
    name: "Mic Tally Life",
    slug: `mic-tally-life-${Date.now()}`,
    projectType: "mic-tally",
  });
  const service = new MicTallyService(db);
  service.ensureStateRow(project.id);
  return { db, paths, project, service, close: () => db.close() };
}

test("source: shutdown invalidates transport and startup reconcile is wired", () => {
  const service = read("desktop/src/packages/mic-tally/mic-tally-service.ts");
  const main = read("desktop/src/main.ts");

  assert.match(service, /reconcileStaleTransportOnStartup/);
  assert.match(service, /markProcessDisconnected/);
  assert.match(service, /Application exit/);
  assert.match(service, /Startup — no live SQ-5 session/);
  assert.match(service, /isTransportLiveForProject/);
  assert.match(service, /effectiveConnectionStatus/);

  const shutdownIdx = service.indexOf("shutdown(): void");
  const shutdownFn = service.slice(shutdownIdx, shutdownIdx + 900);
  assert.match(shutdownFn, /markProcessDisconnected/);
  assert.match(shutdownFn, /listProjectIdsWithTransientTransport/);

  assert.match(main, /micTallyService\.reconcileStaleTransportOnStartup\(\)/);
  assert.match(main, /micTallyService\?\.shutdown\(\)/);
  // Force-quit path must still drop SQ-5 (before-quit returns early when isQuitting).
  const forceIdx = main.indexOf('if (action === "force")');
  const forceBlock = main.slice(forceIdx, forceIdx + 350);
  assert.match(forceBlock, /micTallyService\?\.shutdown\(\)/);

  // No new quit confirmation / warning for Mic Tally specifically.
  assert.doesNotMatch(main, /SQ-5.*(confirm|warning|dialog)/i);
  assert.doesNotMatch(service, /showMessageBox|dialog\.|confirm\(/);

  // Launch auto-connect must not be introduced.
  assert.doesNotMatch(service, /if \(.*auto_connect.*\)[\s\S]{0,80}this\.connect/);
  assert.doesNotMatch(main, /auto_connect[\s\S]{0,120}\.connect\(/);
});

test("source: approved Mic Tally colors and slot visual order 3/2/1 unchanged", () => {
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  assert.match(html, /left:\s*2775px/); // slot 1 visual right
  assert.match(html, /left:\s*1495px/); // slot 2 visual center
  assert.match(html, /left:\s*215px/); // slot 3 visual left
  assert.match(html, /#ff2020/i);
  assert.match(html, /#527d65/i);
  assert.match(html, /#777777/);
});

test("startup reconcile: phantom Connected + known channels become Disconnected UNKNOWN", async () => {
  const harness = await openServiceHarness();
  try {
    seedKnownLiveChannels(harness.db, harness.project.id);

    // Simulate a fresh process reading the same SQLite without a live socket.
    const stalePayload = harness.service.toDisplayPayload(harness.project.id);
    assert.equal(stalePayload.connected, false, "must not report connected without a socket");
    assert.equal(
      harness.service.getOperatorState(harness.project.id).connectionStatus,
      "disconnected",
    );
    for (const slot of stalePayload.slots) {
      assert.equal(slot.status, "UNKNOWN", `slot ${slot.slot} must not keep stale LIVE`);
    }

    harness.service.reconcileStaleTransportOnStartup();

    const row = harness.db
      .prepare(`SELECT connection_status, channel_state_json, mixer_host, auto_connect,
                       slot1_label_override, slot2_input_channel FROM mic_tally_state WHERE project_id = ?`)
      .get(harness.project.id);
    assert.equal(row.connection_status, "disconnected");
    assert.equal(row.mixer_host, "192.168.2.87");
    assert.equal(row.auto_connect, 1);
    assert.equal(row.slot1_label_override, "Host");
    assert.equal(row.slot2_input_channel, 2);

    const map = JSON.parse(row.channel_state_json);
    for (const key of ["1", "2", "3"]) {
      assert.equal(map[key].muteConfidence, "unknown");
      assert.equal(map[key].faderConfidence, "unknown");
      assert.equal(map[key].muted, null);
      assert.equal(map[key].fader14, null);
    }

    const payload = harness.service.toDisplayPayload(harness.project.id);
    assert.equal(payload.connected, false);
    assert.equal(payload.connectionMode, "disconnected");
    assert.deepEqual(
      payload.slots.map((s) => s.status),
      ["UNKNOWN", "UNKNOWN", "UNKNOWN"],
    );
    assert.deepEqual(
      payload.slots.map((s) => s.label),
      ["Host", "Guest", "Floor"],
    );
  } finally {
    harness.close();
  }
});

test("shutdown after live connect persists Disconnected and clears live tallies; settings survive", async () => {
  const harness = await openServiceHarness();
  const mock = await listenMockMixer((socket) => {
    // Respond to any get with silence — connect only needs TCP up.
    socket.on("data", () => {});
  });
  try {
    harness.service.updateConfig(harness.project.id, {
      mixerHost: "127.0.0.1",
      mixerPort: mock.port,
      midiChannel: 1,
      slot1InputChannel: 1,
      slot2InputChannel: 2,
      slot3InputChannel: 3,
      slot1LabelOverride: "A",
      slot2LabelOverride: "B",
      slot3LabelOverride: "C",
      autoConnect: true,
    });

    await harness.service.connect(harness.project.id);
    // Inject known live state as if MIDI sync completed.
    seedKnownLiveChannels(harness.db, harness.project.id);
    // seedKnownLiveChannels overwrote host/port — restore live connection markers for this test's assert path
    harness.db
      .prepare(
        `UPDATE mic_tally_state SET mixer_host = '127.0.0.1', mixer_port = ?, connection_status = 'connected' WHERE project_id = ?`,
      )
      .run(mock.port, harness.project.id);

    const before = harness.service.getOperatorState(harness.project.id);
    assert.equal(before.connectionStatus, "connected");
    assert.equal(before.connected, true);

    harness.service.shutdown();

    const after = harness.service.getOperatorState(harness.project.id);
    assert.equal(after.connectionStatus, "disconnected");
    assert.equal(after.connected, false);
    assert.equal(after.mixerHost, "127.0.0.1");
    assert.equal(after.mixerPort, mock.port);
    assert.equal(after.autoConnect, true);
    assert.deepEqual(
      after.slots.map((s) => s.status),
      ["UNKNOWN", "UNKNOWN", "UNKNOWN"],
    );

    // Second process: new service instance on same DB must stay disconnected.
    const { MicTallyService } = await import(
      pathToFileURL(path.join(desktopRoot, "dist/packages/mic-tally/mic-tally-service.js")).href
    );
    const restarted = new MicTallyService(harness.db);
    restarted.reconcileStaleTransportOnStartup();
    const restartedState = restarted.getOperatorState(harness.project.id);
    assert.equal(restartedState.connectionStatus, "disconnected");
    assert.equal(restartedState.connected, false);
    assert.equal(restartedState.mixerHost, "127.0.0.1");
    assert.equal(restartedState.autoConnect, true);
    assert.deepEqual(
      restartedState.slots.map((s) => s.status),
      ["UNKNOWN", "UNKNOWN", "UNKNOWN"],
    );
  } finally {
    harness.service.shutdown();
    await mock.close();
    harness.close();
  }
});

test("manual disconnect and unexpected socket close invalidate live microphone states", async () => {
  const harness = await openServiceHarness();
  /** @type {net.Socket | null} */
  let peer = null;
  const mock = await listenMockMixer((socket) => {
    peer = socket;
    socket.on("data", () => {});
  });
  try {
    harness.service.updateConfig(harness.project.id, {
      mixerHost: "127.0.0.1",
      mixerPort: mock.port,
      slot1InputChannel: 1,
      reconnectEnabled: true,
    });
    await harness.service.connect(harness.project.id);

    // Force known LIVE into DB while socket is up.
    const now = new Date().toISOString();
    harness.db
      .prepare(
        `UPDATE mic_tally_state SET channel_state_json = ?, connection_status = 'connected' WHERE project_id = ?`,
      )
      .run(
        JSON.stringify({
          "1": {
            muted: false,
            muteConfidence: "known",
            fader14: 14000,
            faderNormalized: 0.9,
            faderConfidence: "known",
            lastMuteAt: now,
            lastFaderAt: now,
            lastUpdateAt: now,
          },
        }),
        harness.project.id,
      );

    assert.equal(harness.service.toDisplayPayload(harness.project.id).slots[0].status, "LIVE");

    // Unexpected peer close.
    peer.destroy();
    await new Promise((r) => setTimeout(r, 80));

    const afterLoss = harness.service.getOperatorState(harness.project.id);
    assert.notEqual(afterLoss.connectionStatus, "connected");
    assert.equal(afterLoss.connected, false);
    assert.equal(afterLoss.slots[0].status, "UNKNOWN");

    // Reconnect requires a new verified connection — still disconnected until connect succeeds.
    assert.ok(
      afterLoss.connectionStatus === "connection-lost" ||
        afterLoss.connectionStatus === "reconnecting" ||
        afterLoss.connectionStatus === "disconnected" ||
        afterLoss.connectionStatus === "connecting",
    );

    // Manual disconnect path.
    await harness.service.connect(harness.project.id).catch(() => {});
    harness.service.disconnect(harness.project.id);
    const afterManual = harness.service.getOperatorState(harness.project.id);
    assert.equal(afterManual.connectionStatus, "disconnected");
    assert.equal(afterManual.connected, false);
    assert.equal(afterManual.slots[0].status, "UNKNOWN");
    assert.equal(afterManual.autoReconnectDesired, false);
  } finally {
    harness.service.shutdown();
    await mock.close();
    harness.close();
  }
});

test("auto_connect setting is preserved but launch does not auto-connect", async () => {
  const harness = await openServiceHarness();
  try {
    harness.service.updateConfig(harness.project.id, {
      mixerHost: "10.0.0.5",
      mixerPort: 51325,
      autoConnect: true,
    });
    seedKnownLiveChannels(harness.db, harness.project.id);
    harness.service.reconcileStaleTransportOnStartup();

    const state = harness.service.getOperatorState(harness.project.id);
    assert.equal(state.autoConnect, true);
    assert.equal(state.connectionStatus, "disconnected");
    assert.equal(state.connected, false);
    assert.equal(state.mixerHost, "192.168.2.87");
    // No in-memory client should exist after reconcile.
    assert.equal(state.autoReconnectDesired, false);
  } finally {
    harness.close();
  }
});

test("UNKNOWN tally resolution still uses disconnected → UNKNOWN (gray display path)", async () => {
  const tally = await import(
    pathToFileURL(path.join(repoRoot, "desktop/src/packages/mic-tally/tally-state.ts")).href
  );
  assert.equal(
    tally.resolveTallyStatus({
      connected: false,
      muted: false,
      muteConfidence: "known",
      fader14: 14000,
      faderConfidence: "known",
      faderThreshold14: 10447,
      nowMs: Date.now(),
      lastUpdateMs: Date.now(),
      freshnessTimeoutMs: 15_000,
    }),
    "UNKNOWN",
  );
});
