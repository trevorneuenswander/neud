"use client";

import { createContext, useContext } from "react";

const SidebarCollapseContext = createContext(false);

export function SidebarCollapseProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarCollapseContext.Provider value={collapsed}>{children}</SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapseContext);
}
