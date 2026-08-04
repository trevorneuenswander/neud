"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalAuthBootstrapService = void 0;
const local_desktop_identity_1 = require("../auth/local-desktop-identity");
const local_session_token_1 = require("../auth/local-session-token");
const session_recovery_keys_1 = require("../auth/session-recovery-keys");
const neud_env_1 = require("../env/neud-env");
const crypto_1 = require("crypto");
class LocalAuthBootstrapService {
    settings;
    projects;
    memberships;
    auth;
    paths;
    sessionTokens;
    bootstrapped = false;
    result = null;
    constructor(settings, projects, memberships, auth, paths, deviceId) {
        this.settings = settings;
        this.projects = projects;
        this.memberships = memberships;
        this.auth = auth;
        this.paths = paths;
        this.sessionTokens = new local_session_token_1.LocalSessionTokenService(settings, paths, resolveSigningSecret(deviceId));
    }
    getSessionTokenService() {
        return this.sessionTokens;
    }
    ensure() {
        if (this.result) {
            return this.result;
        }
        const { identity, created: createdIdentity } = (0, local_desktop_identity_1.getOrCreateLocalDesktopIdentity)(this.settings);
        let createdMembershipCount = 0;
        for (const project of this.projects.list()) {
            if (this.memberships.ensureLegacyLocalOwnerMembership(project.id, identity.userId)) {
                createdMembershipCount += 1;
                console.info(`[local-auth] Created legacy local owner membership for project ${project.id}`);
            }
        }
        let establishedLocalSession = false;
        const explicitlySignedOut = this.settings.get(session_recovery_keys_1.AUTH_EXPLICITLY_SIGNED_OUT_KEY, false);
        if (!this.auth.isAccessAllowed() && !explicitlySignedOut) {
            this.auth.establishLocalDesktopSession({
                userId: identity.userId,
                email: identity.email,
                displayName: identity.displayName,
                role: "owner",
                deviceId: this.auth.getDeviceId(),
            });
            establishedLocalSession = true;
        }
        const { token, created: createdSessionToken } = this.sessionTokens.getOrCreateToken();
        const membershipCount = this.memberships.countForUser(identity.userId);
        console.info(`[local-auth] identity=${createdIdentity ? "created" : "resolved"} userId=${(0, local_desktop_identity_1.abbreviateUserId)(identity.userId)} projectMemberships=${membershipCount}`);
        this.result = {
            identity,
            createdIdentity,
            createdMembershipCount,
            createdSessionToken,
            establishedLocalSession,
            membershipCount,
        };
        this.bootstrapped = true;
        return this.result;
    }
    publishSessionConfig(baseUrl) {
        const bootstrap = this.ensure();
        const { token } = this.sessionTokens.getOrCreateToken();
        this.sessionTokens.writeSessionConfig({
            baseUrl,
            token,
            userId: bootstrap.identity.userId,
        });
    }
    hasBootstrapped() {
        return this.bootstrapped;
    }
}
exports.LocalAuthBootstrapService = LocalAuthBootstrapService;
function resolveSigningSecret(deviceId) {
    const fromEnv = (0, neud_env_1.NEUD_AUTH_SIGNING_SECRET)();
    if (fromEnv)
        return fromEnv;
    return (0, crypto_1.createHmac)("sha256", "neud-dev").update(deviceId).digest("hex");
}
