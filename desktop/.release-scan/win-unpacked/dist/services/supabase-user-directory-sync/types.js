"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_DIRECTORY_SYNC_BACKOFF_MS = exports.USER_DIRECTORY_SYNC_STALE_MS = exports.USER_DIRECTORY_SYNC_INTERVAL_MS = exports.USER_DIRECTORY_SYNC_LAST_RESULT_KEY = exports.USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY = void 0;
exports.USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY = "neud.userDirectorySync.lastSuccess";
exports.USER_DIRECTORY_SYNC_LAST_RESULT_KEY = "neud.userDirectorySync.lastResult";
exports.USER_DIRECTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000;
exports.USER_DIRECTORY_SYNC_STALE_MS = 5 * 60 * 1000;
exports.USER_DIRECTORY_SYNC_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
