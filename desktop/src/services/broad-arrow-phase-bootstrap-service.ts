import {
  BAG_DEFAULT_MAX_DETAIL_CHECKS,
  BAG_DEFAULT_DETAILS_TTL_MS,
  BAG_DEFAULT_POLL_INTERVAL_MS,
  BAG_LOGIN_CONFIG,
  isUnsetBagPollInterval,
} from "../bag/default-sources";
import {
  BROAD_ARROW_CANONICAL_PROJECT,
  BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING,
  BROAD_ARROW_PHASE_SETTING_KEY,
  readBroadArrowEnvironmentUrls,
} from "../bag/broad-arrow-phase";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { BagSourceService } from "./bag-source-service";
import type { CredentialStore } from "./credential-store";
import type { ProjectDeletionService } from "./project-deletion-service";

export type BroadArrowPhaseBootstrapResult = {
  bootstrapped: boolean;
  repaired: boolean;
  projectId?: string;
  projectSlug: string;
  engineId?: string;
  deletedProjectCount: number;
  credentialsSeeded: boolean;
  urlsApplied: string[];
};

export class BroadArrowPhaseBootstrapService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly bagSources: BagSourceService,
    private readonly settings: AppSettingsRepository,
    private readonly credentials: CredentialStore,
    private readonly projectDeletion: ProjectDeletionService,
  ) {}

  ensureBroadArrowDevelopmentPhase(
    localApiBaseUrl: string,
  ): BroadArrowPhaseBootstrapResult {
    const phaseComplete =
      this.settings.get<string>(BROAD_ARROW_PHASE_SETTING_KEY, "") === "complete";
    const canonical = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);

    if (phaseComplete && canonical) {
      const engine = this.dataSources.ensureWebpageScraper(
        canonical.id,
        BROAD_ARROW_CANONICAL_PROJECT.projectType,
      );
      this.bagSources.ensureBagScraperSources(engine.id);
      const urlsApplied = this.applyEnvironmentUrls(engine.id);
      const credentialsSeeded = this.credentials.seedFromEnvironment(engine.id);
      this.ensureEngineSettings(engine.id);
      this.ensureLoginConfig(engine.id);
      this.settings.set(
        BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING,
        BROAD_ARROW_CANONICAL_PROJECT.slug,
      );

      return {
        bootstrapped: false,
        repaired: true,
        projectId: canonical.id,
        projectSlug: BROAD_ARROW_CANONICAL_PROJECT.slug,
        engineId: engine.id,
        deletedProjectCount: 0,
        credentialsSeeded,
        urlsApplied,
      };
    }

    const existingProjects = this.projects.list();
    let deletedProjectCount = 0;

    for (const project of existingProjects) {
      const result = this.projectDeletion.deleteProjectInternal({
        projectId: project.id,
      });
      if (result.ok) {
        deletedProjectCount += 1;
      }
    }

    const project = this.projects.create({
      name: BROAD_ARROW_CANONICAL_PROJECT.name,
      slug: BROAD_ARROW_CANONICAL_PROJECT.slug,
      projectType: BROAD_ARROW_CANONICAL_PROJECT.projectType,
      description:
        "Broad Arrow auction graphics powered by the BAG auction scraper.",
      icon: "bag",
    });

    const engine = this.dataSources.ensureWebpageScraper(
      project.id,
      BROAD_ARROW_CANONICAL_PROJECT.projectType,
    );
    this.bagSources.ensureBagScraperSources(engine.id);
    const urlsApplied = this.applyEnvironmentUrls(engine.id);
    const credentialsSeeded = this.credentials.seedFromEnvironment(engine.id);
    this.ensureEngineSettings(engine.id);
    this.ensureLoginConfig(engine.id);

    this.settings.set(BROAD_ARROW_PHASE_SETTING_KEY, "complete");
    this.settings.set(
      BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING,
      BROAD_ARROW_CANONICAL_PROJECT.slug,
    );

    return {
      bootstrapped: true,
      repaired: false,
      projectId: project.id,
      projectSlug: BROAD_ARROW_CANONICAL_PROJECT.slug,
      engineId: engine.id,
      deletedProjectCount,
      credentialsSeeded,
      urlsApplied,
    };
  }

  getDefaultProjectSlug(): string {
    return (
      this.settings.get<string>(
        BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING,
        BROAD_ARROW_CANONICAL_PROJECT.slug,
      ) || BROAD_ARROW_CANONICAL_PROJECT.slug
    );
  }

  private applyEnvironmentUrls(engineId: string): string[] {
    const envUrls = readBroadArrowEnvironmentUrls();
    const applied: string[] = [];
    const sources = this.dataSources.listSources(engineId, true);

    const updates: Array<{ sourceKey: string; url: string }> = [];
    if (envUrls.vehicles) {
      updates.push({ sourceKey: "vehicles", url: envUrls.vehicles });
    }
    if (envUrls.login) {
      updates.push({ sourceKey: "login", url: envUrls.login });
    }
    if (envUrls.auctionDisplay) {
      updates.push({ sourceKey: "auction-display", url: envUrls.auctionDisplay });
    }

    for (const update of updates) {
      const source = sources.find((entry) => entry.sourceKey === update.sourceKey);
      if (!source || source.url === update.url) {
        continue;
      }

      this.dataSources.saveSource(engineId, {
        id: source.id,
        name: source.name,
        sourceKey: source.sourceKey,
        url: update.url,
        pageType: source.pageType,
        enabled: source.enabled,
        position: source.position,
      });
      applied.push(update.sourceKey);
    }

    return applied;
  }

  private ensureEngineSettings(engineId: string): void {
    const current = this.dataSources.getSettings(engineId);
    if (!current) return;

    this.dataSources.updateSettings(engineId, {
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
    });
  }

  private ensureLoginConfig(engineId: string): void {
    const engine = this.dataSources.getById(engineId);
    if (!engine) return;

    const existingLogin = engine.config.login;
    if (
      existingLogin &&
      typeof existingLogin === "object" &&
      !Array.isArray(existingLogin)
    ) {
      return;
    }

    this.dataSources.updateConfig(engineId, {
      ...engine.config,
      login: { ...BAG_LOGIN_CONFIG },
    });
  }
}
