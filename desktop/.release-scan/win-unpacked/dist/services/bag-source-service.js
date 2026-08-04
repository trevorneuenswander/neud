"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagSourceService = void 0;
const default_sources_1 = require("../bag/default-sources");
function buildSourceConfig(input) {
    return {
        isSystemDefault: input.isSystemDefault ?? false,
        description: input.description ?? "",
        adapterConsumed: input.adapterConsumed ?? false,
    };
}
function generateCustomSourceKey(existingKeys) {
    let index = 1;
    while (existingKeys.has(`custom-${index}`)) {
        index += 1;
    }
    return `custom-${index}`;
}
class BagSourceService {
    dataSources;
    projects;
    constructor(dataSources, projects) {
        this.dataSources = dataSources;
        this.projects = projects;
    }
    isBagAuctionEngine(source) {
        if (!source)
            return false;
        return (source.sourceType === "webpage-scraper" &&
            (0, default_sources_1.isBagAuctionEngineConfig)(source.config));
    }
    isBagGraphicsProject(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine)
            return false;
        const project = this.projects.getById(engine.projectId);
        return project?.projectType === "bag-graphics";
    }
    listSources(engineId) {
        return this.dataSources.listSources(engineId);
    }
    detectGenericBagContamination(engineId) {
        if (this.isBagGraphicsProject(engineId)) {
            return { contaminated: false, untouchedKeys: [] };
        }
        const untouchedKeys = [];
        for (const defaults of default_sources_1.BAG_DEFAULT_SCRAPER_SOURCES) {
            const sourceKey = defaults.sourceKey;
            const source = this.dataSources.getSourceByKey(engineId, defaults.sourceKey);
            if (source && (0, default_sources_1.isExactBagDefaultSource)(source.sourceKey, source.url)) {
                untouchedKeys.push(sourceKey);
            }
        }
        return {
            contaminated: untouchedKeys.length > 0,
            untouchedKeys,
        };
    }
    clearUntouchedBagDefaults(engineId) {
        const detection = this.detectGenericBagContamination(engineId);
        const removed = [];
        for (const sourceKey of detection.untouchedKeys) {
            const source = this.dataSources.getSourceByKey(engineId, sourceKey);
            if (source && (0, default_sources_1.isExactBagDefaultSource)(source.sourceKey, source.url)) {
                this.dataSources.removeSource(engineId, source.id);
                removed.push(sourceKey);
            }
        }
        if (removed.length > 0) {
            this.dataSources.insertLog(engineId, {
                level: "info",
                eventType: "scraper.bag_defaults_cleared",
                message: `Removed untouched BAG default sources: ${removed.join(", ")}.`,
                metadata: { removed },
            });
        }
        return removed;
    }
    ensureBagScraperSources(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !this.isBagAuctionEngine(engine)) {
            return { created: [], repaired: [], invalid: [] };
        }
        if (!this.isBagGraphicsProject(engineId)) {
            const contamination = this.detectGenericBagContamination(engineId);
            if (contamination.contaminated) {
                this.dataSources.insertLog(engineId, {
                    level: "warning",
                    eventType: "scraper.bag_defaults_detected",
                    message: "This generic scraper project contains untouched BAG default URLs. Clear them from the source list if they were added by mistake.",
                    metadata: { untouchedKeys: contamination.untouchedKeys },
                });
            }
            return { created: [], repaired: [], invalid: [] };
        }
        const result = {
            created: [],
            repaired: [],
            invalid: [],
        };
        for (const defaults of default_sources_1.BAG_DEFAULT_SCRAPER_SOURCES) {
            const sourceKey = defaults.sourceKey;
            const existing = this.dataSources.getSourceByKey(engineId, defaults.sourceKey);
            if (!existing) {
                this.dataSources.saveSource(engineId, {
                    name: defaults.name,
                    sourceKey: defaults.sourceKey,
                    url: defaults.url,
                    pageType: defaults.pageType,
                    enabled: true,
                    position: defaults.position,
                    config: buildSourceConfig({
                        isSystemDefault: true,
                        description: defaults.description,
                        adapterConsumed: defaults.adapterConsumed,
                    }),
                });
                result.created.push(sourceKey);
                continue;
            }
            const url = existing.url.trim();
            if (!url) {
                this.dataSources.saveSource(engineId, {
                    id: existing.id,
                    name: existing.name.trim() || defaults.name,
                    sourceKey: existing.sourceKey,
                    url: defaults.url,
                    pageType: existing.pageType || defaults.pageType,
                    enabled: existing.enabled,
                    position: existing.position ?? defaults.position,
                    config: {
                        ...existing.config,
                        isSystemDefault: true,
                        description: defaults.description,
                        adapterConsumed: defaults.adapterConsumed,
                    },
                });
                result.repaired.push(sourceKey);
                continue;
            }
            const validation = (0, default_sources_1.validateScraperSourceUrl)(url, existing.pageType);
            if (!validation.ok) {
                result.invalid.push({
                    sourceKey,
                    reason: `${(0, default_sources_1.getBagSourceDisplayName)(sourceKey)} has an invalid URL.`,
                });
            }
        }
        if (result.created.length > 0 || result.repaired.length > 0) {
            const parts = [];
            if (result.created.length > 0) {
                parts.push(`created ${result.created.map((key) => (0, default_sources_1.getBagSourceDisplayName)(key)).join(", ")}`);
            }
            if (result.repaired.length > 0) {
                parts.push(`repaired ${result.repaired.map((key) => (0, default_sources_1.getBagSourceDisplayName)(key)).join(", ")}`);
            }
            this.dataSources.insertLog(engineId, {
                level: "info",
                eventType: "bag.sources.ensured",
                message: `Ensured BAG scraper sources: ${parts.join("; ")}.`,
                metadata: {
                    created: result.created,
                    repaired: result.repaired,
                    invalid: result.invalid,
                },
            });
        }
        if (result.invalid.length > 0) {
            this.dataSources.insertLog(engineId, {
                level: "warning",
                eventType: "bag.sources.invalid",
                message: result.invalid.map((item) => item.reason).join(" "),
                metadata: { invalid: result.invalid },
            });
        }
        return result;
    }
    validateBagScraperSourcesForStart(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !this.isBagAuctionEngine(engine) || !this.isBagGraphicsProject(engineId)) {
            return { ok: true };
        }
        this.ensureBagScraperSources(engineId);
        const missing = [];
        for (const sourceKey of default_sources_1.BAG_REQUIRED_SOURCE_KEYS) {
            const source = this.dataSources.getSourceByKey(engineId, sourceKey);
            if (!source) {
                missing.push(sourceKey);
                continue;
            }
            if (!source.enabled) {
                return {
                    ok: false,
                    code: "disabled-required-source",
                    message: `${(0, default_sources_1.getBagSourceDisplayName)(sourceKey)} is disabled. Enable it before starting the engine.`,
                    missing: [sourceKey],
                };
            }
            const validation = (0, default_sources_1.validateScraperSourceUrl)(source.url, source.pageType);
            if (!validation.ok) {
                return {
                    ok: false,
                    code: sourceKey === "detail-template"
                        ? "invalid-detail-template"
                        : "invalid-source-url",
                    message: `${(0, default_sources_1.getBagSourceDisplayName)(sourceKey)} is not configured correctly. ${validation.reason}`,
                    missing: [sourceKey],
                };
            }
        }
        if (missing.length > 0) {
            const first = missing[0];
            return {
                ok: false,
                code: "missing-source",
                message: `${(0, default_sources_1.getBagSourceDisplayName)(first)} is not configured. Open the engine settings and provide the ${(0, default_sources_1.getBagSourceDisplayName)(first).toLowerCase()}.`,
                missing,
            };
        }
        return { ok: true };
    }
    listEnabledSources(engineId) {
        return this.dataSources.listSources(engineId, true);
    }
    saveBagSource(engineId, input) {
        this.assertBagEngine(engineId);
        this.ensureBagScraperSources(engineId);
        const validation = (0, default_sources_1.validateScraperSourceUrl)(input.url, input.pageType);
        if (!validation.ok) {
            throw new Error(validation.reason);
        }
        const existing = input.id
            ? this.dataSources.getSourceById(input.id)
            : input.sourceKey
                ? this.dataSources.getSourceByKey(engineId, input.sourceKey)
                : null;
        const defaults = input.sourceKey ? (0, default_sources_1.getBagDefaultSource)(input.sourceKey) : null;
        const pageType = input.pageType || existing?.pageType || defaults?.pageType || "custom";
        if (!default_sources_1.BAG_SUPPORTED_CUSTOM_SOURCE_TYPES.includes(pageType)) {
            throw new Error("Unsupported source type.");
        }
        return this.dataSources.saveSource(engineId, {
            id: existing?.id,
            name: input.name.trim() || defaults?.name || existing?.name || "Custom URL",
            sourceKey: input.sourceKey ?? existing?.sourceKey ?? generateCustomSourceKey(new Set(this.dataSources.listSources(engineId).map((source) => source.sourceKey))),
            url: input.url.trim(),
            pageType,
            enabled: input.enabled ?? existing?.enabled ?? true,
            position: input.position ??
                existing?.position ??
                defaults?.position ??
                this.nextCustomPosition(engineId),
            config: buildSourceConfig({
                isSystemDefault: defaults != null,
                description: input.description ??
                    defaults?.description ??
                    (typeof existing?.config.description === "string"
                        ? existing.config.description
                        : ""),
                adapterConsumed: defaults?.adapterConsumed ?? false,
            }),
        });
    }
    addCustomSource(engineId, input) {
        this.assertBagEngine(engineId);
        const existingKeys = new Set(this.dataSources.listSources(engineId).map((source) => source.sourceKey));
        const sourceKey = generateCustomSourceKey(existingKeys);
        return this.saveBagSource(engineId, {
            ...input,
            sourceKey,
            pageType: input.pageType || "custom",
            position: input.position ?? this.nextCustomPosition(engineId),
            description: input.description ?? "Stored custom URL — not yet consumed by adapter.",
        });
    }
    removeSource(engineId, sourceId) {
        this.assertBagEngine(engineId);
        const source = this.dataSources.getSourceById(sourceId);
        if (!source || source.sourceId !== engineId) {
            throw new Error("Source not found.");
        }
        const defaults = (0, default_sources_1.getBagDefaultSource)(source.sourceKey);
        if (defaults?.required) {
            throw new Error("required-source");
        }
        this.dataSources.removeSource(engineId, sourceId);
    }
    resetSource(engineId, sourceId) {
        this.assertBagEngine(engineId);
        const source = this.dataSources.getSourceById(sourceId);
        if (!source || source.sourceId !== engineId) {
            throw new Error("Source not found.");
        }
        const defaults = (0, default_sources_1.getBagDefaultSource)(source.sourceKey);
        if (!defaults) {
            throw new Error("Only standard BAG sources can be reset to defaults.");
        }
        return this.dataSources.saveSource(engineId, {
            id: source.id,
            name: defaults.name,
            sourceKey: defaults.sourceKey,
            url: defaults.url,
            pageType: defaults.pageType,
            enabled: true,
            position: defaults.position,
            config: buildSourceConfig({
                isSystemDefault: true,
                description: defaults.description,
                adapterConsumed: defaults.adapterConsumed,
            }),
        });
    }
    reorderSources(engineId, orderedSourceIds) {
        this.assertBagEngine(engineId);
        const current = this.dataSources.listSources(engineId);
        const currentIds = new Set(current.map((source) => source.id));
        const nextIds = orderedSourceIds.map(String);
        if (nextIds.length !== currentIds.size) {
            throw new Error("Reorder list must include every source for this engine exactly once.");
        }
        if (new Set(nextIds).size !== nextIds.length) {
            throw new Error("Reorder list contains duplicate source IDs.");
        }
        for (const id of nextIds) {
            if (!currentIds.has(id)) {
                throw new Error("Reorder list contains a source that does not belong to this engine.");
            }
        }
        this.dataSources.reorderSources(engineId, nextIds);
        return this.dataSources.listSources(engineId);
    }
    saveBagSourceUrls(engineId, input) {
        if (input.vehicles !== undefined) {
            this.saveBagSource(engineId, {
                sourceKey: "vehicles",
                name: "Auction URL",
                url: input.vehicles,
                pageType: "page",
            });
        }
        if (input.login !== undefined) {
            this.saveBagSource(engineId, {
                sourceKey: "login",
                name: "Login URL",
                url: input.login,
                pageType: "login",
            });
        }
        if (input.auctionDisplay !== undefined) {
            this.saveBagSource(engineId, {
                sourceKey: "auction-display",
                name: "Auction Display URL",
                url: input.auctionDisplay,
                pageType: "display",
            });
        }
    }
    assertBagEngine(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !this.isBagAuctionEngine(engine) || !this.isBagGraphicsProject(engineId)) {
            throw new Error("BAG source URLs can only be saved for BAG projects.");
        }
    }
    nextCustomPosition(engineId) {
        const sources = this.dataSources.listSources(engineId);
        const maxPosition = sources.reduce((max, source) => Math.max(max, source.position), 0);
        return Math.max(maxPosition + 10, 100);
    }
}
exports.BagSourceService = BagSourceService;
