"use client";

import { useState } from "react";
import { DeleteProjectSection } from "@/components/projects/DeleteProjectSection";
import { Button } from "@/components/ui/Button";

type ProjectDeleteMenuProps = {
  projectId: string;
  projectName: string;
  projectSlug: string;
};

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 00-.584.786 18.23 18.23 0 002.663.761c.976.186 1.966.284 2.96.284.993 0 1.983-.098 2.96-.284A18.365 18.365 0 0015.75 5.25a.75.75 0 00-.584-.786 41.145 41.145 0 00-2.365-.298V3.75A2.75 2.75 0 0011.25 1h-2.5zM4.5 4.653v.043a.75.75 0 00.583.786l.018.004a17.902 17.902 0 002.663.761 17.902 17.902 0 002.663-.761l.018-.004a.75.75 0 00.583-.786V4.653a44.646 44.646 0 00-3-.298V3.75a1.25 1.25 0 011.25-1.25h2.5A1.25 1.25 0 0112.25 3.75v.605a44.646 44.646 0 00-3 .298zM6.173 8.378a.75.75 0 011.03-.853l.447.224a8.45 8.45 0 004.7 0l.447-.224a.75.75 0 011.03.853l-.447.224a9.95 9.95 0 01-5.106 0l-.447-.224zM6.25 11.25a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ProjectDeleteMenu({
  projectId,
  projectName,
  projectSlug,
}: ProjectDeleteMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="danger"
        className="inline-flex items-center gap-2"
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
        Delete Project
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-xl">
            <DeleteProjectSection
              projectId={projectId}
              projectName={projectName}
              projectSlug={projectSlug}
              onDeleted={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
