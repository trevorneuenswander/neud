"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { TextareaField } from "@/components/ui/TextareaField";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_THEME,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
} from "@/lib/projects/constants";
import { createProject } from "@/lib/projects/actions";
import { initialProjectActionState } from "@/lib/projects/state";

export function NewProjectForm() {
  const [state, formAction] = useActionState(
    createProject,
    initialProjectActionState,
  );
  const values = state.fieldValues;

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <FormField
          id="name"
          name="name"
          label="Project name"
          placeholder="e.g. Broad Arrow Las Vegas"
          defaultValue={values?.name ?? ""}
          key={`name-${values?.name ?? "empty"}`}
        />
        <TextareaField
          id="description"
          name="description"
          label="Description"
          placeholder="Brief description of this Project"
          required={false}
          defaultValue={values?.description ?? ""}
          key={`description-${values?.description ?? "empty"}`}
        />
        <div>
          <label htmlFor="projectType" className="block text-sm font-medium text-foreground">
            Project type
          </label>
          <select
            id="projectType"
            name="projectType"
            defaultValue={values?.projectType ?? PROJECT_TYPES[0]}
            className="mt-2 block w-full cursor-pointer rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {PROJECT_TYPES.map((projectType) => (
              <option key={projectType} value={projectType}>
                {PROJECT_TYPE_LABELS[projectType]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Branding</h2>
        <p className="text-sm text-muted">
          Optional metadata for future displays. Logo URLs are stored only and not
          rendered in this phase.
        </p>
        <FormField
          id="theme"
          name="theme"
          label="Theme"
          placeholder={DEFAULT_PROJECT_THEME}
          required={false}
          defaultValue={values?.theme ?? DEFAULT_PROJECT_THEME}
          key={`theme-${values?.theme ?? DEFAULT_PROJECT_THEME}`}
        />
        <FormField
          id="icon"
          name="icon"
          label="Icon"
          placeholder={DEFAULT_PROJECT_ICON}
          required={false}
          defaultValue={values?.icon ?? DEFAULT_PROJECT_ICON}
          key={`icon-${values?.icon ?? DEFAULT_PROJECT_ICON}`}
        />
        <FormField
          id="logoUrl"
          name="logoUrl"
          label="Logo URL"
          placeholder="https://example.com/logo.png"
          required={false}
          defaultValue={values?.logoUrl ?? ""}
          key={`logoUrl-${values?.logoUrl ?? "empty"}`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="primaryColor"
            name="primaryColor"
            label="Primary color"
            placeholder="#1A2B3C"
            required={false}
            defaultValue={values?.primaryColor ?? ""}
            key={`primaryColor-${values?.primaryColor ?? "empty"}`}
          />
          <FormField
            id="secondaryColor"
            name="secondaryColor"
            label="Secondary color"
            placeholder="#4D5E6F"
            required={false}
            defaultValue={values?.secondaryColor ?? ""}
            key={`secondaryColor-${values?.secondaryColor ?? "empty"}`}
          />
        </div>
      </div>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton pendingLabel="Creating Project…">Create Project</SubmitButton>
    </form>
  );
}
