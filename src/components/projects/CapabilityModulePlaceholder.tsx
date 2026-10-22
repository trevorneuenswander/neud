import { Card } from "@/components/ui/Card";
import { getCapabilityDefinition, getCapabilityLabel } from "@/lib/projects/capabilities";

type CapabilityModulePlaceholderProps = {
  capabilityId: string;
};

export function CapabilityModulePlaceholder({
  capabilityId,
}: CapabilityModulePlaceholderProps) {
  const def = getCapabilityDefinition(capabilityId);
  const label = def?.label ?? getCapabilityLabel(capabilityId);

  return (
    <Card className="space-y-3 p-6">
      <h2 className="text-lg font-medium text-foreground">{label}</h2>
      <p className="text-sm text-muted">
        {def?.description ??
          "This capability is configured for the project."}
      </p>
      <p className="text-sm text-muted">
        This capability is configured, but its workflow is coming in a future
        phase.
      </p>
    </Card>
  );
}
