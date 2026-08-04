"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccessManagementTabs } from "@/components/access-management/AccessManagementTabs";
import type { AccessManagementTabId } from "@/lib/access-management/routes";
import {
  parseAccessManagementTab,
  resolveAccessManagementSurface,
} from "@/lib/access-management/routes";

export function useAccessManagementTabState(
  fallback: AccessManagementTabId = "teams",
): [AccessManagementTabId, (tab: AccessManagementTabId) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AccessManagementTabId>(
    parseAccessManagementTab(searchParams.get("tab")) ?? fallback,
  );

  useEffect(() => {
    const parsed = parseAccessManagementTab(searchParams.get("tab"));
    if (parsed) {
      setActiveTab(parsed);
    }
  }, [searchParams]);

  const setTab = (tab: AccessManagementTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return [activeTab, setTab];
}

export function useAccessManagementSurface() {
  const pathname = usePathname();
  return resolveAccessManagementSurface(pathname);
}
