import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractNavLabels(source) {
  return [...source.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
}

test("project activity route renders full activity view", () => {
  const activityPage = readSrc("src/app/(portal)/projects/[slug]/activity/page.tsx");
  const projectNav = readSrc("src/components/projects/ProjectNav.tsx");
  const navigation = readSrc("src/lib/portal/navigation.ts");
  const caps = readSrc("src/lib/projects/capabilities.ts");

  assert.ok(activityPage.includes("ProjectActivityFullView"));
  assert.ok(!activityPage.includes("redirect("));
  // Project Activity nav is removed for SEMA and Broad Arrow; global Activity remains.
  assert.doesNotMatch(projectNav, /href: "\/activity"/);
  assert.match(projectNav, /\/google-sheet/);
  assert.match(caps, /moduleLabel: "Data Source"/);
  assert.match(caps, /moduleLabel: "Manual Controller"/);
  assert.doesNotMatch(projectNav, /href: "\/activity"[^\n]*bagOrSema/);
  assert.ok(!navigation.includes('pathname.endsWith("/activity")'));
});

test("members is absent from project navigation surfaces", () => {
  const projectNav = readSrc("src/components/projects/ProjectNav.tsx");
  const navigation = readSrc("src/lib/portal/navigation.ts");
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!projectNav.includes("/members"));
  assert.ok(!navigation.includes("/members"));
  assert.ok(!overview.includes("Members"));
  assert.equal(
    existsSync(path.join(repoRoot, "src/app/(portal)/projects/[slug]/members/page.tsx")),
    false,
  );
});

test("plural controllers is absent from project navigation surfaces", () => {
  const projectNav = readSrc("src/components/projects/ProjectNav.tsx");
  const navigation = readSrc("src/lib/portal/navigation.ts");
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!projectNav.includes('href: "/controllers"'));
  assert.ok(!projectNav.includes('label: "Controllers"'));
  assert.ok(!navigation.includes('return "Controllers"'));
  assert.ok(!overview.includes('label="Controllers"'));
  assert.equal(
    existsSync(path.join(repoRoot, "src/app/(portal)/projects/[slug]/controllers/page.tsx")),
    false,
  );
});

test("manual controller appears exactly once and singular controller route remains", () => {
  const projectNav = readSrc("src/components/projects/ProjectNav.tsx");
  const navigation = readSrc("src/lib/portal/navigation.ts");
  const capabilities = readSrc("src/lib/projects/capabilities.ts");
  const controllerClient = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const labels = extractNavLabels(projectNav);

  assert.equal(labels.filter((label) => label === "Local Controller").length, 0);
  assert.match(capabilities, /moduleLabel: "Manual Controller"/);
  assert.ok(!labels.includes("Controller"));
  assert.ok(!labels.includes("Controllers"));
  assert.match(projectNav, /\/controller/);
  assert.ok(navigation.includes('return "Manual Controller"'));
  assert.ok(controllerClient.includes('title="Manual Controller"'));
  assert.equal(
    existsSync(path.join(repoRoot, "src/app/(portal)/projects/[slug]/controller/page.tsx")),
    true,
  );
});

test("removed members-only table component is not referenced", () => {
  const membersTablePath = path.join(
    repoRoot,
    "src/components/projects/ProjectMembersTable.tsx",
  );

  assert.equal(existsSync(membersTablePath), false);

  for (const relativePath of [
    "src/components/projects/ProjectNav.tsx",
    "src/components/projects/ProjectOverview.tsx",
    "src/app/(portal)/projects/[slug]/page.tsx",
  ]) {
    const source = readSrc(relativePath);
    assert.ok(!source.includes("ProjectMembersTable"));
    assert.ok(!source.includes("/members"));
  }
});
