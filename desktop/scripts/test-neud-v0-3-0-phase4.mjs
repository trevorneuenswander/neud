import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const dims = (id, w, h) => ({ id, width: w, height: h });
const displaysById = new Map([
  ["a", dims("a", 1920, 1080)],
  ["b", dims("b", 1920, 1080)],
  ["c", dims("c", 1920, 1080)],
  ["v", dims("v", 1080, 1920)],
]);
const listOrder = ["a", "b", "c", "v"];

test("D2: reorder stack saves TOP…BOTTOM without touching display list order", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "s1", displayIds: ["a", "b", "c"] }];
  const next = mod.buildReorderStackPreference({
    stackId: "s1",
    orderedDisplayIds: ["c", "a", "b"],
    pinnedDisplayIds: ["a", "b", "c"],
    stacks,
    displaysById,
  });
  assert.deepEqual(next.stacks[0], { id: "s1", displayIds: ["c", "a", "b"], customOrder: true });
  assert.deepEqual(next.pinnedDisplayIds, ["a", "b", "c"]);

  const slots = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: next.pinnedDisplayIds,
    stacks: next.stacks,
    displayListOrderIds: listOrder,
    displaysById,
  });
  // Top = first. Display list order (a, b, c) is unchanged.
  assert.deepEqual(slots[0].orderedMemberDisplayIds, ["c", "a", "b"]);
  assert.equal(mod.layerZIndexForDisplayInStack("c", slots[0].orderedMemberDisplayIds), 3);
  assert.equal(mod.layerZIndexForDisplayInStack("b", slots[0].orderedMemberDisplayIds), 1);
  assert.deepEqual(listOrder, ["a", "b", "c", "v"]);
});

test("D2: custom order survives sanitize, JSON round trip, add and remove", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stack = { id: "s1", displayIds: ["c", "a", "b"], customOrder: true };
  const roundTrip = mod.parsePinnedStacks(JSON.parse(JSON.stringify([stack])));
  assert.deepEqual(roundTrip, [stack]);

  const eligible = ["a", "b", "c", "v"].map((id) => ({ id, enabled: true, archived: false }));
  const sanitized = mod.sanitizePinnedViewerStacks({
    pinnedDisplayIds: ["a", "b", "c"],
    stacks: [stack],
    displays: eligible,
    displayListOrderIds: listOrder,
    displaysById,
  });
  assert.deepEqual(sanitized.stacks, [stack]);

  const removed = mod.buildRemoveFromStackPreference({
    stackId: "s1",
    displayId: "a",
    pinnedDisplayIds: ["a", "b", "c"],
    stacks: [stack],
    displayListOrderIds: listOrder,
    displaysById,
  });
  assert.deepEqual(removed.stacks[0].displayIds, ["c", "b"]);
  assert.equal(removed.stacks[0].customOrder, true);
});

test("D2: legacy stacks keep list-order layering", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const slots = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: ["a", "b"],
    stacks: [{ id: "s1", displayIds: ["b", "a"] }],
    displayListOrderIds: listOrder,
    displaysById,
  });
  assert.deepEqual(slots[0].orderedMemberDisplayIds, ["a", "b"]);
});

test("D2: reorder rejects wrong members and mixed aspect ratios", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "s1", displayIds: ["a", "b"] }];
  assert.throws(() =>
    mod.buildReorderStackPreference({
      stackId: "s1",
      orderedDisplayIds: ["a", "c"],
      pinnedDisplayIds: ["a", "b"],
      stacks,
      displaysById,
    }),
  );
  assert.throws(() =>
    mod.buildReorderStackPreference({
      stackId: "s1",
      orderedDisplayIds: ["a"],
      pinnedDisplayIds: ["a", "b"],
      stacks,
      displaysById,
    }),
  );
  const mixed = new Map(displaysById);
  mixed.set("b", dims("b", 1080, 1920));
  assert.throws(() =>
    mod.buildReorderStackPreference({
      stackId: "s1",
      orderedDisplayIds: ["b", "a"],
      pinnedDisplayIds: ["a", "b"],
      stacks,
      displaysById: mixed,
    }),
  );
});

test("D1/D2: menu wiring and desktop plumbing exist", () => {
  const items = read("src/lib/displays/pinned-viewer-context-menu-items.ts");
  assert.match(items, /Copy Local URL/);
  assert.match(items, /Reorder Stack…/);
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /resolvePinnedDisplayLocalUrl/);
  assert.match(area, /ReorderPinnedStackModal/);
  const resolver = read("src/lib/displays/resolve-pinned-viewer-url.ts");
  assert.match(resolver, /buildProjectDisplayOutputPath/);
  for (const file of [
    "desktop/src/ipc/displays.ts",
    "desktop/src/services/local-api-server.ts",
  ]) {
    assert.match(read(file), /reorderStack/);
  }
  assert.match(read("desktop/src/services/local-data-service.ts"), /reorderPinnedViewerStack/);
  assert.equal(
    read("shared/displays/pinned-viewer-stacks.ts"),
    read("desktop/src/lib/displays/pinned-viewer-stacks.ts"),
  );
});

test("C1/C2: cloud connection states are distinct", async () => {
  const { resolveCloudConnectionState } = await import(
    "../src/services/account-connection-state.ts"
  );
  const base = {
    authenticatedCloudSessionAvailable: true,
    authenticatedClientReady: true,
    hasCloudSession: true,
    hasRestorableCloudSession: true,
    reauthenticationRequired: false,
    tokenExpired: false,
  };
  const resolve = (networkReachable, sharedAuth) =>
    resolveCloudConnectionState({ networkReachable, sharedAuth });

  assert.equal(resolve(true, base), "connected");
  assert.equal(resolve(false, base), "network_offline");
  assert.equal(
    resolve(true, { ...base, authenticatedCloudSessionAvailable: false, authenticatedClientReady: false }),
    "reconnecting",
  );
  assert.equal(resolve(true, { ...base, tokenExpired: true }), "reconnecting");
  assert.equal(resolve(true, { ...base, reauthenticationRequired: true }), "authentication_required");
  assert.equal(resolve(false, { ...base, reauthenticationRequired: true }), "authentication_required");
  assert.equal(
    resolve(true, {
      ...base,
      authenticatedCloudSessionAvailable: false,
      hasCloudSession: false,
      hasRestorableCloudSession: false,
    }),
    "authentication_required",
  );
  assert.equal(resolve(true, null), "authentication_required");
});

function createKeeperHarness(overrides = {}) {
  const calls = { maintain: 0, recovered: 0, reachability: [] };
  const state = {
    reachable: true,
    available: true,
    tokenExpired: false,
    maintainResult: { ok: true, transient: false, reauthenticationRequired: false, refreshed: false },
  };
  const deps = {
    isCloudConfigured: () => true,
    isSignedIn: () => true,
    getSessionHealth: () => ({ available: state.available, tokenExpired: state.tokenExpired }),
    refreshNetworkReachability: async (force) => {
      calls.reachability.push(force);
      return state.reachable;
    },
    maintainSession: async () => {
      calls.maintain += 1;
      return state.maintainResult;
    },
    onRecovered: async () => {
      calls.recovered += 1;
    },
    ...overrides,
  };
  return { deps, calls, state };
}

test("C1: keeper retries transient failure with backoff and recovers", async () => {
  const { CloudSessionKeeper, resolveCloudSessionRetryDelayMs } = await import(
    "../src/services/cloud-session-keeper.ts"
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(resolveCloudSessionRetryDelayMs),
    [5000, 10000, 20000, 40000, 60000, 60000],
  );

  const { deps, calls, state } = createKeeperHarness();
  const keeper = new CloudSessionKeeper(deps);
  keeper.start(60_000_000);
  state.available = false;
  state.maintainResult = { ok: false, transient: true, reauthenticationRequired: false, refreshed: false };
  await keeper.tick();
  assert.equal(keeper.isDegraded(), true);
  assert.equal(calls.recovered, 0);

  state.maintainResult = { ok: true, transient: false, reauthenticationRequired: false, refreshed: true };
  state.available = true;
  await keeper.tick();
  assert.equal(keeper.isDegraded(), false);
  assert.equal(calls.recovered, 1);
  keeper.stop();
});

test("C1: keeper does not retry when authentication is required or network is down", async () => {
  const { CloudSessionKeeper } = await import("../src/services/cloud-session-keeper.ts");

  const auth = createKeeperHarness();
  auth.state.maintainResult = {
    ok: false,
    transient: false,
    reauthenticationRequired: true,
    refreshed: false,
  };
  const authKeeper = new CloudSessionKeeper(auth.deps);
  authKeeper.start(60_000_000);
  await authKeeper.tick();
  assert.equal(authKeeper.isDegraded(), false);
  assert.equal(auth.calls.recovered, 0);
  authKeeper.stop();

  const offline = createKeeperHarness();
  offline.state.reachable = false;
  const offlineKeeper = new CloudSessionKeeper(offline.deps);
  offlineKeeper.start(60_000_000);
  await offlineKeeper.tick();
  assert.equal(offline.calls.maintain, 0);
  assert.equal(offlineKeeper.isDegraded(), true);
  offline.state.reachable = true;
  await offlineKeeper.tick();
  assert.equal(offline.calls.maintain, 1);
  assert.equal(offline.calls.recovered, 1);
  offlineKeeper.stop();
});

test("C1/C2: session service rebuilds client after refresh and exposes live expiry", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /freshMarginMs/);
  assert.match(session, /Rebuild it right away/);
  assert.match(session, /tokenExpired,\s*\n\s*accessTokenExpired: tokenExpired/);
  const main = read("desktop/src/main.ts");
  assert.match(main, /new CloudSessionKeeper/);
  assert.match(main, /powerMonitor\.on\("resume"/);
  const ui = read("src/components/dashboard/DashboardAuthenticationStatus.tsx");
  assert.match(ui, /cloudConnectionLabel/);
});
