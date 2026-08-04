"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadArrowPhaseBootstrapService = void 0;
const default_sources_1 = require("../bag/default-sources");
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
class BroadArrowPhaseBootstrapService {
    projects;
    dataSources;
    bagSources;
    settings;
    credentials;
    projectDeletion;
    constructor(projects, dataSources, bagSources, settings, credentials, projectDeletion) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.bagSources = bagSources;
        this.settings = settings;
        this.credentials = credentials;
        this.projectDeletion = projectDeletion;
    }
    ensureBroadArrowDevelopmentPhase(localApiBaseUrl) {
        const phaseComplete = this.settings.get(broad_arrow_phase_1.BROAD_ARROW_PHASE_SETTING_KEY, "") === "complete";
        const canonical = this.projects.getBySlug(broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
        if (phaseComplete && canonical) {
            const engine = this.dataSources.ensureWebpageScraper(canonical.id, broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.projectType);
            this.bagSources.ensureBagScraperSources(engine.id);
            const urlsApplied = this.applyEnvironmentUrls(engine.id);
            const credentialsSeeded = this.credentials.seedFromEnvironment(engine.id);
            this.ensureEngineSettings(engine.id);
            this.ensureLoginConfig(engine.id);
            this.settings.set(broad_arrow_phase_1.BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING, broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
            return {
                bootstrapped: false,
                repaired: true,
                projectId: canonical.id,
                projectSlug: broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug,
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
            name: broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.name,
            slug: broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug,
            projectType: broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.projectType,
            description: "Broad Arrow auction graphics powered by the BAG auction scraper.",
            icon: "bag",
        });
        const engine = this.dataSources.ensureWebpageScraper(project.id, broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.projectType);
        this.bagSources.ensureBagScraperSources(engine.id);
        const urlsApplied = this.applyEnvironmentUrls(engine.id);
        const credentialsSeeded = this.credentials.seedFromEnvironment(engine.id);
        this.ensureEngineSettings(engine.id);
        this.ensureLoginConfig(engine.id);
        this.settings.set(broad_arrow_phase_1.BROAD_ARROW_PHASE_SETTING_KEY, "complete");
        this.settings.set(broad_arrow_phase_1.BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING, broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
        return {
            bootstrapped: true,
            repaired: false,
            projectId: project.id,
            projectSlug: broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug,
            engineId: engine.id,
            deletedProjectCount,
            credentialsSeeded,
            urlsApplied,
        };
    }
    getDefaultProjectSlug() {
        return (this.settings.get(broad_arrow_phase_1.BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING, broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug) || broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
    }
    applyEnvironmentUrls(engineId) {
        const envUrls = (0, broad_arrow_phase_1.readBroadArrowEnvironmentUrls)();
        const applied = [];
        const sources = this.dataSources.listSources(engineId, true);
        const updates = [];
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
    ensureEngineSettings(engineId) {
        const current = this.dataSources.getSettings(engineId);
        if (!current)
            return;
        this.dataSources.updateSettings(engineId, {
            pollIntervalMs: (0, default_sources_1.isUnsetBagPollInterval)(current.pollIntervalMs)
                ? default_sources_1.BAG_DEFAULT_POLL_INTERVAL_MS
                : current.pollIntervalMs,
            detailsTtlMs: current.detailsTtlMs > 0
                ? current.detailsTtlMs
                : default_sources_1.BAG_DEFAULT_DETAILS_TTL_MS,
            maxDetailChecksPerPoll: current.maxDetailChecksPerPoll === 3
                ? default_sources_1.BAG_DEFAULT_MAX_DETAIL_CHECKS
                : current.maxDetailChecksPerPoll > 0
                    ? current.maxDetailChecksPerPoll
                    : default_sources_1.BAG_DEFAULT_MAX_DETAIL_CHECKS,
            headless: current.headless,
        });
    }
    ensureLoginConfig(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return;
        const existingLogin = engine.config.login;
        if (existingLogin &&
            typeof existingLogin === "object" &&
            !Array.isArray(existingLogin)) {
            return;
        }
        this.dataSources.updateConfig(engineId, {
            ...engine.config,
            login: { ...default_sources_1.BAG_LOGIN_CONFIG },
        });
    }
}
exports.BroadArrowPhaseBootstrapService = BroadArrowPhaseBootstrapService;
