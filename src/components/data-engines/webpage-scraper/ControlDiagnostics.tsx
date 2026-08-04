import type { EngineControlState } from "@/lib/data-engines/control-state";
import type { EngineActualState, EngineDesiredState } from "@/lib/data-engines/constants";
import type { DataEngineAccessContext } from "@/lib/data-engines/types";
import type { DataEngineStatus } from "@/lib/data-engines/types";

type ControlDiagnosticsProps = {
  accessLevel: DataEngineAccessContext["accessLevel"];
  canControl: boolean;
  desiredState: EngineDesiredState;
  actualState: EngineActualState;
  status: DataEngineStatus | null;
  controlState: EngineControlState;
};

export function ControlDiagnostics({
  accessLevel,
  canControl,
  desiredState,
  actualState,
  status,
  controlState,
}: ControlDiagnosticsProps) {
  return (
    <details className="rounded-lg border border-dashed border-border bg-surface-raised/40">
      <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted">
        Control diagnostics (development)
      </summary>
      <dl className="grid gap-2 px-4 pb-4 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted">Access level</dt>
          <dd className="font-mono">{accessLevel}</dd>
        </div>
        <div>
          <dt className="text-muted">canControl</dt>
          <dd className="font-mono">{String(canControl)}</dd>
        </div>
        <div>
          <dt className="text-muted">Desired state</dt>
          <dd className="font-mono">{desiredState}</dd>
        </div>
        <div>
          <dt className="text-muted">Actual state</dt>
          <dd className="font-mono">{actualState}</dd>
        </div>
        <div>
          <dt className="text-muted">Active command</dt>
          <dd className="font-mono">
            {controlState.activeCommand
              ? `${controlState.activeCommand.command} (${controlState.activeCommand.status})`
              : "none"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Last heartbeat</dt>
          <dd className="font-mono">{status?.last_heartbeat_at ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Disabled reasons</dt>
          <dd className="space-y-1 font-mono">
            <div>Start: {controlState.start.reason ?? "enabled"}</div>
            <div>Stop: {controlState.stop.reason ?? "enabled"}</div>
            <div>Restart: {controlState.restart.reason ?? "enabled"}</div>
            <div>Run Once: {controlState.runOnce.reason ?? "enabled"}</div>
          </dd>
        </div>
      </dl>
    </details>
  );
}
