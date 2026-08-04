"use client";

import { useId, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Alert";
import {
  displayNameFromFilename,
  readHtmlUploadFile,
  validateHtmlUploadFile,
} from "@/lib/displays/html-upload";
import { DisplayCanvasPreview } from "@/components/displays/DisplayCanvasPreview";
import { localCreateDisplay, type CreatedDisplayPayload } from "@/lib/local/displays-api";

type UploadHtmlDisplayFormProps = {
  projectSlug: string;
  onCreated: (display: CreatedDisplayPayload) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type SelectedHtmlFile = {
  file: File;
  filename: string;
  html: string;
};

export function UploadHtmlDisplayForm({
  projectSlug,
  onCreated,
  onDirtyChange,
}: UploadHtmlDisplayFormProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedHtmlFile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isDirty = Boolean(selectedFile || name.trim() || description.trim());

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function loadFile(file: File) {
    setError(null);
    setSuccess(null);
    setPreviewError(null);

    const validation = await readHtmlUploadFile(file);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSelectedFile({
      file,
      filename: validation.filename,
      html: validation.html,
    });
    setName(displayNameFromFilename(validation.filename));
  }

  async function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      setError("Drop a single HTML file.");
      return;
    }
    if (event.dataTransfer.files.length > 1) {
      setError("Drop one HTML file at a time.");
      return;
    }
    const validation = validateHtmlUploadFile(file);
    if (validation && !validation.ok) {
      setError(validation.error);
      return;
    }
    void loadFile(file);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setName("");
    setDescription("");
    setError(null);
    setSuccess(null);
    setPreviewError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Choose an HTML file before creating the display.");
      return;
    }
    if (!name.trim()) {
      setError("Display name is required.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await localCreateDisplay(projectSlug, {
        name: name.trim(),
        description: description.trim() || undefined,
        html: selectedFile.html,
        uploadedFilename: selectedFile.filename,
      });
      setSuccess(`Created display "${result.display.name}".`);
      onCreated(result.display);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to create display.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl space-y-6 p-4">
      <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Selected HTML File</h3>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload HTML file"
            className={`rounded-lg border border-dashed px-4 py-8 text-center transition ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border bg-surface-raised hover:border-primary/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <p className="text-sm font-medium text-foreground">Drop an HTML file here</p>
            <p className="mt-1 text-xs text-muted">or</p>
            <Button type="button" size="sm" variant="secondary" className="mt-3">
              Choose HTML File
            </Button>
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              onChange={(event) => void handleFileInputChange(event)}
            />
          </div>
          {selectedFile ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Selected file:</span>
              <span className="font-medium text-foreground">{selectedFile.filename}</span>
              <Button type="button" size="sm" variant="secondary" onClick={clearSelectedFile}>
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </Button>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Display Details</h3>
          <FormField
            id="upload-display-name"
            name="displayName"
            label="Display Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Display Description</span>
            <textarea
              id="upload-display-description"
              name="displayDescription"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            />
          </label>
        </section>

        {selectedFile ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">HTML Preview</h3>
            <DisplayCanvasPreview
              title="Uploaded HTML preview"
              srcDoc={selectedFile.html}
              sandbox="allow-scripts"
              iframePointerEvents="auto"
              onIframeLoad={() => setPreviewError(null)}
              onIframeError={() => setPreviewError("Unable to render HTML preview.")}
            />
            {previewError ? <p className="text-sm text-red-400">{previewError}</p> : null}
          </section>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <Button type="submit" disabled={busy || !selectedFile}>
          {busy ? "Creating…" : "Create Display"}
        </Button>
      </form>
    </Card>
  );
}