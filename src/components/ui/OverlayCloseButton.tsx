"use client";

type OverlayCloseButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

export function OverlayCloseButton({
  onClick,
  disabled = false,
  className = "",
  label = "Close",
}: OverlayCloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={onClick}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        &#10005;
      </span>
    </button>
  );
}
