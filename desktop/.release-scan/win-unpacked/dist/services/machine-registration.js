"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachineRegistration = void 0;
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const app_paths_1 = require("./app-paths");
class MachineRegistration {
    paths;
    identity = null;
    constructor(paths) {
        this.paths = paths;
    }
    getHostId() {
        return this.load().id;
    }
    getIdentity() {
        return this.load();
    }
    load() {
        if (this.identity) {
            return this.identity;
        }
        if (fs_1.default.existsSync(this.paths.hostFile)) {
            const parsed = JSON.parse(fs_1.default.readFileSync(this.paths.hostFile, "utf8"));
            this.identity = {
                ...parsed,
                appVersion: electron_1.app.getVersion(),
            };
            return this.identity;
        }
        const identity = {
            id: (0, crypto_1.randomUUID)(),
            displayName: (0, app_paths_1.getHostname)(),
            hostname: (0, app_paths_1.getHostname)(),
            platform: process.platform,
            appVersion: electron_1.app.getVersion(),
            createdAt: new Date().toISOString(),
        };
        fs_1.default.writeFileSync(this.paths.hostFile, JSON.stringify(identity, null, 2));
        this.identity = identity;
        return identity;
    }
    touch() {
        const current = this.load();
        const next = {
            ...current,
            appVersion: electron_1.app.getVersion(),
        };
        fs_1.default.writeFileSync(this.paths.hostFile, JSON.stringify(next, null, 2));
        this.identity = next;
        return next;
    }
}
exports.MachineRegistration = MachineRegistration;
