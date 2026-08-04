"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PylonDisplayService = exports.PYLON_DISPLAY_NAME = exports.PYLON_DISPLAY_KEY = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const pylon_display_constants_1 = require("../displays/pylon-display-constants");
exports.PYLON_DISPLAY_KEY = pylon_display_constants_1.PYLON_DISPLAY_ID;
exports.PYLON_DISPLAY_NAME = "Pylon v5";
class PylonDisplayService {
    projects;
    displays;
    settings;
    constructor(projects, displays, settings) {
        this.projects = projects;
        this.displays = displays;
        this.settings = settings;
    }
    isPylonEnabled() {
        return this.settings.get(pylon_display_constants_1.PYLON_ENABLED_SETTING_KEY, true);
    }
    setPylonEnabled(enabled) {
        this.settings.set(pylon_display_constants_1.PYLON_ENABLED_SETTING_KEY, enabled);
        this.syncEnabledStateOnAllProjects(enabled);
        return enabled;
    }
    ensurePylonDisplay(projectId, viewerBaseUrl) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
            return this.displays.getByKey(projectId, exports.PYLON_DISPLAY_KEY);
        }
        const origin = viewerBaseUrl.replace(/\/$/, "");
        const viewerUrl = `${origin}/displays/pylon?src=${encodeURIComponent(`${origin}/api/displays/pylon/data`)}&poll=1000`;
        return this.displays.upsert({
            projectId,
            name: exports.PYLON_DISPLAY_NAME,
            displayKey: exports.PYLON_DISPLAY_KEY,
            htmlPath: "/displays/pylon",
            enabled: this.isPylonEnabled(),
            settings: {
                displayType: exports.PYLON_DISPLAY_KEY,
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
                    .filter((display) => display.displayKey === exports.PYLON_DISPLAY_KEY);
            }
            this.ensurePylonDisplay(projectId, viewerBaseUrl);
        }
        return this.displays
            .listByProject(projectId)
            .filter((display) => display.displayKey === exports.PYLON_DISPLAY_KEY);
    }
    repairAllBagProjects(viewerBaseUrl) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            if (!(0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project))
                continue;
            try {
                this.ensurePylonDisplay(project.id, viewerBaseUrl);
            }
            catch (error) {
                console.error(`[pylon-display] Failed to ensure display for project ${project.id}:`, error);
            }
        }
    }
    syncEnabledStateOnAllProjects(enabled) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const existing = this.displays.getByKey(project.id, exports.PYLON_DISPLAY_KEY);
            if (!existing)
                continue;
            this.displays.upsert({
                projectId: project.id,
                name: exports.PYLON_DISPLAY_NAME,
                displayKey: exports.PYLON_DISPLAY_KEY,
                htmlPath: existing.htmlPath,
                settings: existing.settings,
                enabled,
            });
        }
    }
}
exports.PylonDisplayService = PylonDisplayService;
