import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("projects list removes access/actions columns and project numbers", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");

  assert.ok(!list.includes("ProjectAccessBadge"));
  assert.ok(!list.includes("ProjectDeleteMenu"));
  assert.ok(!list.includes("Open Project"));
  assert.ok(!list.includes("formatProjectNumber"));
  assert.ok(list.includes("Last Updated"));
  assert.ok(list.includes("href={`/projects/${project.slug}`}"));
});

test("projects list shows Webpage Scraper for bag-graphics", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.ok(list.includes('projectType === "bag-graphics"'));
  assert.ok(list.includes('"Webpage Scraper"'));
});

test("projects list columns are Project, Data Type, Status, Last Updated", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.ok(list.includes(">Project<"));
  assert.ok(list.includes(">Data Type<"));
  assert.ok(list.includes(">Status<"));
  assert.ok(list.includes(">Last Updated<"));
  assert.ok(!list.includes(">Access<"));
  assert.ok(!list.includes(">Actions<"));
});

test("desktop table rows navigate to project detail", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.ok(list.includes("useRouter"));
  assert.ok(list.includes("router.push(`/projects/${project.slug}`)"));
});

test("data source selector typography matches last poll status", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  const lastPoll = readSrc("src/components/projects/ProjectLastPollStatus.tsx");
  assert.ok(selector.includes("text-sm text-muted"));
  assert.ok(selector.includes("text-sm font-medium"));
  assert.ok(lastPoll.includes("text-sm text-foreground"));
});
