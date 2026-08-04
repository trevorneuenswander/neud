import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EngineActualState } from "@/lib/data-engines/constants";
import { formatActualState } from "@/lib/data-engines/format";

type EngineStateBadgeProps = {
  state: EngineActualState;
};

export function EngineStateBadge({ state }: EngineStateBadgeProps) {
  return <StatusBadge status={formatActualState(state)} />;
}
