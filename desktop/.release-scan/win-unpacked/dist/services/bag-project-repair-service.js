"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagProjectRepairService = void 0;
const default_sources_1 = require("../bag/default-sources");
const BROAD_ARROW_NAME_PATTERN = /broad\s*arrow/i;
const BROAD_ARROW_SLUG_PATTERN = /broad-arrow/i;
const CREDENTIAL_MIGRATION_FLAG_PREFIX = "bag.credential_migrated.";
class BagProjectRepairService {
    projects;
    dataSources;
    bagSources;
    credentials;
    settings;
    constructor(projects, dataSources, bagSources, credentials, settings) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.bagSources = bagSources;
        this.credentials = credentials;
        this.settings = settings;
    }
    findBroadArrowProject() {
        const bagProjects = this.projects
            .list()
            .filter((project) => project.projectType === "bag-graphics");
        const namedMatch = bagProjects.find((project) => BROAD_ARROW_NAME_PATTERN.test(project.name) ||
            BROAD_ARROW_SLUG_PATTERN.test(project.slug));
        if (namedMatch) {
            return namedMatch;
        }
        return bagProjects[0] ?? null;
    }
    repairBroadArrowConfiguration() {
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
    repairEngineIfBroadArrow(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return null;
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
    ensureBagScraperSettings(engineId) {
        const current = this.dataSources.getSettings(engineId);
        if (!current)
            return false;
        const next = {
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
        };
        const changed = next.pollIntervalMs !== current.pollIntervalMs ||
            next.detailsTtlMs !== current.detailsTtlMs ||
            next.maxDetailChecksPerPoll !== current.maxDetailChecksPerPoll;
        if (changed) {
            this.dataSources.updateSettings(engineId, next);
        }
        return changed;
    }
    ensureBagLoginConfig(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return false;
        const existingLogin = engine.config.login;
        if (existingLogin &&
            typeof existingLogin === "object" &&
            !Array.isArray(existingLogin)) {
            return false;
        }
        this.dataSources.updateConfig(engineId, {
            ...engine.config,
            login: { ...default_sources_1.BAG_LOGIN_CONFIG },
        });
        return true;
    }
    migrateCredentialsOnce(engineId) {
        const flagKey = `${CREDENTIAL_MIGRATION_FLAG_PREFIX}${engineId}`;
        if (this.settings.get(flagKey, "") === "true") {
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
exports.BagProjectRepairService = BagProjectRepairService;
