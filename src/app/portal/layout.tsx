import { HostedAppShell } from "@/components/portal/HostedAppShell";

export default function PortalRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <HostedAppShell>{children}</HostedAppShell>;
}
