"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectOnAirSourceToggle } from "@/components/projects/ProjectOnAirSourceToggle";
import {
  DISPLAY_DATA_SOURCE_OPTIONS,
  type DisplayDataSource,
} from "@/lib/displays/display-data-source";
import {
  getDesktopDisplayDataSource,
  setDesktopDisplayDataSource,
  subscribeToDesktopDisplayDataSource,
} from "@/lib/desktop/display-data-source-client";
import { isDesktopEnvironment } from "@/lib/desktop/client";

type ProjectDataSourceSelectorProps = {
  initialDataSource?: DisplayDataSource;
};

export function ProjectDataSourceSelector({
  initialDataSource = "webpage-scraper",
}: ProjectDataSourceSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const [source, setSource] = useState<DisplayDataSource>(initialDataSource);

  useEffect(() => {
    setMounted(true);
  }, []);

  const desktopActive = mounted && isDesktopEnvironment();

  useEffect(() => {
    if (!desktopActive) return;
    void getDesktopDisplayDataSource().then(setSource).catch(() => {
      // Keep initial value.
    });
    return subscribeToDesktopDisplayDataSource(setSource);
  }, [desktopActive]);

  const handleSelect = useCallback(
    (nextSource: DisplayDataSource) => {
      if (!desktopActive || nextSource === source) return;
      const previous = source;
      setSource(nextSource);
      void setDesktopDisplayDataSource(nextSource).catch(() => {
        setSource(previous);
      });
    },
    [desktopActive, source],
  );

  return (
    <div data-hydrated={mounted ? "true" : "false"}>
      <ProjectOnAirSourceToggle
        options={DISPLAY_DATA_SOURCE_OPTIONS}
        value={source}
        disabled={!desktopActive}
        ariaLabel="On-air data source"
        onSelect={handleSelect}
      />
    </div>
  );
}
