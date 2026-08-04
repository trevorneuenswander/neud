"use client";

import { useCallback, useEffect, useState } from "react";
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

function SelectorPlaceholder({ initialDataSource }: { initialDataSource: DisplayDataSource }) {
  return (
    <>
      <span className="text-sm text-muted">Data Source</span>
      <div
        className="inline-flex rounded-md border border-border bg-surface p-0.5"
        aria-hidden="true"
      >
        {DISPLAY_DATA_SOURCE_OPTIONS.map((option) => {
          const selected = initialDataSource === option.value;
          return (
            <span
              key={option.value}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                selected
                  ? "bg-primary text-white"
                  : "text-muted"
              }`}
            >
              {option.label}
            </span>
          );
        })}
      </div>
    </>
  );
}

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
    <div
      className="flex shrink-0 items-center gap-3 self-center"
      role="group"
      aria-label="Data source"
      data-hydrated={mounted ? "true" : "false"}
    >
      {desktopActive ? (
        <>
          <span className="text-sm text-muted">Data Source</span>
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
            {DISPLAY_DATA_SOURCE_OPTIONS.map((option) => {
              const selected = source === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    handleSelect(option.value);
                  }}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selected
                      ? "bg-primary text-white"
                      : "text-muted hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <SelectorPlaceholder initialDataSource={initialDataSource} />
      )}
    </div>
  );
}
