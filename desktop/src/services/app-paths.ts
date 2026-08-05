import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import { migrateLegacyDatabaseFile } from "./database-rename-migration";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";

export type AppPaths = {
  root: string;
  data: string;
  databaseFile: string;
  backups: string;
  projects: string;
  assets: string;
  displays: string;
  controllers: string;
  publishing: string;
  exports: string;
  config: string;
  logs: string;
  engineLogs: string;
  engines: string;
  browserData: string;
  browserProfiles: string;
  cookies: string;
  cache: string;
  downloads: string;
  serverEnvFile: string;
  hostFile: string;
  credentialsDir: string;
  authCacheFile: string;
  supabaseUserSessionFile: string;
  repoRoot: string;
};

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function getRepoRoot(): string {
  if (isPackagedDesktopRuntime()) {
    return path.join(process.resourcesPath, "staging");
  }

  return path.resolve(__dirname, "..", "..", "..");
}

function resolveDatabaseFile(dataDir: string): string {
  return path.join(dataDir, "neud.sqlite");
}

export function getAppPaths(): AppPaths {
  const root = path.join(app.getPath("userData"));
  const dataDir = path.join(root, "data");
  const backupsDir = path.join(root, "data", "backups");

  migrateLegacyDatabaseFile({ dataDir, backupsDir });

  const paths: AppPaths = {
    root,
    data: dataDir,
    databaseFile: resolveDatabaseFile(dataDir),
    backups: backupsDir,
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
    supabaseUserSessionFile: path.join(root, "config", "supabase-user-session.enc"),
    repoRoot: getRepoRoot(),
  };

  for (const dir of [
    paths.data,
    paths.backups,
    paths.projects,
    paths.assets,
    paths.displays,
    paths.controllers,
    paths.publishing,
    paths.exports,
    paths.config,
    paths.logs,
    paths.engineLogs,
    paths.engines,
    paths.browserData,
    paths.browserProfiles,
    paths.cookies,
    paths.cache,
    paths.downloads,
    paths.credentialsDir,
  ]) {
    ensureDir(dir);
  }

  return paths;
}

export function getWorkerEntryPath(paths: AppPaths): string {
  if (isPackagedDesktopRuntime()) {
    return path.join(process.resourcesPath, "staging", "worker", "dist", "boot.js");
  }

  return path.join(paths.repoRoot, "workers", "data-engine", "src", "boot.js");
}

export function getWorkerCwd(paths: AppPaths): string {
  if (isPackagedDesktopRuntime()) {
    return path.join(process.resourcesPath, "staging", "worker");
  }

  return path.join(paths.repoRoot, "workers", "data-engine");
}

export function getHostname(): string {
  return os.hostname();
}
