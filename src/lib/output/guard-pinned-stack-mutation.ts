"use client";

import type { PinnedStackRecord } from "@/lib/displays/pinned-viewer-stacks";
import { confirmAndStopOutputsForStacks } from "@/lib/output/confirm-output-interruption";
import {
  OutputInterruptionCanceledError,
  stackIdsForPinnedViewerMutation,
  type PinnedStackMutationAction,
} from "@/lib/output/output-interruption-guard";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { isDesktopEnvironment } from "@/lib/desktop/client";

export async function guardPinnedStackMutation<T>(input: {
  action: PinnedStackMutationAction;
  stackId?: string;
  target?:
    | { kind: "display"; displayId: string }
    | { kind: "stack"; stackId: string };
  pinnedStacks: PinnedStackRecord[];
  mutate: () => Promise<T>;
}): Promise<T> {
  if (!shouldUseLocalDataClient() || !isDesktopEnvironment()) {
    return input.mutate();
  }
  const stackIds = stackIdsForPinnedViewerMutation(
    input.action,
    { stackId: input.stackId, target: input.target },
    input.pinnedStacks,
  );
  if (stackIds.length === 0) {
    return input.mutate();
  }
  const allowed = await confirmAndStopOutputsForStacks(stackIds);
  if (!allowed) {
    throw new OutputInterruptionCanceledError();
  }
  return input.mutate();
}
