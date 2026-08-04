"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericScraperService = void 0;
const default_sources_1 = require("../bag/default-sources");
const adapters_1 = require("../scraper/adapters");
const generic_scraper_types_1 = require("../scraper/generic-scraper-types");
const generic_scraper_validation_1 = require("../scraper/generic-scraper-validation");
const adapters_2 = require("../scraper/adapters");
class GenericScraperService {
    dataSources;
    projects;
    constructor(dataSources, projects) {
        this.dataSources = dataSources;
        this.projects = projects;
    }
    isGenericWebpageEngine(engineId) {
        const engine = this.dataSources.getById(engineId);
        return Boolean(engine && (0, adapters_1.isGenericWebpageEngineConfig)(engine.config));
    }
    isGenericWebpageProject(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return false;
        const project = this.projects.getById(engine.projectId);
        return project?.projectType === "webpage-scraper";
    }
    detectGenericAdapterContamination(engineId) {
        if (!this.isGenericWebpageProject(engineId)) {
            return { contaminated: false, adapter: null };
        }
        const engine = this.dataSources.getById(engineId);
        const adapter = typeof engine?.config.adapter === "string" ? engine.config.adapter : null;
        return {
            contaminated: adapter === adapters_1.SCRAPER_ADAPTERS.BAG_AUCTION,
            adapter,
        };
    }
    getPageUrl(engineId) {
        const source = this.dataSources.getSourceByKey(engineId, generic_scraper_types_1.GENERIC_PAGE_SOURCE_KEY);
        return source?.url?.trim() || null;
    }
    getLoginUrl(engineId) {
        const source = this.dataSources.getSourceByKey(engineId, generic_scraper_types_1.GENERIC_LOGIN_SOURCE_KEY);
        return source?.url?.trim() || null;
    }
    ensureGenericScraperSources(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !this.isGenericWebpageProject(engineId)) {
            return;
        }
        const page = this.dataSources.getSourceByKey(engineId, generic_scraper_types_1.GENERIC_PAGE_SOURCE_KEY);
        if (!page) {
            this.dataSources.saveSource(engineId, {
                name: "Page",
                sourceKey: generic_scraper_types_1.GENERIC_PAGE_SOURCE_KEY,
                url: "",
                pageType: "page",
                enabled: true,
                position: 0,
            });
        }
    }
    requiresCredentials(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return false;
        if ((0, adapters_1.isBagAuctionEngineConfig)(engine.config)) {
            return true;
        }
        if (!(0, adapters_1.isGenericWebpageEngineConfig)(engine.config)) {
            return false;
        }
        const loginUrl = this.getLoginUrl(engineId);
        const login = this.getLoginConfig(engine.config);
        return (0, generic_scraper_validation_1.genericEngineRequiresCredentials)(loginUrl, login);
    }
    getLoginConfig(config) {
        const loginRaw = config.login;
        if (!loginRaw || typeof loginRaw !== "object" || Array.isArray(loginRaw)) {
            return undefined;
        }
        return loginRaw;
    }
    getFields(config) {
        const fieldsRaw = config.fields;
        return Array.isArray(fieldsRaw)
            ? fieldsRaw
            : [];
    }
    validateForStart(engineId, hasCredentials) {
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
        const compatibility = (0, adapters_2.validateAdapterCompatibility)(project.projectType, engine.config.adapter);
        if (!compatibility.ok) {
            return compatibility;
        }
        if (project.projectType === "webpage-scraper") {
            return (0, generic_scraper_validation_1.validateGenericScraperForStart)({
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
    saveGenericConfig(engineId, input) {
        const engine = this.dataSources.getById(engineId);
        if (!engine) {
            throw new Error("Data Engine not found.");
        }
        if (!this.isGenericWebpageProject(engineId)) {
            throw new Error("Generic scraper configuration is only for webpage-scraper projects.");
        }
        if (!(0, adapters_1.isGenericWebpageEngineConfig)(engine.config)) {
            throw new Error("This engine is not configured for the Generic Webpage Scraper adapter.");
        }
        const pageUrl = input.pageUrl.trim();
        if (pageUrl && !(0, default_sources_1.isValidScraperSourceUrl)(pageUrl)) {
            throw new Error("Page URL is not a valid http or https URL.");
        }
        const loginUrl = input.loginUrl?.trim() ?? "";
        if (loginUrl && !(0, default_sources_1.isValidScraperSourceUrl)(loginUrl)) {
            throw new Error("Login URL is not a valid http or https URL.");
        }
        this.upsertSource(engineId, {
            sourceKey: generic_scraper_types_1.GENERIC_PAGE_SOURCE_KEY,
            name: "Page",
            pageType: "page",
            url: pageUrl,
            position: 0,
        });
        if (loginUrl) {
            this.upsertSource(engineId, {
                sourceKey: generic_scraper_types_1.GENERIC_LOGIN_SOURCE_KEY,
                name: "Login",
                pageType: "login",
                url: loginUrl,
                position: 1,
            });
        }
        else {
            const existingLogin = this.dataSources.getSourceByKey(engineId, generic_scraper_types_1.GENERIC_LOGIN_SOURCE_KEY);
            if (existingLogin) {
                this.dataSources.removeSource(engineId, existingLogin.id);
            }
        }
        const nextConfig = {
            ...engine.config,
            adapter: adapters_1.SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
            fields: input.fields,
            login: loginUrl ? input.login : undefined,
        };
        if (!loginUrl) {
            delete nextConfig.login;
        }
        this.dataSources.updateConfig(engineId, nextConfig);
        return this.dataSources.getById(engineId);
    }
    convertBagAdapterToGeneric(engineId, options = {}) {
        const engine = this.dataSources.getById(engineId);
        if (!engine) {
            throw new Error("Data Engine not found.");
        }
        if (!this.isGenericWebpageProject(engineId)) {
            throw new Error("Only generic webpage-scraper projects can be converted.");
        }
        if (!(0, adapters_1.isBagAuctionEngineConfig)(engine.config)) {
            throw new Error("This engine is not using the BAG Auction adapter.");
        }
        const previousConfig = { ...engine.config };
        const removedBagSources = [];
        if (options.removeUntouchedBagUrls) {
            for (const source of this.dataSources.listSources(engineId)) {
                if ((0, default_sources_1.isExactBagDefaultSource)(source.sourceKey, source.url)) {
                    this.dataSources.removeSource(engineId, source.id);
                    removedBagSources.push(source.sourceKey);
                }
            }
        }
        this.dataSources.updateConfig(engineId, {
            ...engine.config,
            adapter: adapters_1.SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
            adapter_backup: previousConfig,
            fields: [],
        });
        this.dataSources.insertLog(engineId, {
            level: "info",
            eventType: "scraper.adapter_converted",
            message: "Converted from BAG Auction adapter to Generic Webpage Scraper.",
            metadata: {
                previousAdapter: adapters_1.SCRAPER_ADAPTERS.BAG_AUCTION,
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
    upsertSource(engineId, input) {
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
exports.GenericScraperService = GenericScraperService;
