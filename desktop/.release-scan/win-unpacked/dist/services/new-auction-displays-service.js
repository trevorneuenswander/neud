"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEW_TICKER_DISPLAY_SPEC = exports.NEW_BID_DISPLAY_SPEC = exports.NewAuctionDisplaysService = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const new_bid_display_constants_1 = require("../displays/new-bid-display-constants");
const new_ticker_display_constants_1 = require("../displays/new-ticker-display-constants");
const NEW_BID_DISPLAY_SPEC = {
    id: new_bid_display_constants_1.NEW_BID_DISPLAY_V1_ID,
    name: new_bid_display_constants_1.NEW_BID_DISPLAY_V1_NAME,
    slug: new_bid_display_constants_1.NEW_BID_DISPLAY_V1_SLUG,
    enabledSettingKey: new_bid_display_constants_1.NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY,
    htmlPath: "/displays/new-bid-display-v1",
    viewerPath: "/displays/new-bid-display-v1",
    dataPath: "/api/displays/new-bid-display-v1/data",
    width: 3840,
    height: 2160,
    description: "3840×2160 primary bid display with transparent lower ticker strip.",
};
exports.NEW_BID_DISPLAY_SPEC = NEW_BID_DISPLAY_SPEC;
const NEW_TICKER_DISPLAY_SPEC = {
    id: new_ticker_display_constants_1.NEW_TICKER_V1_ID,
    name: new_ticker_display_constants_1.NEW_TICKER_V1_NAME,
    slug: new_ticker_display_constants_1.NEW_TICKER_V1_SLUG,
    enabledSettingKey: new_ticker_display_constants_1.NEW_TICKER_V1_ENABLED_SETTING_KEY,
    htmlPath: "/displays/new-ticker-v1",
    viewerPath: "/displays/new-ticker-v1",
    dataPath: "/api/displays/new-ticker-v1/data",
    width: 3840,
    height: 2160,
    description: "240px lower ticker bar for upcoming lots.",
};
exports.NEW_TICKER_DISPLAY_SPEC = NEW_TICKER_DISPLAY_SPEC;
class NewAuctionDisplaysService {
    projects;
    displays;
    settings;
    constructor(projects, displays, settings) {
        this.projects = projects;
        this.displays = displays;
        this.settings = settings;
    }
    isNewBidDisplayEnabled() {
        return this.settings.get(new_bid_display_constants_1.NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY, false);
    }
    isNewTickerDisplayEnabled() {
        return this.settings.get(new_ticker_display_constants_1.NEW_TICKER_V1_ENABLED_SETTING_KEY, false);
    }
    setNewBidDisplayEnabled(enabled) {
        this.settings.set(new_bid_display_constants_1.NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY, enabled);
        this.syncEnabledState(NEW_BID_DISPLAY_SPEC, enabled);
        return enabled;
    }
    setNewTickerDisplayEnabled(enabled) {
        this.settings.set(new_ticker_display_constants_1.NEW_TICKER_V1_ENABLED_SETTING_KEY, enabled);
        this.syncEnabledState(NEW_TICKER_DISPLAY_SPEC, enabled);
        return enabled;
    }
    ensureNewBidDisplay(projectId, viewerBaseUrl) {
        return this.ensureDisplay(projectId, viewerBaseUrl, NEW_BID_DISPLAY_SPEC);
    }
    ensureNewTickerDisplay(projectId, viewerBaseUrl) {
        return this.ensureDisplay(projectId, viewerBaseUrl, NEW_TICKER_DISPLAY_SPEC);
    }
    repairAllBagProjects(viewerBaseUrl) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project))
                continue;
            try {
                this.ensureNewBidDisplay(project.id, viewerBaseUrl);
                this.ensureNewTickerDisplay(project.id, viewerBaseUrl);
            }
            catch (error) {
                console.error(`[new-auction-displays] Failed to ensure displays for project ${project.id}:`, error);
            }
        }
    }
    ensureDisplay(projectId, viewerBaseUrl, spec) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
            return this.displays.getByKey(projectId, spec.slug);
        }
        const origin = viewerBaseUrl.replace(/\/$/, "");
        const dataUrl = `${origin}${spec.dataPath}`;
        const params = new URLSearchParams({
            src: dataUrl,
            poll: "1000",
        });
        const viewerUrl = `${origin}${spec.viewerPath}?${params.toString()}`;
        return this.displays.upsert({
            projectId,
            name: spec.name,
            displayKey: spec.slug,
            htmlPath: spec.htmlPath,
            enabled: this.settings.get(spec.enabledSettingKey, false),
            settings: {
                displayType: spec.id,
                sourceType: "project-html",
                url: viewerUrl,
                width: spec.width,
                height: spec.height,
                background: "transparent",
                description: spec.description,
            },
        });
    }
    syncEnabledState(spec, enabled) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const existing = this.displays.getByKey(project.id, spec.slug);
            if (!existing)
                continue;
            this.displays.upsert({
                projectId: project.id,
                name: spec.name,
                displayKey: spec.slug,
                htmlPath: existing.htmlPath,
                settings: existing.settings,
                enabled,
            });
        }
    }
}
exports.NewAuctionDisplaysService = NewAuctionDisplaysService;
