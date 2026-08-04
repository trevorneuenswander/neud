"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LowerTickerDisplayService = exports.LOWER_TICKER_V5_DISPLAY_NAME = exports.LOWER_TICKER_V5_DISPLAY_KEY = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const lower_ticker_display_constants_1 = require("../displays/lower-ticker-display-constants");
exports.LOWER_TICKER_V5_DISPLAY_KEY = lower_ticker_display_constants_1.LOWER_TICKER_V5_DISPLAY_ID;
exports.LOWER_TICKER_V5_DISPLAY_NAME = "Lower Ticker v5";
class LowerTickerDisplayService {
    projects;
    displays;
    settings;
    constructor(projects, displays, settings) {
        this.projects = projects;
        this.displays = displays;
        this.settings = settings;
    }
    isLowerTickerEnabled() {
        return this.settings.get(lower_ticker_display_constants_1.LOWER_TICKER_V5_ENABLED_SETTING_KEY, true);
    }
    setLowerTickerEnabled(enabled) {
        this.settings.set(lower_ticker_display_constants_1.LOWER_TICKER_V5_ENABLED_SETTING_KEY, enabled);
        this.syncEnabledStateOnAllProjects(enabled);
        return enabled;
    }
    ensureLowerTickerDisplay(projectId, viewerBaseUrl) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
            return this.displays.getByKey(projectId, exports.LOWER_TICKER_V5_DISPLAY_KEY);
        }
        const origin = viewerBaseUrl.replace(/\/$/, "");
        const viewerUrl = `${origin}/displays/lower-ticker-v5`;
        return this.displays.upsert({
            projectId,
            name: exports.LOWER_TICKER_V5_DISPLAY_NAME,
            displayKey: exports.LOWER_TICKER_V5_DISPLAY_KEY,
            htmlPath: "/displays/lower-ticker-v5",
            enabled: this.isLowerTickerEnabled(),
            settings: {
                displayType: exports.LOWER_TICKER_V5_DISPLAY_KEY,
                url: viewerUrl,
                width: 1920,
                height: 1080,
                background: "transparent",
            },
        });
    }
    listProjectDisplays(projectId, viewerBaseUrl) {
        const project = this.projects.getById(projectId);
        if (!project)
            return [];
        if (project.projectType === "bag-graphics") {
            if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
                return this.displays
                    .listByProject(projectId)
                    .filter((display) => display.displayKey === exports.LOWER_TICKER_V5_DISPLAY_KEY);
            }
            this.ensureLowerTickerDisplay(projectId, viewerBaseUrl);
        }
        return this.displays
            .listByProject(projectId)
            .filter((display) => display.displayKey === exports.LOWER_TICKER_V5_DISPLAY_KEY);
    }
    repairAllBagProjects(viewerBaseUrl) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project))
                continue;
            try {
                this.ensureLowerTickerDisplay(project.id, viewerBaseUrl);
            }
            catch (error) {
                console.error(`[lower-ticker-display] Failed to ensure display for project ${project.id}:`, error);
            }
        }
    }
    syncEnabledStateOnAllProjects(enabled) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const existing = this.displays.getByKey(project.id, exports.LOWER_TICKER_V5_DISPLAY_KEY);
            if (!existing)
                continue;
            this.displays.upsert({
                projectId: project.id,
                name: exports.LOWER_TICKER_V5_DISPLAY_NAME,
                displayKey: exports.LOWER_TICKER_V5_DISPLAY_KEY,
                htmlPath: existing.htmlPath,
                settings: existing.settings,
                enabled,
            });
        }
    }
}
exports.LowerTickerDisplayService = LowerTickerDisplayService;
