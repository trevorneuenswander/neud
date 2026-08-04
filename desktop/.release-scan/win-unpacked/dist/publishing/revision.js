"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanonicalRevisionTracker = void 0;
exports.shouldIncrementCanonicalRevision = shouldIncrementCanonicalRevision;
const hash_1 = require("./hash");
/**
 * Tracks monotonic canonical revisions based on sanitized payload content.
 *
 * Revision increments only when the sanitized canonical payload hash changes.
 * Revisions are in-memory for Slice 1 and reset when the desktop app restarts.
 */
class CanonicalRevisionTracker {
    revision = 0;
    payloadHash = null;
    getState() {
        return {
            revision: this.revision,
            payloadHash: this.payloadHash,
        };
    }
    observeCanonicalData(data) {
        if (!data) {
            return this.getState();
        }
        const nextHash = (0, hash_1.hashCanonicalProjectData)(data);
        if (this.payloadHash === null) {
            this.revision = 1;
            this.payloadHash = nextHash;
            return this.getState();
        }
        if (nextHash !== this.payloadHash) {
            this.revision += 1;
            this.payloadHash = nextHash;
        }
        return this.getState();
    }
    resetForTests() {
        this.revision = 0;
        this.payloadHash = null;
    }
}
exports.CanonicalRevisionTracker = CanonicalRevisionTracker;
function shouldIncrementCanonicalRevision(previousHash, nextHash) {
    return previousHash === null || previousHash !== nextHash;
}
