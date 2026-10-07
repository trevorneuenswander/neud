"use client";

import { usePathname } from "next/navigation";

type PublicHeaderGateProps = {
  children: React.ReactNode;
};

export function PublicHeaderGate({ children }: PublicHeaderGateProps) {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/oauth/zoom/callback") {
    return null;
  }

  return children;
}
