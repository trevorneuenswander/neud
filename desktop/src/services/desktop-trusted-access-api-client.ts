import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";

export class DesktopTrustedAccessApiClient {
  constructor(
    private readonly trustedPortalOrigin: string,
    private readonly cloud: AuthenticatedCloudCoordinator,
  ) {}

  private async getAccessToken(): Promise<string> {
    const client = await this.cloud.getClient();
    if (!client) {
      throw new Error("Access management requires an internet connection.");
    }
    const { data, error } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("Access management requires an internet connection.");
    }
    return token;
  }

  private async post(path: string, body: Record<string, unknown> = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.trustedPortalOrigin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
    };
    if (!response.ok || !payload.ok) {
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
