import { Sidebar } from "@/components/portal/Sidebar";
import { TopBar } from "@/components/portal/TopBar";
import { isAdmin, requireUser } from "@/lib/auth/authorization";
import { PORTAL_NAV_ITEMS } from "@/lib/portal/navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  const { profile } = await requireUser();
  const showAdminNav = await isAdmin();
  const navItems = PORTAL_NAV_ITEMS.filter(
    (item) => !item.adminOnly || showAdminNav,
  );

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar navItems={navItems} profile={profile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar navItems={navItems} profile={profile} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
