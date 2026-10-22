import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function IconBase({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className ?? "h-4 w-4 shrink-0"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function EditorUndoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a5 5 0 015 5v1" />
    </IconBase>
  );
}

export function EditorRedoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a5 5 0 00-5 5v1" />
    </IconBase>
  );
}

export function EditorSelectIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 3l7.5 18 2-7 7-2L4 3z" />
    </IconBase>
  );
}

export function EditorTextIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </IconBase>
  );
}

export function EditorRectIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </IconBase>
  );
}

export function EditorEllipseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </IconBase>
  );
}

export function EditorLineIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19L19 5" />
    </IconBase>
  );
}

export function EditorImageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M4.5 17l5-4.5 3.5 3 3-2.5 3.5 4" />
    </IconBase>
  );
}

export function EditorZoomOutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
      <path d="M8 11h6" />
    </IconBase>
  );
}

export function EditorZoomInIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </IconBase>
  );
}
