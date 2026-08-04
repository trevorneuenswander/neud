import type { AppPaths } from "./app-paths";
import type { CredentialStore } from "./credential-store";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { EngineManager } from "./engine-manager";
import { hasPersistedSessionCookies } from "./engine-session-auth";

export type ProjectScraperCredentials = {
  email: string;
  password: string;
};

export type BroadArrowCredentials = ProjectScraperCredentials;

export const MISSING_SCRAPER_CREDENTIALS_MESSAGE =
  "Webpage Scraper credentials are required before downloading the Current Webpage.";

export const BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE =
  "Auction credentials are required before downloading the Current Webpage.";

export const CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE =
  "Saved Webpage Scraper credentials could not be resolved for the downloader.";

export class MissingScraperCredentialsError extends Error {
  readonly code = "missing-scraper-credentials";

  constructor(message = MISSING_SCRAPER_CREDENTIALS_MESSAGE) {
    super(message);
    this.name = "MissingScraperCredentialsError";
  }
}

export function isMissingScraperCredentialsError(
  error: unknown,
): error is MissingScraperCredentialsError {
  return (
    error instanceof MissingScraperCredentialsError ||
    (error instanceof Error && error.message === MISSING_SCRAPER_CREDENTIALS_MESSAGE)
  );
}

export function resolveProjectWebpageScraperEngineId(
  dataSources: DataSourcesRepository,
  projectId: string,
): string | null {
  const engines = dataSources.listByProject(projectId);
  const webpageScraper = engines.find(
    (engine) =>
      engine.sourceType === "webpage-scraper" || engine.sourceKey === "webpage-scraper",
  );
  return webpageScraper?.id ?? null;
}

export function getProjectWebpageScraperCredentials(
  credentials: CredentialStore,
  engineId: string,
): ProjectScraperCredentials | null {
  return credentials.getCredentialsForWorker(engineId);
}

export function getBroadArrowCredentialsForProject(input: {
  credentials: CredentialStore;
  dataSources: DataSourcesRepository;
  projectId: string;
}): BroadArrowCredentials | null {
  const engineId = resolveProjectWebpageScraperEngineId(
    input.dataSources,
    input.projectId,
  );
  if (!engineId) {
    return null;
  }
  return getProjectWebpageScraperCredentials(input.credentials, engineId);
}

export function resolveBroadArrowExportEngineId(input: {
  dataSources: DataSourcesRepository;
  projectId: string;
}): string | null {
  return resolveProjectWebpageScraperEngineId(input.dataSources, input.projectId);
}

export function hasProjectScraperRunnableAuth(
  credentials: CredentialStore,
  paths: AppPaths,
  engineId: string,
): boolean {
  return credentials.hasRunnableAuth(engineId) || hasPersistedSessionCookies(paths, engineId);
}

export function canRunAuthenticatedComprehensiveExport(input: {
  credentials: CredentialStore;
  paths: AppPaths;
  engineId: string;
  engineManager?: EngineManager | null;
}): boolean {
  if (input.engineManager?.hasAuthenticatedExportContext(input.engineId)) {
    return true;
  }
  return hasProjectScraperRunnableAuth(input.credentials, input.paths, input.engineId);
}

export function assertComprehensiveExportAuthentication(input: {
  credentials: CredentialStore;
  paths: AppPaths;
  engineId: string;
  engineManager?: EngineManager | null;
}): void {
  if (canRunAuthenticatedComprehensiveExport(input)) {
    return;
  }
  throw new MissingScraperCredentialsError();
}
