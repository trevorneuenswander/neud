"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  PROJECT_CAPABILITY_CATALOG,
  normalizeCapabilityIds,
  validateCapabilitySelection,
  type ProjectCapabilityId,
} from "@/lib/projects/capabilities";
import { localUpdateProjectCapabilities } from "@/lib/local/project-mutations-api";

type ProjectCapabilitiesEditorProps = {
  projectSlug: string;
  initialCapabilities: string[];
};

export function ProjectCapabilitiesEditor({
  projectSlug,
  initialCapabilities,
}: ProjectCapabilitiesEditorProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProjectCapabilityId[]>(() =>
    normalizeCapabilityIds(initialCapabilities),
  );
  const [saved, setSaved] = useState<ProjectCapabilityId[]>(() =>
    normalizeCapabilityIds(initialCapabilities),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(() => {
    if (selected.length !== saved.length) return true;
    const savedSet = new Set(saved);
    return selected.some((id) => !savedSet.has(id));
  }, [saved, selected]);

  function toggle(id: ProjectCapabilityId) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
    setError(null);
  }

  async function handleSave() {
    const validation = validateCapabilitySelection(selected);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await localUpdateProjectCapabilities(projectSlug, validation.capabilities);
      setSaved(validation.capabilities);
      setSelected(validation.capabilities);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update capabilities.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted">
          Capabilities control which project modules are available. Removing a
          capability hides its module but does not delete stored data.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROJECT_CAPABILITY_CATALOG.map((capability) => {
          const isSelected = selected.includes(capability.id);
          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => toggle(capability.id)}
              className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface hover:bg-surface-raised"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                  aria-hidden
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {capability.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {capability.description}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex justify-start">
        <Button
          type="button"
          variant="primary"
          disabled={!isDirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save Capabilities"}
        </Button>
      </div>
    </Card>
  );
}
