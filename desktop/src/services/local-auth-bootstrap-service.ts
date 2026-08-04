import type { AppPaths } from "./app-paths";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { LocalProjectMembershipsRepository } from "../repositories/local-project-memberships-repository";
import type { AuthLicenseManager } from "./auth-license-manager";
import {
  abbreviateUserId,
  getOrCreateLocalDesktopIdentity,
  type LocalDesktopIdentity,
} from "../auth/local-desktop-identity";
import { LocalSessionTokenService } from "../auth/local-session-token";
import { AUTH_EXPLICITLY_SIGNED_OUT_KEY } from "../auth/session-recovery-keys";
import { NEUD_AUTH_SIGNING_SECRET } from "../env/neud-env";
import { createHmac } from "crypto";

export type LocalAuthBootstrapResult = {
  identity: LocalDesktopIdentity;
  createdIdentity: boolean;
  createdMembershipCount: number;
  createdSessionToken: boolean;
  establishedLocalSession: boolean;
  membershipCount: number;
};

export class LocalAuthBootstrapService {
  private readonly sessionTokens: LocalSessionTokenService;
  private bootstrapped = false;
  private result: LocalAuthBootstrapResult | null = null;

  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly memberships: LocalProjectMembershipsRepository,
    private readonly auth: AuthLicenseManager,
    private readonly paths: AppPaths,
    deviceId: string,
  ) {
    this.sessionTokens = new LocalSessionTokenService(
      settings,
      paths,
      resolveSigningSecret(deviceId),
    );
  }

  getSessionTokenService(): LocalSessionTokenService {
    return this.sessionTokens;
  }

  ensure(): LocalAuthBootstrapResult {
    if (this.result) {
      return this.result;
    }

    const { identity, created: createdIdentity } =
      getOrCreateLocalDesktopIdentity(this.settings);

    let createdMembershipCount = 0;
    for (const project of this.projects.list()) {
      if (
        this.memberships.ensureLegacyLocalOwnerMembership(project.id, identity.userId)
      ) {
        createdMembershipCount += 1;
        console.info(
          `[local-auth] Created legacy local owner membership for project ${project.id}`,
        );
      }
    }

    let establishedLocalSession = false;
    const explicitlySignedOut = this.settings.get<boolean>(
      AUTH_EXPLICITLY_SIGNED_OUT_KEY,
      false,
    );
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

    const { token, created: createdSessionToken } =
      this.sessionTokens.getOrCreateToken();

    const membershipCount = this.memberships.countForUser(identity.userId);

    console.info(
      `[local-auth] identity=${createdIdentity ? "created" : "resolved"} userId=${abbreviateUserId(identity.userId)} projectMemberships=${membershipCount}`,
    );

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

  publishSessionConfig(baseUrl: string) {
    const bootstrap = this.ensure();
    const { token } = this.sessionTokens.getOrCreateToken();
    this.sessionTokens.writeSessionConfig({
      baseUrl,
      token,
      userId: bootstrap.identity.userId,
    });
  }

  hasBootstrapped(): boolean {
    return this.bootstrapped;
  }
}

function resolveSigningSecret(deviceId: string): string {
  const fromEnv = NEUD_AUTH_SIGNING_SECRET();
  if (fromEnv) return fromEnv;
  return createHmac("sha256", "neud-dev").update(deviceId).digest("hex");
}
