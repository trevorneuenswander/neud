"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadHtmlDisplayForm } from "@/components/developer-tools/UploadHtmlDisplayForm";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";

type AddHtmlDisplayButtonProps = {
  projectSlug: string;
  onCreated: (display: CreatedDisplayPayload) => void;
};

export function AddHtmlDisplayButton({
  projectSlug,
  onCreated,
}: AddHtmlDisplayButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [hasUnsavedUpload, setHasUnsavedUpload] = useState(false);

  function requestClose() {
    if (hasUnsavedUpload) {
      setConfirmClose(true);
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add Display
      </Button>
      <SlideOverPanel
        title="Add Display"
        subtitle="Upload an HTML file to create a new project display"
        open={open}
        onClose={requestClose}
      >
        <UploadHtmlDisplayForm
          projectSlug={projectSlug}
          onDirtyChange={setHasUnsavedUpload}
          onCreated={(display) => {
            onCreated(display);
            setHasUnsavedUpload(false);
            setOpen(false);
            router.refresh();
          }}
        />
        <div className="sr-only" aria-live="polite">
          {hasUnsavedUpload ? "Unsaved upload changes" : null}
        </div>
      </SlideOverPanel>
      {confirmClose ? (
        <ConfirmDialog
          title="Discard upload?"
          description="You have an unsaved HTML upload or display details. Close Add Display without creating the display?"
          confirmLabel="Discard"
          confirmVariant="destructive"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            setHasUnsavedUpload(false);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
