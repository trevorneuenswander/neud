import { PublicHeader } from "@/components/layout/PublicHeader";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PublicHeader />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  );
}
