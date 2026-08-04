type DeveloperToolsWarningProps = {
  message?: string;
};

export function DeveloperToolsWarning({
  message = "Changes made here can affect scraper execution and live graphics. Validate and preview changes before publishing.",
}: DeveloperToolsWarningProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      {message}
    </div>
  );
}
