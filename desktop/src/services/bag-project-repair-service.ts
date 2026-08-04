import {
  BAG_DEFAULT_MAX_DETAIL_CHECKS,
  BAG_DEFAULT_DETAILS_TTL_MS,
  BAG_DEFAULT_POLL_INTERVAL_MS,
  BAG_LOGIN_CONFIG,
  isUnsetBagPollInterval,
} from "../bag/default-sources";
import type { CredentialStore } from "./credential-store";
import type { BagSourceService } from "./bag-source-service";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { ProjectsRepository, LocalProject } from "../repositories/projects-repository";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";

const BROAD_ARROW_NAME_PATTERN = /broad\s*arrow/i;
const BROAD_ARROW_SLUG_PATTERN = /broad-arrow/i;
const CREDENTIAL_MIGRATION_FLAG_PREFIX = "bag.credential_migrated.";

export type BroadArrowRepairResult = {
  found: boolean;
  projectId?: string;
  projectSlug?: string;
  engineId?: string;
  sourcesCreated: string[];
  sourcesRepaired: string[];
  settingsUpdated: boolean;
  loginConfigUpdated: boolean;
  credentialsMigrated: boolean;
};

export class BagProjectRepairService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly bagSources: BagSourceService,
    private readonly credentials: CredentialStore,
    private readonly settings: AppSettingsRepository,
  ) {}

  findBroadArrowProject(): LocalProject | null {
    const bagProjects = this.projects
      .list()
      .filter((project) => project.projectType === "bag-graphics");

    const namedMatch = bagProjects.find(
      (project) =>
        BROAD_ARROW_NAME_PATTERN.test(project.name) ||
        BROAD_ARROW_SLUG_PATTERN.test(project.slug),
    );
    if (namedMatch) {
      return namedMatch;
    }

    return bagProjects[0] ?? null;
  }

  repairBroadArrowConfiguration(): BroadArrowRepairResult {
    const project = this.findBroadArrowProject();
    if (!project) {
      return {
        found: false,
        sourcesCreated: [],
        sourcesRepaired: [],
        settingsUpdated: false,
        loginConfigUpdated: false,
        credentialsMigrated: false,
      };
    }

    const engine = this.dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    const sourceResult = this.bagSources.ensureBagScraperSources(engine.id);
    const settingsUpdated = this.ensureBagScraperSettings(engine.id);
    const loginConfigUpdated = this.ensureBagLoginConfig(engine.id);
    const credentialsMigrated = this.migrateCredentialsOnce(engine.id);

    return {
      found: true,
      projectId: project.id,
      projectSlug: project.slug,
      engineId: engine.id,
      sourcesCreated: sourceResult.created,
      sourcesRepaired: sourceResult.repaired,
      settingsUpdated,
      loginConfigUpdated,
      credentialsMigrated,
    };
  }

  repairEngineIfBroadArrow(engineId: string): BroadArrowRepairResult | null {
    const engine = this.dataSources.getById(engineId);
    if (!engine) return null;

    const project = this.projects.getById(engine.projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }

    const broadArrow = this.findBroadArrowProject();
    if (!broadArrow || broadArrow.id !== project.id) {
      return null;
    }

    return this.repairBroadArrowConfiguration();
  }

  private ensureBagScraperSettings(engineId: string): boolean {
    const current = this.dataSources.getSettings(engineId);
    if (!current) return false;

    const next = {
      pollIntervalMs: isUnsetBagPollInterval(current.pollIntervalMs)
        ? BAG_DEFAULT_POLL_INTERVAL_MS
        : current.pollIntervalMs,
      detailsTtlMs:
        current.detailsTtlMs > 0
          ? current.detailsTtlMs
          : BAG_DEFAULT_DETAILS_TTL_MS,
      maxDetailChecksPerPoll:
        current.maxDetailChecksPerPoll === 3
          ? BAG_DEFAULT_MAX_DETAIL_CHECKS
          : current.maxDetailChecksPerPoll > 0
            ? current.maxDetailChecksPerPoll
            : BAG_DEFAULT_MAX_DETAIL_CHECKS,
      headless: current.headless,
    };

    const changed =
      next.pollIntervalMs !== current.pollIntervalMs ||
      next.detailsTtlMs !== current.detailsTtlMs ||
      next.maxDetailChecksPerPoll !== current.maxDetailChecksPerPoll;

    if (changed) {
      this.dataSources.updateSettings(engineId, next);
    }

    return changed;
  }

  private ensureBagLoginConfig(engineId: string): boolean {
    const engine = this.dataSources.getById(engineId);
    if (!engine) return false;

    const existingLogin = engine.config.login;
    if (
      existingLogin &&
      typeof existingLogin === "object" &&
      !Array.isArray(existingLogin)
    ) {
      return false;
    }

    this.dataSources.updateConfig(engineId, {
      ...engine.config,
      login: { ...BAG_LOGIN_CONFIG },
    });
    return true;
  }

  private migrateCredentialsOnce(engineId: string): boolean {
    const flagKey = `${CREDENTIAL_MIGRATION_FLAG_PREFIX}${engineId}`;
    if (this.settings.get<string>(flagKey, "") === "true") {
      return false;
    }

    if (this.credentials.hasCredentials(engineId)) {
      this.settings.set(flagKey, "true");
      return false;
    }

    const migrated = this.credentials.migrateEnvCredentialsOnce(engineId);
    if (migrated) {
      this.settings.set(flagKey, "true");
      this.dataSources.insertLog(engineId, {
        level: "info",
        eventType: "bag.credentials.migrated",
        message: "Legacy environment credentials were migrated into secure storage.",
        metadata: { migrated: true },
      });
    }

    return migrated;
  }
}
