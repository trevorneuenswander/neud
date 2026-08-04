"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagDisplayService = exports.BAG_DISPLAY_TYPE = exports.BAG_DISPLAY_NAME = exports.BAG_DISPLAY_KEY = void 0;
exports.BAG_DISPLAY_KEY = "bag-auction";
exports.BAG_DISPLAY_NAME = "BAG Auction Display";
exports.BAG_DISPLAY_TYPE = "bag-auction";
class BagDisplayService {
    projects;
    displays;
    bagLiveState;
    constructor(projects, displays, bagLiveState) {
        this.projects = projects;
        this.displays = displays;
        this.bagLiveState = bagLiveState;
    }
    ensureBagDisplay(projectId, localApiBaseUrl) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        const displayUrl = this.bagLiveState.getDisplayUrl(projectId, localApiBaseUrl);
        return this.displays.upsert({
            projectId,
            name: exports.BAG_DISPLAY_NAME,
            displayKey: exports.BAG_DISPLAY_KEY,
            settings: {
                displayType: exports.BAG_DISPLAY_TYPE,
                url: displayUrl,
                width: 1920,
                height: 1080,
                background: "transparent",
            },
        });
    }
    listProjectDisplays(projectId, localApiBaseUrl) {
        const project = this.projects.getById(projectId);
        if (!project)
            return [];
        if (project.projectType === "bag-graphics") {
            this.ensureBagDisplay(projectId, localApiBaseUrl);
        }
        return this.displays.listByProject(projectId);
    }
    repairAllBagProjects(localApiBaseUrl) {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            try {
                this.ensureBagDisplay(project.id, localApiBaseUrl);
            }
            catch (error) {
                console.error(`[bag-display] Failed to ensure display for project ${project.id}:`, error);
            }
        }
    }
}
exports.BagDisplayService = BagDisplayService;
