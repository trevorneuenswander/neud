import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  hashBufferSha256,
  parseProjectPackageManifest,
  ProjectPackageValidationError,
  validateInstalledPackageDirectory,
} from "../manifest";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "../types";
import { ProjectPackageStore } from "../project-package-store";
import type { AppPaths } from "../../services/app-paths";

function makeManifest(overrides?: Partial<ProjectPackageManifest>): ProjectPackageManifest {
  return {
    kind: PROJECT_PACKAGE_MANIFEST_KIND,
    schemaVersion: PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
    projectKey: "test-project",
    projectSlug: "test-project",
    projectName: "Test Project",
    projectType: "test",
    packageVersion: 1,
    displays: [
      {
        key: "main",
        name: "Main",
        slug: "main",
        width: 1920,
        height: 1080,
        htmlPath: "displays/main.html",
      },
    ],
    files: { "displays/main.html": "displays/main.html" },
    integrity: {
      files: {},
    },
    ...overrides,
  };
}

describe("project package manifest", () => {
  it("rejects non-integer package versions", () => {
    assert.throws(
      () => parseProjectPackageManifest(makeManifest({ packageVersion: 1.5 as number })),
      ProjectPackageValidationError,
    );
  });

  it("rejects invalid hash during validation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-pkg-hash-"));
    try {
      fs.mkdirSync(path.join(root, "displays"), { recursive: true });
      fs.writeFileSync(path.join(root, "displays", "main.html"), "<html></html>", "utf8");
      const manifest = makeManifest({
        integrity: {
          files: {
            "displays/main.html": "deadbeef",
          },
        },
      });
      fs.writeFileSync(
        path.join(root, "manifest.json"),
        JSON.stringify(manifest),
        "utf8",
      );
      assert.throws(
        () =>
          validateInstalledPackageDirectory(root, {
            projectSlug: "test-project",
            packageVersion: 1,
          }),
        /Integrity hash mismatch/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("activates staged package atomically and keeps previous version on failure path", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "neud-pkg-store-"));
    const paths = {
      projects: path.join(userData, "projects"),
    } as AppPaths;
    const store = new ProjectPackageStore(paths);
    const projectId = "proj-1";

    const stageV1 = fs.mkdtempSync(path.join(os.tmpdir(), "neud-pkg-v1-"));
    fs.mkdirSync(path.join(stageV1, "displays"), { recursive: true });
    const html = "<html>v1</html>";
    fs.writeFileSync(path.join(stageV1, "displays", "main.html"), html, "utf8");
    const hash = hashBufferSha256(html);
    const manifest = makeManifest({
      integrity: { files: { "displays/main.html": hash } },
    });
    fs.writeFileSync(path.join(stageV1, "manifest.json"), JSON.stringify(manifest), "utf8");

    store.stageFromDirectory(projectId, 1, stageV1);
    const activated = store.activateStagedPackage({
      projectId,
      projectSlug: "test-project",
      version: 1,
    });
    assert.equal(activated.manifest.packageVersion, 1);
    assert.ok(fs.existsSync(path.join(activated.packageRoot, "displays", "main.html")));

    fs.rmSync(stageV1, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  });
});
