"use client";

import { UploadHtmlDisplayForm } from "@/components/developer-tools/UploadHtmlDisplayForm";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";

type NewDisplayFormProps = {
  projectSlug: string;
  projectId: string;
  onCreated?: (display?: CreatedDisplayPayload) => void;
};

export function NewDisplayForm({ projectSlug, onCreated }: NewDisplayFormProps) {
  return (
    <UploadHtmlDisplayForm
      projectSlug={projectSlug}
      onCreated={(display) => onCreated?.(display)}
    />
  );
}
