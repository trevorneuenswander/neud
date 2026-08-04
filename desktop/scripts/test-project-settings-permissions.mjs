import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import {
  canAccessProject,
  canManageProjectSettings,
  normalizeProjectIsActive,
  resolveAuthenticatedProjectRole,
} from "../dist/projects/project-permissions.js";
import { LocalDataService } from "../dist/services/local-data-service.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { BagSourceService } from "../dist/services/bag-source-service.js";
import { GenericScraperService } from "../dist/services/generic-scraper-service.js";
import { PylonDisplayService } from "../dist/services/pylon-display-service.js";
import { LowerTickerDisplayService } from "../dist/services/lower-ticker-display-service.js";
import { BagLiveStateService } from "../dist/bag/live-state/bag-live-state-service.js";
import { BagLiveStateEvents } from "../dist/bag/live-state/bag-live-state-events.js";
import { BagLiveStateRepository } from "../dist/bag/live-state/bag-live-state-repository.js";
import { BagManualEventsRepository } from "../dist/bag/live-state/bag-manual-events-repository.js";
import { CredentialStore } from "../dist/services/credential-store.js";
import { ProjectDeletionService } from "../dist/services/project-deletion-service.js";
import { BagProjectRepairService } from "../dist/services/bag-project-repair-service.js";
import { BroadArrowPhaseBootstrapService } from "../dist/services/broad-arrow-phase-bootstrap-service.js";
import { LocalProjectMembershipsRepository } from "../dist/repositories/local-project-memberships-repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.credentialsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function createAuthStub(role) {
  return {
    isAccessAllowed: () => Boolean(role),
    getAuthenticatedUser: () =>
      role
        ? {
            userId: crypto.randomUUID(),
            email: "user@example.com",
            role,
          }
        : null,
    getStatus: () => ({
      role,
      allowed: Boolean(role),
    }),
    isPlatformAdmin: () => role === "owner" || role === "admin",
    canCreateProject: () => role === "admin" || role === "owner",
    canDeleteProject: () => role === "admin" || role === "owner",
  };
}

function createLocalDataService(db, paths, role) {
  const projects = new ProjectsRepository(db);
  const dataSources = new DataSourcesRepository(db);
  const displays = new DisplaysRepository(db);
  const settings = new AppSettingsRepository(db);
  const credentials = new CredentialStore(paths);
  const auth = createAuthStub(role);
  const memberships = new LocalProjectMembershipsRepository(db);
  const events = new BagLiveStateEvents();
  const bagLiveState = new BagLiveStateService(
    projects,
    dataSources,
    new BagLiveStateRepository(db),
    events,
    new BagManualEventsRepository(db),
  );
  const bagSources = new BagSourceService(dataSources, projects);
  const genericScraper = new GenericScraperService(dataSources, projects);
  const pylonDisplays = new PylonDisplayService(projects, displays, settings);
  const lowerTickerDisplays = new LowerTickerDisplayService(projects, displays, settings);
  const projectDeletion = new ProjectDeletionService(
    projects,
    dataSources,
    credentials,
    paths,
    auth,
    events,
  );
  const bagRepair = new BagProjectRepairService(
    projects,
    dataSources,
    bagSources,
    credentials,
    settings,
  );
  const broadArrowPhase = new BroadArrowPhaseBootstrapService(
    projects,
    dataSources,
    bagSources,
    settings,
    credentials,
    projectDeletion,
  );

  return new LocalDataService(
    projects,
    dataSources,
    displays,
    settings,
    bagSources,
    genericScraper,
    pylonDisplays,
    lowerTickerDisplays,
    bagLiveState,
    paths,
    auth,
    memberships,
    projectDeletion,
    bagRepair,
    broadArrowPhase,
    credentials,
  );
}

test("project permission helpers gate settings and inactive access", () => {
  assert.equal(canManageProjectSettings("owner"), true);
  assert.equal(canManageProjectSettings("admin"), true);
  assert.equal(canManageProjectSettings("operator"), false);
  assert.equal(canManageProjectSettings("viewer"), false);

  assert.equal(normalizeProjectIsActive({}), true);
  assert.equal(normalizeProjectIsActive({ is_active: 0 }), false);

  assert.equal(canAccessProject("operator", { is_active: true }), true);
  assert.equal(canAccessProject("operator", { is_active: false }), false);
  assert.equal(canAccessProject("admin", { is_active: false }), true);
  assert.equal(resolveAuthenticatedProjectRole({ role: "user" }), "operator");
});

test("owner can rename project and toggle inactive status", async () => {
  const paths = createTestPaths("settings-owner");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const service = createLocalDataService(db, paths, "owner");
    const created = projects.create({
      name: "Original Name",
      slug: "original-name",
      projectType: "webpage-scraper",
    });

    const updated = service.updateProjectSettings("original-name", {
      name: "Renamed Project",
      isActive: false,
    });

    assert.equal(updated.name, "Renamed Project");
    assert.equal(updated.is_active, false);
    assert.equal(projects.getById(created.id)?.name, "Renamed Project");
    assert.equal(projects.getById(created.id)?.isActive, false);
  } finally {
    closeLocalDatabase(db);
  }
});

test("operator cannot update project settings", async () => {
  const paths = createTestPaths("settings-operator");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const service = createLocalDataService(db, paths, "operator");
    projects.create({
      name: "Protected Project",
      slug: "protected-project",
      projectType: "webpage-scraper",
    });

    assert.throws(
      () =>
        service.updateProjectSettings("protected-project", {
          name: "New Name",
          isActive: true,
        }),
      /owners and admins/i,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("inactive projects are hidden from operator list queries", async () => {
  const paths = createTestPaths("settings-visibility");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const ownerService = createLocalDataService(db, paths, "owner");
    const operatorService = createLocalDataService(db, paths, "operator");

    projects.create({
      name: "Visible Project",
      slug: "visible-project",
      projectType: "webpage-scraper",
    });
    projects.create({
      name: "Hidden Project",
      slug: "hidden-project",
      projectType: "webpage-scraper",
    });
    ownerService.updateProjectSettings("hidden-project", {
      name: "Hidden Project",
      isActive: false,
    });

    const ownerProjects = ownerService.listProjects();
    const operatorProjects = operatorService.listProjects();
    const operatorMeta = operatorService.getProjectsListMeta();

    assert.equal(ownerProjects.length, 2);
    assert.equal(operatorProjects.length, 1);
    assert.equal(operatorProjects[0]?.slug, "visible-project");
    assert.equal(operatorMeta.filteringApplied, true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("operator receives null for inactive project slug lookup", async () => {
  const paths = createTestPaths("settings-slug-access");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const ownerService = createLocalDataService(db, paths, "owner");
    const operatorService = createLocalDataService(db, paths, "operator");

    projects.create({
      name: "Hidden Project",
      slug: "hidden-project",
      projectType: "webpage-scraper",
    });
    ownerService.updateProjectSettings("hidden-project", {
      name: "Hidden Project",
      isActive: false,
    });

    assert.ok(ownerService.getProjectBySlug("hidden-project"));
    assert.equal(operatorService.getProjectBySlug("hidden-project"), null);
  } finally {
    closeLocalDatabase(db);
  }
});

test("settings validation rejects empty project names", async () => {
  const paths = createTestPaths("settings-validation");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const service = createLocalDataService(db, paths, "admin");
    projects.create({
      name: "Named Project",
      slug: "named-project",
      projectType: "webpage-scraper",
    });

    assert.throws(
      () =>
        service.updateProjectSettings("named-project", {
          name: "   ",
          isActive: true,
        }),
      /Project name is required/i,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("settings page and nav require owner/admin access", () => {
  const settingsPage = readSrc("src/app/(portal)/projects/[slug]/settings/page.tsx");
  const nav = readSrc("src/components/projects/ProjectNav.tsx");
  const authorization = readSrc("src/lib/projects/authorization.ts");
  const form = readSrc("src/components/projects/ProjectSettingsForm.tsx");

  assert.ok(settingsPage.includes("requireProjectSettingsAccess"));
  assert.ok(settingsPage.includes("ProjectSettingsForm"));
  assert.ok(nav.includes("canManageSettings"));
  assert.ok(nav.includes("settingsOnly"));
  assert.ok(authorization.includes("requireProjectSettingsAccess"));
  assert.ok(form.includes('aria-label="Project active status"'));
  assert.ok(form.includes("Project name is required."));
});

test("project list status column shows active/inactive visibility", () => {
  const list = readSrc("src/components/projects/ProjectList.tsx");
  const badge = readSrc("src/components/projects/ProjectVisibilityBadge.tsx");

  assert.ok(list.includes("ProjectVisibilityBadge"));
  assert.ok(list.includes("projectListVisibility"));
  assert.ok(badge.includes('"Active"'));
  assert.ok(badge.includes('"Inactive"'));
  assert.ok(!list.includes("ProjectStatusBadge"));
});

test("activity panel uses layout effect for initial bottom scroll", () => {
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");

  assert.ok(panel.includes("useLayoutEffect"));
  assert.ok(panel.includes("hasInitialScrolledRef"));
  assert.ok(panel.includes("scrollActivityToBottom"));
  assert.ok(panel.includes("[slug]"));
});
