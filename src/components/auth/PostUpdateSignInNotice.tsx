"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";

export function PostUpdateSignInNotice() {
  const searchParams = useSearchParams();
  const updated = searchParams.get("updated") === "1";

  if (!updated) {
    return null;
  }

  return (
    <Alert variant="info" >
      NEUD was updated. Please sign in again.
    </Alert>
  );
}
