"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { NeudModal } from "@/components/ui/NeudModal";
import {
  PROJECT_CAPABILITY_CATALOG,
  getCapabilityLabel,
  validateCapabilitySelection,
  type ProjectCapabilityId,
} from "@/lib/projects/capabilities";
import { generateSlugFromName } from "@/lib/projects/validation";
import { localGetProjectCreateMeta, localSlugExists } from "@/lib/local/api";
import { localCreateProject } from "@/lib/local/project-mutations-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { createProjectWithCapabilitiesAction } from "@/lib/projects/actions";

type AssignableTeam = { id: string; name: string };

type NewProjectWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

type WizardStep = 1 | 2 | 3;

export function NewProjectWizard({
  open,
  onClose,
  onCreated,
}: NewProjectWizardProps) {
  const router = useRouter();
  const isLocal = shouldUseLocalDataClient();
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState<ProjectCapabilityId[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<AssignableTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const slug = useMemo(() => generateSlugFromName(name) || "", [name]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setStep(1);
    setName("");
    setDescription("");
    setCapabilities([]);
    setTeamIds([]);
    setError(null);
    setSubmitting(false);

    if (!isLocal) {
      return;
    }
    setLoadingTeams(true);
    void localGetProjectCreateMeta()
      .then((result) => {
        setTeams(result.teams ?? []);
      })
      .catch(() => {
        setTeams([]);
      })
      .finally(() => {
        setLoadingTeams(false);
      });
  }, [open, isLocal]);

  if (!open) {
    return null;
  }

  function toggleCapability(id: ProjectCapabilityId) {
    setCapabilities((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
    setError(null);
  }

  function toggleTeam(id: string) {
    setTeamIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  async function goNext() {
    setError(null);
    if (step === 1) {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Project name is required.");
        return;
      }
      if (trimmed.length > 80) {
        setError("Project name must be 80 characters or fewer.");
        return;
      }
      if (!slug) {
        setError("Project name must contain at least one letter or number.");
        return;
      }
      if (description.trim().length > 500) {
        setError("Description must be 500 characters or fewer.");
        return;
      }
      if (isLocal) {
        try {
          const exists = await localSlugExists(slug);
          if (exists.exists) {
            setError("A project with a similar name already exists. Try a different name.");
            return;
          }
        } catch {
          // Continue; create will re-validate.
        }
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const validation = validateCapabilitySelection(capabilities);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      setStep(3);
    }
  }

  async function handleCreate() {
    const validation = validateCapabilitySelection(capabilities);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isLocal) {
        await localCreateProject({
          name: name.trim(),
          slug,
          projectType: "modular",
          description: description.trim() || null,
          capabilities: validation.capabilities,
          teamIds,
        });
      } else {
        const result = await createProjectWithCapabilitiesAction({
          name: name.trim(),
          description: description.trim() || null,
          capabilities: validation.capabilities,
          teamIds,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onCreated?.();
      onClose();
      router.refresh();
      window.dispatchEvent(new Event("neud:projects-directory-refreshed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitle =
    step === 1
      ? "Project Details"
      : step === 2
        ? "Capabilities"
        : "Access";

  return (
    <NeudModal
      title="New Project"
      description={`Step ${step} of 3 — ${stepTitle}`}
      onClose={onClose}
      size="wide"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === 1) {
                onClose();
                return;
              }
              setError(null);
              setStep((current) => (current - 1) as WizardStep);
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button type="button" variant="primary" onClick={() => void goNext()}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={submitting}
              onClick={() => void handleCreate()}
            >
              {submitting ? "Creating…" : "Create Project"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {step === 1 ? (
          <div className="space-y-4">
            <FormField
              id="new-project-name"
              name="name"
              label="Project Name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <FormField
              id="new-project-description"
              name="description"
              label="Description"
              required={false}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid max-h-[min(50vh,28rem)] gap-3 overflow-y-auto sm:grid-cols-2">
            {PROJECT_CAPABILITY_CATALOG.map((capability) => {
              const isSelected = capabilities.includes(capability.id);
              return (
                <button
                  key={capability.id}
                  type="button"
                  onClick={() => toggleCapability(capability.id)}
                  className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:bg-surface-raised"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">
                    {capability.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {capability.description}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-raised/40 p-4 text-sm">
              <p className="font-medium text-foreground">{name.trim()}</p>
              {description.trim() ? (
                <p className="mt-1 text-muted">{description.trim()}</p>
              ) : null}
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                Capabilities
              </p>
              <p className="mt-1 text-foreground">
                {capabilities.map((id) => getCapabilityLabel(id)).join(", ")}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">Teams</p>
              <p className="mt-1 text-sm text-muted">
                Optional. Projects without a Team can still have users added
                directly through Project Access.
              </p>
              {loadingTeams ? (
                <p className="mt-3 text-sm text-muted">Loading teams…</p>
              ) : teams.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No assignable teams.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {teams.map((team) => {
                    const isSelected = teamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => toggleTeam(team.id)}
                        className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-surface hover:bg-surface-raised"
                        }`}
                      >
                        <span className="block text-sm font-medium text-foreground">
                          {team.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setTeamIds([])}
                className={`mt-3 w-full cursor-pointer rounded-lg border p-3 text-left text-sm transition-colors ${
                  teamIds.length === 0
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-surface text-muted hover:bg-surface-raised"
                }`}
              >
                No Team
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </NeudModal>
  );
}
