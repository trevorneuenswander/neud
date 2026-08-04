import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import { displayDataSourceLabel } from "@/lib/displays/display-data-source";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { useDataSourcePageStatus } from "@/lib/displays/use-data-source-page-status";

type DataSourceStatusPillProps = {
  pageSource: DisplayDataSource;
};

export function DataSourceStatusPill({ pageSource }: DataSourceStatusPillProps) {
  const status = useDataSourcePageStatus(pageSource);
  const pageLabel = displayDataSourceLabel(pageSource);
  const isLive = status === "live";

  return (
    <ConnectionStatusPill
      status={status}
      title={
        isLive
          ? `LIVE — ${pageLabel} is the selected data source for displays.`
          : `OFFLINE — ${pageLabel} is not the selected data source for displays.`
      }
    />
  );
}
