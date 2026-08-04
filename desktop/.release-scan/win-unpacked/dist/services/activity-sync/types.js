"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_SYNC_BACKOFF_MS = exports.ACTIVITY_SYNC_LAST_PULL_KEY = exports.ACTIVITY_SYNC_LAST_PUSH_KEY = exports.ACTIVITY_SYNC_CURSOR_KEY = void 0;
exports.ACTIVITY_SYNC_CURSOR_KEY = "neud.activitySync.cursor";
exports.ACTIVITY_SYNC_LAST_PUSH_KEY = "neud.activitySync.lastSuccessfulPushAt";
exports.ACTIVITY_SYNC_LAST_PULL_KEY = "neud.activitySync.lastSuccessfulPullAt";
exports.ACTIVITY_SYNC_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000];
