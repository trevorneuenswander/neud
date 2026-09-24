"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEUD_TEAM_IDENTIFIERS = void 0;
exports.isProtectedNeudTeam = isProtectedNeudTeam;
exports.isProtectedNeudTeamId = isProtectedNeudTeamId;
/** Canonical system NEUD team — matched by normalized name or slug. */
exports.NEUD_TEAM_IDENTIFIERS = ["neud"];
function normalize(value) {
    return value.trim().toLowerCase();
}
function isProtectedNeudTeam(team) {
    const name = normalize(team.name);
    const slug = normalize(team.slug ?? "");
    return exports.NEUD_TEAM_IDENTIFIERS.some((identifier) => name === identifier || slug === identifier);
}
function isProtectedNeudTeamId(teamId, directory) {
    const team = directory.teams.find((entry) => entry.id === teamId);
    return team ? isProtectedNeudTeam(team) : false;
}
