import { EmptyState } from "@/components/ui/EmptyState";

type ActivityEmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function ActivityEmptyState({ title, description, action }: ActivityEmptyStateProps) {
  return <EmptyState title={title} description={description} action={action} />;
}
