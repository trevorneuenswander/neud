import test from "node:test";
import assert from "node:assert/strict";
import {
  isShellStartupPath,
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

test("normalizeStartupPath rejects display output routes without portal shell", () => {
  assert.equal(
    isShellStartupPath(
      "/display/8526be86-4f8a-4522-8506-efa8a25fe903/stream-bid-display",
    ),
    false,
  );
  assert.equal(
    normalizeStartupPath(
      "/display/8526be86-4f8a-4522-8506-efa8a25fe903/stream-bid-display",
    ),
    "/",
  );
  assert.equal(
    resolveDesktopStartupPath({
      savedPath:
        "/display/8526be86-4f8a-4522-8506-efa8a25fe903/stream-bid-display",
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
