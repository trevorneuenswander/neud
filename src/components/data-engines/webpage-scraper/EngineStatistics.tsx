import { StatBreakdownCard, StatCard } from "@/components/ui/StatCard";
import {
  calculateAveragePollRateMs,
  resolveDailyScrapeCounts,
} from "@/lib/data-engines/health";
import {
  formatAveragePollRate,
  formatBytes,
  formatRelativeTime,
} from "@/lib/data-engines/format";
import type { DataEngineLog, DataEngineSnapshot, DataEngineStatus } from "@/lib/data-engines/types";

type EngineStatisticsProps = {
  status: DataEngineStatus;
  pollIntervalMs: number | null;
  recentSnapshots: DataEngineSnapshot[];
  logs?: DataEngineLog[];
  enabledDisplayCount?: number;
};

function formatLastPollValue(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return formatRelativeTime(value);
}

export function EngineStatistics({
  status,
  pollIntervalMs,
  recentSnapshots,
  logs = [],
  enabledDisplayCount = 0,
}: EngineStatisticsProps) {
  const { total: scrapesToday, successful: successfulToday, failed: failedToday } =
    resolveDailyScrapeCounts({
      status,
      snapshots: recentSnapshots,
      logs,
    });
  const averagePollRateMs = calculateAveragePollRateMs(logs, pollIntervalMs);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatBreakdownCard
        title="Scrapes today"
        items={[
          { value: String(scrapesToday), label: "Total" },
          { value: String(successfulToday), label: "Successful" },
          { value: String(failedToday), label: "Failed" },
        ]}
      />
      <StatBreakdownCard
        title="Total scrapes"
        items={[
          { value: String(status.total_runs), label: "Total" },
          { value: String(status.successful_runs), label: "Successful" },
          { value: String(status.failed_runs), label: "Failed" },
        ]}
      />
      <StatCard
        label="Latest JSON size"
        value={formatBytes(status.last_payload_size_bytes)}
      />
      <StatCard
        label="Last poll"
        value={formatLastPollValue(status.last_run_succeeded_at)}
      />
      <StatCard
        label="Average poll rate"
        value={formatAveragePollRate(averagePollRateMs)}
      />
      <StatCard
        label="Active Displays"
        value={String(enabledDisplayCount)}
        detail={enabledDisplayCount === 0 ? "All displays off" : undefined}
        state={enabledDisplayCount === 0 ? "unavailable" : "default"}
      />
    </div>
  );
}
