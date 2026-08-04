"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { TextareaField } from "@/components/ui/TextareaField";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  CREATABLE_PROJECT_DATA_TYPES,
  PROJECT_DATA_TYPE_LABELS,
} from "@/lib/projects/constants";
import { createProject } from "@/lib/projects/actions";
import { initialProjectActionState } from "@/lib/projects/state";

export function NewProjectForm() {
  const [state, formAction] = useActionState(
    createProject,
    initialProjectActionState,
  );
  const values = state.fieldValues;
  const selectedDataType = values?.dataType ?? "";

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
          <label htmlFor="dataType" className="block text-sm font-medium text-foreground">
            Data type
          </label>
          <select
            id="dataType"
            name="dataType"
            required
            defaultValue={selectedDataType}
            key={`dataType-${selectedDataType || "empty"}`}
            className="mt-2 block w-full cursor-pointer rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="" disabled>
              Select a data type
            </option>
            {CREATABLE_PROJECT_DATA_TYPES.map((dataType) => (
              <option key={dataType} value={dataType}>
                {PROJECT_DATA_TYPE_LABELS[dataType]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton pendingLabel="Creating Project…">Create Project</SubmitButton>
    </form>
  );
}
