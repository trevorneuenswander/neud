import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateStartupPath,
  normalizeStartupPath,
  resolveDesktopStartupPath,
  resolveVerifiedProjectStartupPath,
} from "../dist/services/startup-route.js";

test("normalizeStartupPath rejects external URLs", () => {
  assert.equal(
    normalizeStartupPath("https://example.com/projects"),
    "/",
  );
});

test("normalizeStartupPath migrates removed HMG-era routes", () => {
  assert.equal(normalizeStartupPath("/overview"), "/projects");
  assert.equal(normalizeStartupPath("/hmg-graphics-server"), "/projects");
  assert.equal(
    normalizeStartupPath("/projects/hmg-graphics-server"),
    "/projects",
  );
});

test("normalizeStartupPath migrates removed project subroutes", () => {
  assert.equal(
    migrateStartupPath("/projects/demo/controllers"),
    "/projects/demo",
  );
  assert.equal(
    migrateStartupPath("/projects/demo/members"),
    "/projects/demo",
  );
});

test("resolveDesktopStartupPath prefers saved route over preferred route", () => {
  assert.equal(
    resolveDesktopStartupPath({
      savedPath: "/projects/demo/settings",
      preferredPath: "/projects/broad-arrow-auctions/data-engines",
    }),
    "/projects/demo/settings",
  );
});

test("resolveDesktopStartupPath uses verified preferred route on first launch", () => {
  assert.equal(
    resolveDesktopStartupPath({
      savedPath: null,
      preferredPath: "/projects/broad-arrow-auctions/data-engines",
    }),
    "/projects/broad-arrow-auctions/data-engines",
  );
});

test("resolveVerifiedProjectStartupPath falls back to projects list", () => {
  assert.equal(
    resolveVerifiedProjectStartupPath({
      defaultProjectSlug: "missing-project",
      projectExists: () => false,
    }),
    "/projects",
  );
});
