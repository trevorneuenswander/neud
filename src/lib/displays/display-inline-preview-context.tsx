"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DisplayInlinePreviewContextValue = {
  isExpanded: (projectId: string, displayId: string) => boolean;
  setExpanded: (projectId: string, displayId: string, expanded: boolean) => void;
  clearDisplay: (projectId: string, displayId: string) => void;
  clearProject: (projectId: string) => void;
};

const DisplayInlinePreviewContext = createContext<DisplayInlinePreviewContextValue | null>(
  null,
);

export function DisplayInlinePreviewProvider({ children }: { children: ReactNode }) {
  const [expandedByProject, setExpandedByProject] = useState<Record<string, string[]>>({});

  const isExpanded = useCallback(
    (projectId: string, displayId: string) =>
      (expandedByProject[projectId] ?? []).includes(displayId),
    [expandedByProject],
  );

  const setExpanded = useCallback((projectId: string, displayId: string, expanded: boolean) => {
    setExpandedByProject((current) => {
      const existing = new Set(current[projectId] ?? []);
      if (expanded) {
        existing.add(displayId);
      } else {
        existing.delete(displayId);
      }
      return {
        ...current,
        [projectId]: Array.from(existing),
      };
    });
  }, []);

  const clearDisplay = useCallback((projectId: string, displayId: string) => {
    setExpanded(projectId, displayId, false);
  }, [setExpanded]);

  const clearProject = useCallback((projectId: string) => {
    setExpandedByProject((current) => {
      if (!current[projectId]) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      isExpanded,
      setExpanded,
      clearDisplay,
      clearProject,
    }),
    [clearProject, clearDisplay, isExpanded, setExpanded],
  );

  return (
    <DisplayInlinePreviewContext.Provider value={value}>
      {children}
    </DisplayInlinePreviewContext.Provider>
  );
}

export function useDisplayInlinePreview() {
  const context = useContext(DisplayInlinePreviewContext);
  if (!context) {
    throw new Error("useDisplayInlinePreview must be used within DisplayInlinePreviewProvider.");
  }
  return context;
}
