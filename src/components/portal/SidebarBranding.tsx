import Link from "next/link";

export function SidebarBranding() {
  return (
    <Link
      href="/dashboard"
      className="cursor-pointer text-sm font-semibold tracking-tight text-foreground sm:text-base"
    >
      HMG Graphics Server
    </Link>
  );
}
