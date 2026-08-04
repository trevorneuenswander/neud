import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { LocalProjectMembershipsRepository } from "../dist/repositories/local-project-memberships-repository.js";
import { LocalAuthBootstrapService } from "../dist/services/local-auth-bootstrap-service.js";
import {
  LOCAL_DESKTOP_IDENTITY_SETTING_KEY,
  LEGACY_LOCAL_DESKTOP_IDENTITY_SETTING_KEY,
  getOrCreateLocalDesktopIdentity,
} from "../dist/auth/local-desktop-identity.js";
import { LocalSessionTokenService } from "../dist/auth/local-session-token.js";
import { LOCAL_API_ERROR_CODES } from "../dist/auth/local-api-errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-local-auth-${name}-${suffix}`);
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
    repoRoot: path.resolve(__dirname, "../.."),
  };

  for (const dir of [
    paths.data,
    paths.backups,
    paths.config,
    paths.logs,
    paths.credentialsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function seedProject(db, projectId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, name, slug, project_type, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(projectId, "Broad Arrow", "broad-arrow-auctions", "bag-graphics", now, now);
}

test("local desktop identity persists across bootstrap runs", async () => {
  const paths = createTestPaths("identity");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const first = getOrCreateLocalDesktopIdentity(settings);
    const second = getOrCreateLocalDesktopIdentity(settings);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.identity.userId, second.identity.userId);
    assert.equal(first.identity.isLocalDesktopUser, true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("legacy local identity migrates to neud.localIdentity", async () => {
  const paths = createTestPaths("legacy-identity");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const legacyIdentity = {
      userId: crypto.randomUUID(),
      email: "legacy@neud.desktop",
      displayName: "Legacy Owner",
      isLocalDesktopUser: true,
    };
    settings.set(LEGACY_LOCAL_DESKTOP_IDENTITY_SETTING_KEY, legacyIdentity);

    const { identity, created } = getOrCreateLocalDesktopIdentity(settings);
    assert.equal(created, false);
    assert.equal(identity.userId, legacyIdentity.userId);
    assert.deepEqual(settings.get(LOCAL_DESKTOP_IDENTITY_SETTING_KEY), legacyIdentity);
  } finally {
    closeLocalDatabase(db);
  }
});

function createBootstrapAuthStub() {
  let allowed = false;
  let user = null;

  return {
    isAccessAllowed: () => allowed,
    getDeviceId: () => "test-device",
    establishLocalDesktopSession(input) {
      allowed = true;
      user = input;
      return input;
    },
    getAuthenticatedUser: () => user,
    getStatus: () => ({
      role: user?.role ?? null,
      allowed,
    }),
  };
}

test("legacy owner membership migration is idempotent", async () => {
  const paths = createTestPaths("membership");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const projects = new ProjectsRepository(db);
    const memberships = new LocalProjectMembershipsRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, projectId);

    const auth = createBootstrapAuthStub();
    const bootstrap = new LocalAuthBootstrapService(
      settings,
      projects,
      memberships,
      auth,
      paths,
      "test-device",
    );

    const first = bootstrap.ensure();
    const second = bootstrap.ensure();

    assert.equal(first.createdMembershipCount, 1);
    assert.equal(second.createdMembershipCount, 1);
    assert.equal(first.identity.userId, second.identity.userId);
    assert.equal(memberships.countForUser(first.identity.userId), 1);
    assert.equal(
      memberships.getProjectRole(first.identity.userId, projectId),
      "owner",
    );
    assert.equal(auth.isAccessAllowed(), true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("local session token validates and publishes session config", async () => {
  const paths = createTestPaths("session");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const projects = new ProjectsRepository(db);
    const memberships = new LocalProjectMembershipsRepository(db);
    const auth = createBootstrapAuthStub();
    const bootstrap = new LocalAuthBootstrapService(
      settings,
      projects,
      memberships,
      auth,
      paths,
      "test-device",
    );
    bootstrap.ensure();

    const tokens = bootstrap.getSessionTokenService();
    const { token } = tokens.getOrCreateToken();
    assert.equal(tokens.validate(token), true);
    assert.equal(tokens.validate(`${token}-invalid`), false);

    bootstrap.publishSessionConfig("http://127.0.0.1:8070");
    const configPath = tokens.getSessionConfigPath();
    assert.equal(fs.existsSync(configPath), true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.baseUrl, "http://127.0.0.1:8070");
    assert.equal(config.sessionToken, token);
    assert.ok(typeof config.userId === "string" && config.userId.length > 0);
  } finally {
    closeLocalDatabase(db);
  }
});

test("local API error codes are stable", () => {
  assert.equal(LOCAL_API_ERROR_CODES.AUTH_REQUIRED, "AUTH_REQUIRED");
  assert.equal(LOCAL_API_ERROR_CODES.FORBIDDEN, "FORBIDDEN");
  assert.equal(LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND, "PROJECT_NOT_FOUND");
});

test("session token service rejects arbitrary renderer tokens", async () => {
  const paths = createTestPaths("reject-token");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const tokens = new LocalSessionTokenService(settings, paths, "test-secret");
    tokens.getOrCreateToken();
    assert.equal(tokens.validate("forged.token.value"), false);
  } finally {
    closeLocalDatabase(db);
  }
});
