"use client";

import { useEffect, useState } from "react";
import { localGetViewableUserIds } from "@/lib/local/access-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

export function useLinkableUserIds(): string[] {
  const [userIds, setUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    void localGetViewableUserIds()
      .then((result) => {
        setUserIds(result.userIds);
      })
      .catch(() => {
        setUserIds([]);
      });
  }, []);

  return userIds;
}
