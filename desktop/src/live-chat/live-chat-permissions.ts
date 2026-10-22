import { getApplicationRole } from "../auth/application-roles.ts";

const OPERATE_ACTIONS = new Set([
  "mode",
  "connect",
  "disconnect",
  "manual-message",
  "take",
  "skip",
  "clear-queue",
  "hide-current",
]);

const CONFIGURE_ACTIONS = new Set(["select-provider"]);

export function assertLiveChatPost(input: {
  role: string | null | undefined;
  action: string;
  provider?: string | null;
  currentStreamId?: string | null;
  nextStreamId?: unknown;
}): void {
  const appRole = getApplicationRole({ role: input.role });
  const configure = appRole === "owner" || appRole === "admin";
  const operate = configure || appRole === "operator";

  if (CONFIGURE_ACTIONS.has(input.action)) {
    if (!configure) {
      throw new Error("Only owners and admins can configure Live Chat.");
    }
    return;
  }

  if (!OPERATE_ACTIONS.has(input.action)) {
    return;
  }

  if (!operate) {
    throw new Error("Viewers have read-only access to Live Chat.");
  }
}
