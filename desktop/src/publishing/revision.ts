import { hashCanonicalProjectDataForPublish } from "./hash";
import type { CanonicalProjectData } from "./types";

export type CanonicalRevisionState = {
  revision: number;
  payloadHash: string | null;
};

/**
 * Tracks monotonic canonical revisions based on sanitized payload content.
 *
 * Revision increments only when the sanitized canonical payload hash changes.
 * Revisions are in-memory for Slice 1 and reset when the desktop app restarts.
 */
export class CanonicalRevisionTracker {
  private revision = 0;
  private payloadHash: string | null = null;

  getState(): CanonicalRevisionState {
    return {
      revision: this.revision,
      payloadHash: this.payloadHash,
    };
  }

  /** Seeds tracker from last known cloud/local published revision after restart. */
  seedFromPublishedState(revision: number, payloadHash: string | null): void {
    this.revision = Math.max(0, revision);
    this.payloadHash = payloadHash;
  }

  observeCanonicalData(data: CanonicalProjectData | null): CanonicalRevisionState {
    if (!data) {
      return this.getState();
    }

    const nextHash = hashCanonicalProjectDataForPublish(data);
    if (this.payloadHash === null && this.revision === 0) {
      this.revision = 1;
      this.payloadHash = nextHash;
      return this.getState();
    }

    if (this.payloadHash === null) {
      this.payloadHash = nextHash;
      return this.getState();
    }

    if (nextHash !== this.payloadHash) {
      this.revision += 1;
      this.payloadHash = nextHash;
    }

    return this.getState();
  }

  resetForTests(): void {
    this.revision = 0;
    this.payloadHash = null;
  }
}

export function shouldIncrementCanonicalRevision(
  previousHash: string | null,
  nextHash: string,
): boolean {
  return previousHash === null || previousHash !== nextHash;
}
