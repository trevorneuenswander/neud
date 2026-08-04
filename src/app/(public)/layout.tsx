import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicHeaderGate } from "@/components/layout/PublicHeaderGate";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PublicHeaderGate>
        <PublicHeader />
      </PublicHeaderGate>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  );
}
