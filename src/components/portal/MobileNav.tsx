"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import { SidebarNavItem } from "@/components/portal/SidebarNavItem";
import type { NavItem } from "@/lib/portal/navigation";

type MobileNavContextValue = {
  open: () => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

type MobileNavProviderProps = {
  navItems: NavItem[];
  userPanel: React.ReactNode;
  branding: React.ReactNode;
  children: React.ReactNode;
};

export function MobileNavProvider({
  navItems,
  userPanel,
  branding,
  children,
}: MobileNavProviderProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const openDrawer = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.body.style.overflow = "hidden";
  };

  const closeDrawer = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.close();
    document.body.style.overflow = "";
  };

  useEffect(() => {
    closeDrawer();
  }, [pathname]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <MobileNavContext.Provider value={{ open: openDrawer }}>
      {children}
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-y-0 left-0 z-50 m-0 h-full max-h-full w-[min(100%,270px)] max-w-full border-r border-border bg-sidebar p-0 text-foreground backdrop:bg-black/60 open:flex open:flex-col"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            closeDrawer();
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div id={titleId}>{branding}</div>
          <button
            type="button"
            onClick={closeDrawer}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-muted hover:text-foreground"
            aria-label="Close navigation menu"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              activeMatch={item.activeMatch}
              onNavigate={closeDrawer}
            />
          ))}
        </nav>

        <div className="border-t border-border px-3 py-4">{userPanel}</div>
      </dialog>
    </MobileNavContext.Provider>
  );
}

type MobileNavTriggerProps = {
  className?: string;
};

export function MobileNavTrigger({ className = "" }: MobileNavTriggerProps) {
  const context = useContext(MobileNavContext);

  if (!context) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={context.open}
      className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-foreground lg:hidden ${className}`}
      aria-label="Open navigation menu"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}
