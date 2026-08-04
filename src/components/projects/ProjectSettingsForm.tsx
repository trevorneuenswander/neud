"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { localUpdateProjectSettings } from "@/lib/local/api";
import { normalizeProjectIsActive } from "@/lib/projects/project-permissions";

const MAX_PROJECT_NAME_LENGTH = 80;
const MAX_PROJECT_DESCRIPTION_LENGTH = 500;

type ProjectSettingsDraft = {
  name: string;
  description: string;
  isActive: boolean;
};

type ProjectSettingsFormProps = {
  projectSlug: string;
  initialName: string;
  initialDescription: string | null;
  initialIsActive: boolean;
};

function buildDraft(input: {
  name: string;
  description: string | null;
  isActive: boolean;
}): ProjectSettingsDraft {
  return {
    name: input.name,
    description: input.description?.trim() ?? "",
    isActive: input.isActive,
  };
}

export function ProjectSettingsForm({
  projectSlug,
  initialName,
  initialDescription,
  initialIsActive,
}: ProjectSettingsFormProps) {
  const router = useRouter();
  const [savedDraft, setSavedDraft] = useState<ProjectSettingsDraft>(() =>
    buildDraft({
      name: initialName,
      description: initialDescription,
      isActive: initialIsActive,
    }),
  );
  const [draft, setDraft] = useState<ProjectSettingsDraft>(() =>
    buildDraft({
      name: initialName,
      description: initialDescription,
      isActive: initialIsActive,
    }),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextSaved = buildDraft({
      name: initialName,
      description: initialDescription,
      isActive: initialIsActive,
    });
    setSavedDraft(nextSaved);
    setDraft(nextSaved);
    setNameError(null);
    setFormError(null);
  }, [projectSlug, initialName, initialDescription, initialIsActive]);

  const isDirty = useMemo(
    () =>
      draft.name !== savedDraft.name ||
      draft.description !== savedDraft.description ||
      draft.isActive !== savedDraft.isActive,
    [draft, savedDraft],
  );

  const validateName = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Project name is required.";
    }
    if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
      return `Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer.`;
    }
    return null;
  }, []);

  const validateDescription = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
      return `Project description must be ${MAX_PROJECT_DESCRIPTION_LENGTH} characters or fewer.`;
    }
    return null;
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = draft.name.trim();
    const trimmedDescription = draft.description.trim();
    const nextNameError = validateName(draft.name);
    const nextDescriptionError = validateDescription(draft.description);
    setNameError(nextNameError);
    setFormError(null);

    if (nextNameError || nextDescriptionError) {
      if (nextDescriptionError) {
        setFormError(nextDescriptionError);
      }
      return;
    }

    setSaving(true);
    try {
      await localUpdateProjectSettings(projectSlug, {
        name: trimmedName,
        description: trimmedDescription || null,
        isActive: draft.isActive,
      });
      const nextDraft = {
        name: trimmedName,
        description: trimmedDescription,
        isActive: draft.isActive,
      };
      setSavedDraft(nextDraft);
      setDraft(nextDraft);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The project could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, projectSlug, router, validateDescription, validateName]);

  const handleRevert = useCallback(() => {
    setDraft(savedDraft);
    setNameError(null);
    setFormError(null);
  }, [savedDraft]);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Project settings</h2>
        <p className="mt-1 text-sm text-muted">
          Update the project name, description, and whether it appears for operators and
          viewers.
        </p>
      </div>

      <div>
        <FormField
          id="project-name"
          name="project-name"
          label="Project Name"
          value={draft.name}
          onChange={(event) => {
            setDraft((current) => ({ ...current, name: event.target.value }));
            if (nameError) {
              setNameError(validateName(event.target.value));
            }
          }}
          required
        />
        {nameError ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="project-description" className="text-sm font-medium text-foreground">
          Project Description
        </label>
        <textarea
          id="project-description"
          name="project-description"
          rows={4}
          value={draft.description}
          onChange={(event) => {
            setDraft((current) => ({ ...current, description: event.target.value }));
          }}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          placeholder="Optional project description"
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Project Status</p>
          <p className="text-sm text-muted">
            {draft.isActive
              ? "Active — operators and viewers can access this project."
              : "Inactive — only owners and admins can access this project."}
          </p>
        </div>
        <Switch
          checked={draft.isActive}
          onCheckedChange={(checked) =>
            setDraft((current) => ({ ...current, isActive: checked }))
          }
          aria-label="Project active status"
        />
      </div>

      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={saving || !isDirty}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleRevert}
          disabled={saving || !isDirty}
        >
          Revert
        </Button>
      </div>
    </Card>
  );
}
