import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/projects/ProjectNav";
import { requireProjectAccess } from "@/lib/projects/authorization";

type ProjectLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);

  if (!access) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <ProjectNav slug={access.project.slug} />
      {children}
    </div>
  );
}
