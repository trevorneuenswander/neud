"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING = exports.BROAD_ARROW_DISPLAYS_RESET_SETTING_KEY = exports.BROAD_ARROW_PHASE_SETTING_KEY = exports.BROAD_ARROW_CANONICAL_PROJECT = void 0;
exports.isBroadArrowCanonicalProject = isBroadArrowCanonicalProject;
exports.shouldAutoSeedBagDisplays = shouldAutoSeedBagDisplays;
exports.readBroadArrowEnvironmentUrls = readBroadArrowEnvironmentUrls;
exports.readBroadArrowEnvironmentCredentials = readBroadArrowEnvironmentCredentials;
exports.BROAD_ARROW_CANONICAL_PROJECT = {
    name: "Broad Arrow Auctions",
    slug: "broad-arrow-auctions",
    projectType: "bag-graphics",
};
exports.BROAD_ARROW_PHASE_SETTING_KEY = "phase.broad_arrow_focus_v1";
exports.BROAD_ARROW_DISPLAYS_RESET_SETTING_KEY = "phase.broad_arrow_displays_reset_v1";
exports.BROAD_ARROW_DEFAULT_PROJECT_SLUG_SETTING = "default_project_slug";
function isBroadArrowCanonicalProject(project) {
    return project.slug === exports.BROAD_ARROW_CANONICAL_PROJECT.slug;
}
/** Broad Arrow Auctions no longer auto-seeds built-in display rows. */
function shouldAutoSeedBagDisplays(project) {
    if (project.projectType && project.projectType !== "bag-graphics") {
        return false;
    }
    return !isBroadArrowCanonicalProject(project);
}
function readBroadArrowEnvironmentUrls() {
    return {
        vehicles: process.env.AUCTION_URL?.trim() ||
            process.env.BAG_VEHICLES_URL?.trim() ||
            undefined,
        login: process.env.LOGIN_URL?.trim() ||
            process.env.BAG_LOGIN_URL?.trim() ||
            undefined,
        auctionDisplay: process.env.AUCTIONS_DISPLAY_URL?.trim() ||
            process.env.BAG_AUCTION_DISPLAY_URL?.trim() ||
            undefined,
    };
}
function readBroadArrowEnvironmentCredentials() {
    const email = process.env.BAG_AUCTION_EMAIL?.trim() ||
        process.env.AUCTION_EMAIL?.trim() ||
        undefined;
    const password = process.env.BAG_AUCTION_PASSWORD || process.env.AUCTION_PASSWORD || undefined;
    return { email, password };
}
