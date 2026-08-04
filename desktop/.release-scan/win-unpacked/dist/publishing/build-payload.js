"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPublishedProjectPayload = buildPublishedProjectPayload;
const contract_1 = require("./contract");
function buildPublishedProjectPayload(input) {
    return {
        contractVersion: contract_1.NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
        projectId: input.projectId,
        projectSlug: input.projectSlug,
        revision: input.revision,
        generatedAt: input.generatedAt,
        publisher: {
            instanceId: input.publisherInstanceId,
            lastSeenAt: input.publisherLastSeenAt,
        },
        source: {
            mode: input.sourceMode,
            connected: input.sourceConnected,
        },
        data: input.data,
    };
}
