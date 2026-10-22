"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";

type UploadVideoDisplayFormProps = {
  projectSlug: string;
  onCreated: (display: CreatedDisplayPayload) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type ProbeSummary = {
  codecLabel: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  fileSizeBytes: number;
  originalFileName: string;
  sourceFilePath: string;
};

/**
 * ProRes 4444 import UI.
 * Validates and stores media locally. Playback uses the native decoder through the
 * existing Chromium composite / Output Engine path.
 * Loop is controlled from the display card after create (defaults OFF).
 */
export function UploadVideoDisplayForm({
  projectSlug,
  onCreated,
  onDirtyChange,
}: UploadVideoDisplayFormProps) {
  const defaultDescription = "ProRes 4444 Video Display";
  const [name, setName] = useState("");
  const [description, setDescription] = useState(defaultDescription);
  const [probe, setProbe] = useState<ProbeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDirty = Boolean(
    probe ||
      name.trim() ||
      (description.trim() !== "" && description.trim() !== defaultDescription),
  );
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function pickFile() {
    setError(null);
    const api = getDesktopAPI();
    if (!api?.media?.pickProResMov) {
      setError("Video import is only available in the NEUD desktop application.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.media.pickProResMov();
      if (!result.ok) {
        if (result.cancelled) return;
        setError(result.error ?? "Unable to inspect the selected media file.");
        return;
      }
      setProbe(result.probe);
      if (!name.trim()) {
        setName(result.probe.originalFileName.replace(/\.mov$/i, ""));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Media selection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setError(null);
    const api = getDesktopAPI();
    if (!api?.media?.createProResDisplay || !probe) {
      setError("Video import is only available in the NEUD desktop application.");
      return;
    }
    if (!name.trim()) {
      setError("Display name is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.media.createProResDisplay({
        projectSlug,
        name: name.trim(),
        description: description.trim() || undefined,
        sourceFilePath: probe.sourceFilePath,
        originalFileName: probe.originalFileName,
        loopEnabled: false,
      });
      if (!created.ok) {
        setError(created.error ?? "Unable to create the video display.");
        return;
      }
      onCreated(created.display);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the video display.");
    } finally {
      setBusy(false);
    }
  }

  if (!isDesktopEnvironment()) {
    return (
      <Alert variant="info">
        ProRes video displays can only be imported from the NEUD desktop application.
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <Alert variant="info">
        NEUD validates Apple ProRes 4444 (.mov), stores the file in managed local storage, and
        creates a Video display in this project for preview, pin/stack, and Output Engine. Use the
        display card Loop control after creation if repeat playback is needed.
      </Alert>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void pickFile()}>
            Choose .mov file
          </Button>
          {probe ? (
            <p className="text-sm text-muted">
              {probe.originalFileName} · {probe.codecLabel} · {probe.width}×{probe.height}
              {probe.durationSeconds != null
                ? ` · ${probe.durationSeconds.toFixed(1)}s`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-muted">No file selected.</p>
          )}
        </div>
      </Card>

      <label className="grid gap-1 text-sm text-foreground">
        Display name
        <input
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="grid gap-1 text-sm text-foreground">
        Description
        <textarea
          className="min-h-[80px] rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          value={description}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={defaultDescription}
        />
      </label>

      <Button type="button" disabled={busy || !probe || !name.trim()} onClick={() => void create()}>
        Create video display
      </Button>
    </div>
  );
}
