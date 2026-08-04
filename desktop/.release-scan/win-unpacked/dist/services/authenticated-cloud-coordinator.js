"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticatedCloudCoordinator = void 0;
class AuthenticatedCloudCoordinator {
    session;
    publicConfig;
    sessionClearListeners = new Set();
    sessionStoredListeners = new Set();
    constructor(session, publicConfig) {
        this.session = session;
        this.publicConfig = publicConfig;
    }
    isCloudConfigured() {
        return Boolean(this.publicConfig);
    }
    getPublicConfig() {
        return this.publicConfig;
    }
    hasCloudSession() {
        return this.session.hasCloudSession();
    }
    getUserId() {
        return this.session.getUserId();
    }
    onSessionStored(listener) {
        this.sessionStoredListeners.add(listener);
        return () => this.sessionStoredListeners.delete(listener);
    }
    onSessionCleared(listener) {
        this.sessionClearListeners.add(listener);
        return () => this.sessionClearListeners.delete(listener);
    }
    notifySessionStored() {
        for (const listener of this.sessionStoredListeners) {
            listener();
        }
    }
    notifySessionCleared() {
        for (const listener of this.sessionClearListeners) {
            listener();
        }
    }
    async getClient() {
        if (!this.publicConfig) {
            return null;
        }
        return this.session.getAuthenticatedClient(this.publicConfig);
    }
    async ping() {
        try {
            const client = await this.getClient();
            if (!client) {
                return false;
            }
            const { error } = await client.from("profiles").select("id").limit(1);
            return !error;
        }
        catch {
            return false;
        }
    }
}
exports.AuthenticatedCloudCoordinator = AuthenticatedCloudCoordinator;
