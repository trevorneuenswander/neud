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
  assert.ok(list.includes("buildProjectLandingHref"));
});

test("projects list does not show Unassigned under project name", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.doesNotMatch(list, /Unassigned/i);
});

test("projects list columns are Project, Team, Status, Last Updated", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.ok(list.includes(">Project<"));
  assert.ok(list.includes(">Team<"));
  assert.ok(list.includes(">Status<"));
  assert.ok(list.includes(">Last Updated<"));
  assert.ok(!list.includes(">Data Type<"));
  assert.ok(!list.includes(">Access<"));
  assert.ok(!list.includes(">Actions<"));
});

test("projects list team column uses comma-separated team names from project.teams", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.match(list, /formatProjectTeamNames/);
  assert.match(list, /project\.teams/);
  assert.match(list, /\.join\(", "\)/);
});

test("project list teams hydrate from project_team_assignments on hosted portal", () => {
  const queries = readSrc("src/lib/projects/queries.ts");
  assert.match(queries, /attachProjectTeamNames/);
  assert.match(queries, /project_team_assignments/);
  assert.match(queries, /from\("teams"\)/);
});

test("desktop listProjects resolves team labels from cloud directory when local team row missing", () => {
  const auth = readSrc("desktop/src/services/access-authorization-service.ts");
  const sync = readSrc("desktop/src/services/cloud-access-local-sync.ts");
  assert.match(auth, /resolveProjectTeamLabel/);
  assert.match(auth, /resolveCloudProjectTeamIds/);
  assert.match(sync, /getBySlug/);
  assert.match(sync, /cloudProjects/);
});

test("desktop table rows navigate to project detail", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  assert.ok(list.includes("useRouter"));
  assert.ok(list.includes("buildProjectLandingHref(project.slug, viewerMode)"));
});

test("data source selector typography matches last poll status", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  const lastPoll = readSrc("src/components/projects/ProjectLastPollStatus.tsx");
  assert.ok(selector.includes("text-sm text-muted"));
  assert.ok(selector.includes("text-sm font-medium"));
  assert.ok(lastPoll.includes("text-sm text-foreground"));
});
