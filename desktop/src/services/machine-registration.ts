import fs from "fs";
import { randomUUID } from "crypto";
import { app } from "electron";
import type { AppPaths } from "./app-paths";
import { getHostname } from "./app-paths";
import type { HostIdentity } from "../types/desktop-api";

export class MachineRegistration {
  private identity: HostIdentity | null = null;

  constructor(private readonly paths: AppPaths) {}

  getHostId(): string {
    return this.load().id;
  }

  getIdentity(): HostIdentity {
    return this.load();
  }

  private load(): HostIdentity {
    if (this.identity) {
      return this.identity;
    }

    if (fs.existsSync(this.paths.hostFile)) {
      const parsed = JSON.parse(
        fs.readFileSync(this.paths.hostFile, "utf8"),
      ) as HostIdentity;
      this.identity = {
        ...parsed,
        appVersion: app.getVersion(),
      };
      return this.identity;
    }

    const identity: HostIdentity = {
      id: randomUUID(),
      displayName: getHostname(),
      hostname: getHostname(),
      platform: process.platform,
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(this.paths.hostFile, JSON.stringify(identity, null, 2));
    this.identity = identity;
    return identity;
  }

  touch(): HostIdentity {
    const current = this.load();
    const next = {
      ...current,
      appVersion: app.getVersion(),
    };
    fs.writeFileSync(this.paths.hostFile, JSON.stringify(next, null, 2));
    this.identity = next;
    return next;
  }
}
