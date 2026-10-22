"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadHtmlDisplayForm } from "@/components/developer-tools/UploadHtmlDisplayForm";
import { UploadVideoDisplayForm } from "@/components/developer-tools/UploadVideoDisplayForm";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NeudModal } from "@/components/ui/NeudModal";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";

type AddDisplayButtonProps = {
  projectSlug: string;
  onCreated: (display: CreatedDisplayPayload) => void;
};

type ChooserOption = "html" | "video" | "ai";

const CHOICES: Array<{
  id: ChooserOption;
  title: string;
  description: string;
  available: boolean;
}> = [
  {
    id: "html",
    title: "HTML",
    description: "Upload an HTML graphic using the existing display workflow.",
    available: true,
  },
  {
    id: "video",
    title: "ProRes 4444 w/ Alpha Video File",
    description:
      "Import a local .mov with Apple ProRes 4444 and alpha for use as a NEUD display.",
    available: true,
  },
  {
    id: "ai",
    title: "Create with AI",
    description: "Generate graphics with AI. Coming soon.",
    available: false,
  },
];

/**
 * Add Display entry point: chooser → HTML upload (existing) or video import foundation.
 * Create with AI is visible but disabled.
 */
export function AddDisplayButton({ projectSlug, onCreated }: AddDisplayButtonProps) {
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [hasUnsavedUpload, setHasUnsavedUpload] = useState(false);

  function requestCloseHtml() {
    if (hasUnsavedUpload) {
      setConfirmClose(true);
      return;
    }
    setHtmlOpen(false);
  }

  function requestCloseVideo() {
    if (hasUnsavedUpload) {
      setConfirmClose(true);
      return;
    }
    setVideoOpen(false);
  }

  function selectChoice(id: ChooserOption) {
    if (id === "ai") return;
    setChooserOpen(false);
    setHasUnsavedUpload(false);
    if (id === "html") setHtmlOpen(true);
    if (id === "video") setVideoOpen(true);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setChooserOpen(true)}>
        Add Display
      </Button>

      {chooserOpen ? (
        <NeudModal
          title="Add Display"
          description="Choose how you want to create a new display for this project."
          onClose={() => setChooserOpen(false)}
          size="default"
        >
          <div className="grid gap-3">
            {CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={!choice.available}
                onClick={() => selectChoice(choice.id)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  choice.available
                    ? "border-border bg-surface-raised hover:border-primary/50 hover:bg-surface"
                    : "cursor-not-allowed border-border/60 bg-surface opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{choice.title}</p>
                  {!choice.available ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Coming Soon
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">{choice.description}</p>
              </button>
            ))}
          </div>
        </NeudModal>
      ) : null}

      <SlideOverPanel
        title="Add HTML Display"
        subtitle="Upload an HTML file to create a new project display"
        open={htmlOpen}
        onClose={requestCloseHtml}
      >
        <UploadHtmlDisplayForm
          projectSlug={projectSlug}
          onDirtyChange={setHasUnsavedUpload}
          onCreated={(display) => {
            onCreated(display);
            setHasUnsavedUpload(false);
            setHtmlOpen(false);
            router.refresh();
          }}
        />
      </SlideOverPanel>

      <SlideOverPanel
        title="Add ProRes Video Display"
        subtitle="Import a ProRes 4444 .mov with alpha into managed local storage"
        open={videoOpen}
        onClose={requestCloseVideo}
      >
        <UploadVideoDisplayForm
          projectSlug={projectSlug}
          onDirtyChange={setHasUnsavedUpload}
          onCreated={(display) => {
            onCreated(display);
            setHasUnsavedUpload(false);
            setVideoOpen(false);
            router.refresh();
          }}
        />
      </SlideOverPanel>

      {confirmClose ? (
        <ConfirmDialog
          title="Discard upload?"
          description="You have unsaved upload details. Close without creating the display?"
          confirmLabel="Discard"
          confirmVariant="destructive"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            setHasUnsavedUpload(false);
            setHtmlOpen(false);
            setVideoOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** @deprecated Prefer AddDisplayButton — kept for existing imports during transition. */
export { AddDisplayButton as AddHtmlDisplayButton };
