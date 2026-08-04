import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import { normalizeLocalApiOrigin } from "../lib/normalize-local-api-origin";

export const LOCAL_API_SESSION_HEADER = "x-neud-local-session";

export const LOCAL_API_SESSION_SETTING_KEY = "neud.localApiSessionToken";
export const LOCAL_API_URL_SETTING_KEY = "neud.localApiUrl";

export type LocalApiSessionConfig = {
  baseUrl: string;
  sessionToken: string;
  userId: string;
  updatedAt: string;
};

export class LocalSessionTokenService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly paths: AppPaths,
    private readonly signingSecret: string,
  ) {}

  getOrCreateToken(): { token: string; created: boolean } {
    const existing = this.readStoredToken();
    if (existing) {
      return { token: existing, created: false };
    }

    const token = createSessionToken(this.signingSecret);
    this.persistToken(token);
    return { token, created: true };
  }

  validate(requestToken: string | undefined): boolean {
    if (!requestToken?.trim()) {
      return false;
    }

    const stored = this.readStoredToken();
    if (!stored) {
      return false;
    }

    const left = Buffer.from(stored, "utf8");
    const right = Buffer.from(requestToken.trim(), "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }

  readRequestToken(headers: NodeJS.Dict<string | string[] | undefined>): string | undefined {
    const current = headers[LOCAL_API_SESSION_HEADER];
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
    if (Array.isArray(current) && typeof current[0] === "string" && current[0].trim()) {
      return current[0].trim();
    }

    return undefined;
  }

  writeSessionConfig(input: { baseUrl: string; userId: string; token: string }) {
    const baseUrl =
      normalizeLocalApiOrigin(input.baseUrl) ?? input.baseUrl.replace(/\/$/, "");
    const config: LocalApiSessionConfig = {
      baseUrl,
      sessionToken: input.token,
      userId: input.userId,
      updatedAt: new Date().toISOString(),
    };

    fs.mkdirSync(this.paths.config, { recursive: true });
    fs.writeFileSync(this.getSessionConfigPath(), JSON.stringify(config, null, 2), "utf8");
  }

  getSessionConfigPath(): string {
    return path.join(this.paths.config, "local-api-session.json");
  }

  clearSessionBinding(): void {
    if (fs.existsSync(this.getSessionConfigPath())) {
      fs.unlinkSync(this.getSessionConfigPath());
    }
  }

  private readStoredToken(): string | null {
    const current = this.settings.get<string | null>(LOCAL_API_SESSION_SETTING_KEY, null);
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }

    return null;
  }

  private persistToken(token: string) {
    this.settings.set(LOCAL_API_SESSION_SETTING_KEY, token);
  }
}

function createSessionToken(signingSecret: string): string {
  const nonce = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", signingSecret).update(nonce).digest("hex");
  return `${nonce}.${signature}`;
}
