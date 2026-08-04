import type { NeudPublishedProjectPayload } from "./contract";
import { NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION } from "./contract";
import type { CanonicalProjectData } from "./types";

export function buildPublishedProjectPayload(input: {
  projectId: string;
  projectSlug: string;
  revision: number;
  generatedAt: string;
  publisherInstanceId: string;
  publisherLastSeenAt: string;
  sourceMode: CanonicalProjectData["dataSource"];
  sourceConnected: boolean;
  data: CanonicalProjectData;
}): NeudPublishedProjectPayload {
  return {
    contractVersion: NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
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
