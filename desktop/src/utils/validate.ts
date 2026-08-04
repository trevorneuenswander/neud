import { randomUUID } from "crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function assertEngineId(engineId: string): string {
  if (!isValidUuid(engineId)) {
    throw new Error("Invalid engine ID.");
  }

  return engineId;
}

export function assertEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 320 || !trimmed.includes("@")) {
    throw new Error("Invalid email.");
  }

  return trimmed;
}

export function assertPassword(password: string): string {
  if (!password || password.length > 512) {
    throw new Error("Invalid password.");
  }

  return password;
}

export function createWorkerId(hostId: string, pid: number): string {
  return `${hostId}-${pid}-${randomUUID().slice(0, 8)}`;
}
