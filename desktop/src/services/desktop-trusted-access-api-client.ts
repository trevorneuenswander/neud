import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";

export class DesktopTrustedAccessApiClient {
  constructor(
    private readonly trustedPortalOrigin: string,
    private readonly cloud: AuthenticatedCloudCoordinator,
  ) {}

  private async getAccessToken(): Promise<string> {
    const client = await this.cloud.getClient();
    if (!client) {
      throw new Error("Sign in to manage access.");
    }
    const { data, error } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("Sign in to manage access.");
    }
    return token;
  }

  private async post(path: string, body: Record<string, unknown> = {}) {
    const token = await this.getAccessToken();
    let response: Response;
    try {
      response = await fetch(`${this.trustedPortalOrigin}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network_error";
      if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(message)) {
        throw new Error("Access management requires an internet connection.");
      }
      throw new Error("Unable to reach the access management service. Try again.");
    }

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
    };
    if (!response.ok || !payload.ok) {
      if (response.status === 401) {
        throw new Error("Sign in to manage access.");
      }
      if (response.status === 403) {
        throw new Error("You do not have permission to perform this action.");
      }
      throw new Error(payload.code ?? "forbidden");
    }
    return payload;
  }

  createInvitation(input: {
    email: string;
    teamId?: string | null;
    teamRole?: string | null;
    platformRole?: string | null;
    projectAssignments?: Array<{ projectId: string; role: string }>;
  }) {
    return this.post("/api/access/invitations", input);
  }

  resendInvitation(invitationId: string) {
    return this.post(`/api/access/invitations/${encodeURIComponent(invitationId)}/resend`);
  }

  revokeInvitation(invitationId: string) {
    return this.post(`/api/access/invitations/${encodeURIComponent(invitationId)}/revoke`);
  }
}
