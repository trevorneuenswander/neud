"use client";

import { usePathname } from "next/navigation";

type PublicHeaderGateProps = {
  children: React.ReactNode;
};

export function PublicHeaderGate({ children }: PublicHeaderGateProps) {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return children;
}
