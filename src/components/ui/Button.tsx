import Link from "next/link";

type ButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "destructive";
  size?: "sm" | "md";
  href?: string;
  target?: string;
  rel?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
} & React.RefAttributes<HTMLButtonElement>;

const variantClasses = {
  primary:
    "bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50",
  secondary:
    "border border-border bg-surface-raised text-foreground hover:bg-surface disabled:opacity-50",
  ghost:
    "text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-50",
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50",
  destructive:
    "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};

const sizeClasses = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  target,
  rel,
  type = "button",
  disabled = false,
  className = "",
  title,
  "aria-label": ariaLabel,
  onClick,
  onMouseDown,
  ref,
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} target={target} rel={rel}>
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={classes}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}
