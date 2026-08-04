import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "./env.mjs";

const REGISTRY_FILENAME = "validation-fixture-registry.json";

function registryPath(repoRoot = getRepoRoot(import.meta.url)) {
  return path.join(repoRoot, "docs", REGISTRY_FILENAME);
}

function readRegistry(repoRoot) {
  const filePath = registryPath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return { fixtures: [], updatedAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { fixtures: [], updatedAt: null };
  }
}

function writeRegistry(repoRoot, registry) {
  const filePath = registryPath(repoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        ...registry,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function registerValidationFixture(
  { fixtureId, fixtureType, script },
  repoRoot = getRepoRoot(import.meta.url),
) {
  if (!fixtureId || !fixtureType || !script) {
    return;
  }

  const registry = readRegistry(repoRoot);
  const existing = registry.fixtures.find(
    (entry) => entry.fixture_id === fixtureId && entry.fixture_type === fixtureType,
  );
  if (!existing) {
    registry.fixtures.push({
      fixture_id: fixtureId,
      fixture_type: fixtureType,
      script,
      created_at: new Date().toISOString(),
    });
    writeRegistry(repoRoot, registry);
  }
}

export function unregisterValidationFixtures(fixtureIds, repoRoot = getRepoRoot(import.meta.url)) {
  const ids = new Set(fixtureIds.filter(Boolean));
  if (ids.size === 0) {
    return;
  }
  const registry = readRegistry(repoRoot);
  registry.fixtures = registry.fixtures.filter((entry) => !ids.has(entry.fixture_id));
  writeRegistry(repoRoot, registry);
}

export function listValidationFixtures(
  { fixtureType } = {},
  repoRoot = getRepoRoot(import.meta.url),
) {
  const registry = readRegistry(repoRoot);
  if (!fixtureType) {
    return registry.fixtures;
  }
  return registry.fixtures.filter((entry) => entry.fixture_type === fixtureType);
}

export function clearValidationFixturesForScript(script, repoRoot = getRepoRoot(import.meta.url)) {
  const registry = readRegistry(repoRoot);
  registry.fixtures = registry.fixtures.filter((entry) => entry.script !== script);
  writeRegistry(repoRoot, registry);
}

export { REGISTRY_FILENAME, registryPath };
