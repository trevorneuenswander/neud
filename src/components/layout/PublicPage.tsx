import { NeudLogo } from "@/components/branding/NeudLogo";

type PublicPageProps = {
  children: React.ReactNode;
  title: string;
  description?: string;
  showLogo?: boolean;
  maxWidth?: "md" | "lg" | "xl";
};

const maxWidthClasses = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function PublicPage({
  children,
  title,
  description,
  showLogo = false,
  maxWidth = "md",
}: PublicPageProps) {
  return (
    <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className={`mx-auto ${maxWidthClasses[maxWidth]}`}>
        {showLogo ? (
          <div className="mb-8 flex justify-center">
            <NeudLogo size="lg" />
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
