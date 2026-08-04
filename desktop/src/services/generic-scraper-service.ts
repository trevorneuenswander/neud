import {
  isExactBagDefaultSource,
  isValidScraperSourceUrl,
} from "../bag/default-sources";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import {
  isBagAuctionEngineConfig,
  isGenericWebpageEngineConfig,
  SCRAPER_ADAPTERS,
} from "../scraper/adapters";
import {
  GENERIC_LOGIN_SOURCE_KEY,
  GENERIC_PAGE_SOURCE_KEY,
  type GenericExtractionField,
  type GenericLoginConfig,
} from "../scraper/generic-scraper-types";
import {
  genericEngineRequiresCredentials,
  validateGenericScraperForStart,
  type GenericValidationResult,
} from "../scraper/generic-scraper-validation";
import { validateAdapterCompatibility } from "../scraper/adapters";

export type GenericAdapterContamination = {
  contaminated: boolean;
  adapter: string | null;
};

export type ConvertGenericAdapterResult = {
  converted: boolean;
  removedBagSources: string[];
  previousConfig: Record<string, unknown>;
};

export class GenericScraperService {
  constructor(
    private readonly dataSources: DataSourcesRepository,
    private readonly projects: ProjectsRepository,
  ) {}

  isGenericWebpageEngine(engineId: string): boolean {
    const engine = this.dataSources.getById(engineId);
    return Boolean(engine && isGenericWebpageEngineConfig(engine.config));
  }

  isGenericWebpageProject(engineId: string): boolean {
    const engine = this.dataSources.getById(engineId);
    if (!engine) return false;
    const project = this.projects.getById(engine.projectId);
    return project?.projectType === "webpage-scraper";
  }

  detectGenericAdapterContamination(
    engineId: string,
  ): GenericAdapterContamination {
    if (!this.isGenericWebpageProject(engineId)) {
      return { contaminated: false, adapter: null };
    }

    const engine = this.dataSources.getById(engineId);
    const adapter =
      typeof engine?.config.adapter === "string" ? engine.config.adapter : null;

    return {
      contaminated: adapter === SCRAPER_ADAPTERS.BAG_AUCTION,
      adapter,
    };
  }

  getPageUrl(engineId: string): string | null {
    const source = this.dataSources.getSourceByKey(
      engineId,
      GENERIC_PAGE_SOURCE_KEY,
    );
    return source?.url?.trim() || null;
  }

  getLoginUrl(engineId: string): string | null {
    const source = this.dataSources.getSourceByKey(
      engineId,
      GENERIC_LOGIN_SOURCE_KEY,
    );
    return source?.url?.trim() || null;
  }

  ensureGenericScraperSources(engineId: string) {
    const engine = this.dataSources.getById(engineId);
    if (!engine || !this.isGenericWebpageProject(engineId)) {
      return;
    }

    const page = this.dataSources.getSourceByKey(engineId, GENERIC_PAGE_SOURCE_KEY);
    if (!page) {
      this.dataSources.saveSource(engineId, {
        name: "Page",
        sourceKey: GENERIC_PAGE_SOURCE_KEY,
        url: "",
        pageType: "page",
        enabled: true,
        position: 0,
      });
    }
  }

  requiresCredentials(engineId: string): boolean {
    const engine = this.dataSources.getById(engineId);
    if (!engine) return false;

    if (isBagAuctionEngineConfig(engine.config)) {
      return true;
    }

    if (!isGenericWebpageEngineConfig(engine.config)) {
      return false;
    }

    const loginUrl = this.getLoginUrl(engineId);
    const login = this.getLoginConfig(engine.config);
    return genericEngineRequiresCredentials(loginUrl, login);
  }

  getLoginConfig(
    config: Record<string, unknown>,
  ): GenericLoginConfig | undefined {
    const loginRaw = config.login;
    if (!loginRaw || typeof loginRaw !== "object" || Array.isArray(loginRaw)) {
      return undefined;
    }
    return loginRaw as GenericLoginConfig;
  }

  getFields(config: Record<string, unknown>): GenericExtractionField[] {
    const fieldsRaw = config.fields;
    return Array.isArray(fieldsRaw)
      ? (fieldsRaw as GenericExtractionField[])
      : [];
  }

  validateForStart(
    engineId: string,
    hasCredentials: boolean,
  ): GenericValidationResult {
    const engine = this.dataSources.getById(engineId);
    if (!engine) {
      return {
        ok: false,
        code: "engine-not-found",
        message: "Data Engine not found.",
      };
    }

    const project = this.projects.getById(engine.projectId);
    if (!project) {
      return {
        ok: false,
        code: "project-not-found",
        message: "Project not found.",
      };
    }

    const compatibility = validateAdapterCompatibility(
      project.projectType,
      engine.config.adapter,
    );
    if (!compatibility.ok) {
      return compatibility;
    }

    if (project.projectType === "webpage-scraper") {
      return validateGenericScraperForStart({
        projectType: project.projectType,
        adapter: engine.config.adapter,
        pageUrl: this.getPageUrl(engineId),
        loginUrl: this.getLoginUrl(engineId),
        engineConfig: engine.config,
        hasCredentials,
      });
    }

    return { ok: true };
  }

  saveGenericConfig(
    engineId: string,
    input: {
      pageUrl: string;
      loginUrl?: string;
      login?: GenericLoginConfig;
      fields: GenericExtractionField[];
    },
  ) {
    const engine = this.dataSources.getById(engineId);
    if (!engine) {
      throw new Error("Data Engine not found.");
    }

    if (!this.isGenericWebpageProject(engineId)) {
      throw new Error("Generic scraper configuration is only for webpage-scraper projects.");
    }

    if (!isGenericWebpageEngineConfig(engine.config)) {
      throw new Error(
        "This engine is not configured for the Generic Webpage Scraper adapter.",
      );
    }

    const pageUrl = input.pageUrl.trim();
    if (pageUrl && !isValidScraperSourceUrl(pageUrl)) {
      throw new Error("Page URL is not a valid http or https URL.");
    }

    const loginUrl = input.loginUrl?.trim() ?? "";
    if (loginUrl && !isValidScraperSourceUrl(loginUrl)) {
      throw new Error("Login URL is not a valid http or https URL.");
    }

    this.upsertSource(engineId, {
      sourceKey: GENERIC_PAGE_SOURCE_KEY,
      name: "Page",
      pageType: "page",
      url: pageUrl,
      position: 0,
    });

    if (loginUrl) {
      this.upsertSource(engineId, {
        sourceKey: GENERIC_LOGIN_SOURCE_KEY,
        name: "Login",
        pageType: "login",
        url: loginUrl,
        position: 1,
      });
    } else {
      const existingLogin = this.dataSources.getSourceByKey(
        engineId,
        GENERIC_LOGIN_SOURCE_KEY,
      );
      if (existingLogin) {
        this.dataSources.removeSource(engineId, existingLogin.id);
      }
    }

    const nextConfig = {
      ...engine.config,
      adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
      fields: input.fields,
      login: loginUrl ? input.login : undefined,
    };

    if (!loginUrl) {
      delete nextConfig.login;
    }

    this.dataSources.updateConfig(engineId, nextConfig);
    return this.dataSources.getById(engineId);
  }

  convertBagAdapterToGeneric(
    engineId: string,
    options: { removeUntouchedBagUrls?: boolean } = {},
  ): ConvertGenericAdapterResult {
    const engine = this.dataSources.getById(engineId);
    if (!engine) {
      throw new Error("Data Engine not found.");
    }

    if (!this.isGenericWebpageProject(engineId)) {
      throw new Error("Only generic webpage-scraper projects can be converted.");
    }

    if (!isBagAuctionEngineConfig(engine.config)) {
      throw new Error("This engine is not using the BAG Auction adapter.");
    }

    const previousConfig = { ...engine.config };
    const removedBagSources: string[] = [];

    if (options.removeUntouchedBagUrls) {
      for (const source of this.dataSources.listSources(engineId)) {
        if (isExactBagDefaultSource(source.sourceKey, source.url)) {
          this.dataSources.removeSource(engineId, source.id);
          removedBagSources.push(source.sourceKey);
        }
      }
    }

    this.dataSources.updateConfig(engineId, {
      ...engine.config,
      adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
      adapter_backup: previousConfig,
      fields: [],
    });

    this.dataSources.insertLog(engineId, {
      level: "info",
      eventType: "scraper.adapter_converted",
      message:
        "Converted from BAG Auction adapter to Generic Webpage Scraper.",
      metadata: {
        previousAdapter: SCRAPER_ADAPTERS.BAG_AUCTION,
        removedBagSources,
        previousConfig,
      },
    });

    return {
      converted: true,
      removedBagSources,
      previousConfig,
    };
  }

  private upsertSource(
    engineId: string,
    input: {
      sourceKey: string;
      name: string;
      pageType: string;
      url: string;
      position: number;
    },
  ) {
    const existing = this.dataSources.getSourceByKey(engineId, input.sourceKey);
    this.dataSources.saveSource(engineId, {
      id: existing?.id,
      name: input.name,
      sourceKey: input.sourceKey,
      url: input.url,
      pageType: input.pageType,
      enabled: true,
      position: input.position,
    });
  }
}
