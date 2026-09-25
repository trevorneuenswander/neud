import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const displayOrder = ["a", "b", "c", "d", "e"];
const dims = (id, w, h) => ({ id, width: w, height: h });
const displaysById = new Map([
  ["a", dims("a", 1920, 1080)],
  ["b", dims("b", 3840, 2160)],
  ["c", dims("c", 1080, 1920)],
  ["d", dims("d", 1080, 1920)],
  ["e", dims("e", 1920, 1080)],
]);

test("empty stack prefs upgrade safely", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  assert.deepEqual(mod.parsePinnedStacks(undefined), []);
  assert.deepEqual(mod.parsePinnedStacks([]), []);
  assert.deepEqual(mod.parsePinnedStacks([{ id: "x", displayIds: ["a"] }]), []);
});

test("create stack from two compatible pins", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const next = mod.buildAddToStackPreference({
    sourceDisplayId: "b",
    target: { kind: "display", displayId: "a" },
    pinnedDisplayIds: ["a", "b"],
    stacks: [],
    displayListOrderIds: displayOrder,
    displaysById,
  });
  assert.equal(next.pinnedDisplayIds.join(","), "a,b");
  assert.equal(next.stacks.length, 1);
  assert.ok(next.stacks[0].displayIds.includes("a"));
  assert.ok(next.stacks[0].displayIds.includes("b"));
});

test("incompatible aspect rejected", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  assert.throws(
    () =>
      mod.buildAddToStackPreference({
        sourceDisplayId: "a",
        target: { kind: "display", displayId: "c" },
        pinnedDisplayIds: ["a", "c"],
        stacks: [],
        displayListOrderIds: displayOrder,
        displaysById,
      }),
    /aspect ratio/i,
  );
});

test("display cannot belong to two stacks", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  assert.throws(
    () =>
      mod.buildAddToStackPreference({
        sourceDisplayId: "a",
        target: { kind: "display", displayId: "e" },
        pinnedDisplayIds: ["a", "b", "e"],
        stacks,
        displayListOrderIds: displayOrder,
        displaysById,
      }),
    /already in a stack/i,
  );
});

test("stack persists via parsePinnedStacks", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const raw = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  assert.deepEqual(mod.parsePinnedStacks(raw), raw);
});

test("cloud serialization fields exist in migrations", () => {
  const sqlite = read("desktop/src/database/migrations/038_user_pinned_viewer_stacks.sql");
  assert.match(sqlite, /pinned_stacks/);
  const supabase = read("supabase/migrations/055_user_pinned_viewer_stacks.sql");
  assert.match(supabase, /pinned_stacks/);
});

test("sanitizer dissolves one-member stack", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const result = mod.sanitizePinnedViewerStacks({
    pinnedDisplayIds: ["a", "b"],
    stacks: [{ id: "stack:a|b", displayIds: ["a", "b"] }],
    displays: [
      { id: "a", enabled: true, archived: false },
      { id: "b", enabled: false, archived: false },
    ],
    displayListOrderIds: displayOrder,
    displaysById,
  });
  assert.deepEqual(result.pinnedDisplayIds, ["a"]);
  assert.deepEqual(result.stacks, []);
  assert.deepEqual(result.removedDisplayIds, ["b"]);
});

test("disabled member removed from stack membership", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const result = mod.sanitizePinnedViewerStacks({
    pinnedDisplayIds: ["a", "b", "e"],
    stacks: [{ id: "stack:a|b", displayIds: ["a", "b"] }],
    displays: [
      { id: "a", enabled: true, archived: false },
      { id: "b", enabled: true, archived: false },
      { id: "e", enabled: true, archived: false },
    ],
    displayListOrderIds: displayOrder,
    displaysById,
  });
  assert.equal(result.stacks.length, 1);
  assert.deepEqual(result.stacks[0].displayIds.sort(), ["a", "b"]);
});

test("layer order derives from display list", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:b|a", displayIds: ["b", "a"] }];
  const slots = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: ["a", "b"],
    stacks,
    displayListOrderIds: ["b", "a"],
    displaysById,
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, "stack");
  assert.deepEqual(slots[0].orderedMemberDisplayIds, ["b", "a"]);
  assert.equal(mod.layerZIndexForDisplayInStack("b", ["b", "a"]), 2);
  assert.equal(mod.layerZIndexForDisplayInStack("a", ["b", "a"]), 1);
});

test("reordering displays changes stack layer order", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  const first = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: ["a", "b"],
    stacks,
    displayListOrderIds: ["a", "b"],
    displaysById,
  });
  const second = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: ["a", "b"],
    stacks,
    displayListOrderIds: ["b", "a"],
    displaysById,
  });
  assert.deepEqual(first[0].orderedMemberDisplayIds, ["a", "b"]);
  assert.deepEqual(second[0].orderedMemberDisplayIds, ["b", "a"]);
});

test("stack visible position follows base display list position", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  const slots = mod.deriveVisiblePinnedSlots({
    pinnedDisplayIds: ["a", "b", "c"],
    stacks,
    displayListOrderIds: ["c", "a", "b"],
    displaysById: new Map([
      ...displaysById,
      ["c", dims("c", 1080, 1920)],
    ]),
  });
  assert.equal(slots.length, 2);
  assert.equal(slots[0].kind, "single");
  assert.equal(slots[0].displayId, "c");
  assert.equal(slots[1].kind, "stack");
  assert.equal(slots[1].baseDisplayId, "b");
});

test("four standalone windows block fifth pin", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const order = ["a", "b", "e", "x", "y"];
  const map = new Map([
    ...displaysById,
    ["x", dims("x", 1920, 1080)],
    ["y", dims("y", 1920, 1080)],
  ]);
  const fourStandalone = ["a", "b", "e", "x"];
  assert.equal(
    mod.countVisiblePinnedSlots({
      pinnedDisplayIds: fourStandalone,
      stacks: [],
      displayListOrderIds: order,
      displaysById: map,
    }),
    4,
  );
  assert.equal(
    mod.countVisiblePinnedSlots({
      pinnedDisplayIds: [...fourStandalone, "y"],
      stacks: [],
      displayListOrderIds: order,
      displaysById: map,
    }),
    5,
  );
});

test("stack two decreases visible count", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  assert.equal(
    mod.countVisiblePinnedSlots({
      pinnedDisplayIds: ["a", "b", "e"],
      stacks,
      displayListOrderIds: displayOrder,
      displaysById,
    }),
    2,
  );
});

test("remove from stack blocked at four visible slots", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const stacks = [{ id: "stack:a|b", displayIds: ["a", "b"] }];
  const map = new Map([
    ...displaysById,
    ["x", dims("x", 1920, 1080)],
  ]);
  const order = ["a", "b", "c", "e", "x"];
  assert.throws(() => {
    mod.buildRemoveFromStackPreference({
      stackId: "stack:a|b",
      displayId: "a",
      pinnedDisplayIds: ["a", "b", "c", "e", "x"],
      stacks,
      displayListOrderIds: order,
      displaysById: new Map([...map, ["c", dims("c", 1080, 1920)]]),
    });
  }, /Maximum of 4 pinned display windows/);
});

test("pinned viewer UI wires stacks and context menu", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /visibleSlots/);
  assert.match(area, /PinnedDisplayStackSlot/);
  assert.match(area, /PinnedViewerContextMenu/);
  const context = read("src/lib/displays/pinned-viewer-context.tsx");
  assert.match(context, /MAX_PINNED_DISPLAYS_MESSAGE/);
  assert.match(context, /visibleSlots/);
  assert.match(context, /addDisplayToStack/);
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /addToStack/);
  assert.match(server, /removeFromStack/);
  assert.match(server, /unpinStack/);
});

test("stack rendering uses one checkerboard", () => {
  const stack = read("src/components/displays/PinnedDisplayStackSlot.tsx");
  assert.match(stack, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(stack, /data-pinned-stack-window/);
  assert.match(stack, /aspectRatio: `\$\{aspectDisplay\.width\} \/ \$\{aspectDisplay\.height\}`/);
  assert.match(stack, /data-pinned-preview-wrapper/);
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /managementCheckerboard=\{stackOmitsCheckerboard \? false : undefined\}/);
  assert.match(slot, /pointerEvents: "none"/);
});

test("pinned viewer area renders visibleSlots not pinnedDisplayIds", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /visibleSlots\.map/);
  assert.match(area, /key=\{slot\.stackId\}/);
  assert.match(area, /count = visibleSlots\.length/);
});

test("stack slot uses stable stackId key and layered z-index", () => {
  const stack = read("src/components/displays/PinnedDisplayStackSlot.tsx");
  assert.match(stack, /layerZIndexForDisplayInStack/);
  assert.match(stack, /absolute inset-0/);
});

test("compatible stack targets sort with nearest left first", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-stacks.js");
  const visibleSlots = [
    { kind: "single", displayId: "a", sortKeyDisplayId: "a" },
    { kind: "single", displayId: "e", sortKeyDisplayId: "e" },
    { kind: "single", displayId: "b", sortKeyDisplayId: "b" },
  ];
  const targets = mod.listCompatibleStackTargets({
    sourceDisplayId: "b",
    visibleSlots,
    displaysById,
    displaySummariesById: new Map([
      ["a", { name: "A" }],
      ["b", { name: "B" }],
      ["e", { name: "E" }],
    ]),
  });
  const picked = mod.pickDefaultStackTarget(targets, 2);
  assert.equal(picked?.displayId ?? picked?.kind, "e");
});
