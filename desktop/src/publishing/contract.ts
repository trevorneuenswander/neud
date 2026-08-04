import type {
  CanonicalProjectData,
  NeudPublishedProjectPublisher,
  NeudPublishedProjectSource,
} from "./types";

export const NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION = "1.0" as const;

export type NeudPublishedProjectContractVersion =
  typeof NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION;

export interface NeudPublishedProjectPayload {
  contractVersion: NeudPublishedProjectContractVersion;
  projectId: string;
  projectSlug: string;
  revision: number;
  generatedAt: string;
  publisher: NeudPublishedProjectPublisher;
  source: NeudPublishedProjectSource;
  data: CanonicalProjectData;
}

export type LocalCanonicalApiAvailability = "ready" | "no_data" | "unavailable";

export type LocalCanonicalApiResponse = {
  ok: boolean;
  availability: LocalCanonicalApiAvailability;
  payload: NeudPublishedProjectPayload | null;
  runtime: {
    localActive: boolean;
    dataConnected: boolean;
    contractVersion: typeof NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION;
  };
  error?: string;
};
