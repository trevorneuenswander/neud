"use client";

import type { ReactNode } from "react";

type NoDragProps = {
  children: ReactNode;
  className?: string;
};

export function NoDrag({ children, className }: NoDragProps) {
  return (
    <div
      className={className}
      data-no-drag=""
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
