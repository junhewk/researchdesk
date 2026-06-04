import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  FileText,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { MobileNavDrawer, NavLink } from "@/components/NavLink";
import { workspaceRegistry } from "@/workspaces/registry";
import type { WorkspaceIcon } from "@/workspaces/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "reviewer-agent",
  description: "Academic peer-review and revision workspace.",
};

function BrandBlock() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 px-4 py-4 border-b border-[color:var(--color-outline-variant)]"
    >
      <div
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)]"
      >
        <span
          className="font-display text-[15px] font-bold"
        >
          RA
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-display text-[15px] font-semibold leading-tight text-[color:var(--color-on-surface)]">
          reviewer-agent
        </div>
        <div className="label-sm mt-0.5 text-[color:var(--color-on-surface-variant)]">
          Academic Revision
        </div>
      </div>
    </Link>
  );
}

function PrimaryNav() {
  const iconFor = (icon: WorkspaceIcon) => {
    switch (icon) {
      case "dashboard":
        return <LayoutDashboard className="h-4 w-4" strokeWidth={1.75} />;
      case "myArticles":
        return <FileText className="h-4 w-4" strokeWidth={1.75} />;
      case "methodsWorkbench":
        return <FlaskConical className="h-4 w-4" strokeWidth={1.75} />;
    }
  };

  return (
    <nav
      aria-label="Main"
      className="flex-1 flex flex-col gap-0.5 py-3"
    >
      {workspaceRegistry.map((workspace) => (
        <NavLink
          key={workspace.id}
          href={workspace.href}
          icon={iconFor(workspace.icon)}
          matchPrefix={workspace.matchPrefix}
        >
          {workspace.label}
        </NavLink>
      ))}
      <NavLink
        href="/archives"
        icon={<Archive className="h-4 w-4" strokeWidth={1.75} />}
      >
        Archives
      </NavLink>
    </nav>
  );
}

function FooterNav() {
  return (
    <nav
      aria-label="Account"
      className="flex flex-col gap-0.5 py-3 border-t border-[color:var(--color-outline-variant)]"
    >
      <NavLink
        href="/settings"
        icon={<Settings className="h-4 w-4" strokeWidth={1.75} />}
      >
        Settings
      </NavLink>
      <NavLink
        href="/support"
        icon={<HelpCircle className="h-4 w-4" strokeWidth={1.75} />}
      >
        Support
      </NavLink>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          {/* Desktop persistent rail */}
          <aside
            aria-label="Primary navigation"
            className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]"
          >
            <BrandBlock />
            <PrimaryNav />
            <FooterNav />
          </aside>

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile top bar (lg- only) */}
            <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]">
              <Link
                href="/"
                className="flex items-center gap-2.5 min-w-0"
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] font-display text-[11px] font-bold"
                >
                  RA
                </span>
                <span className="font-display text-[14px] font-semibold text-[color:var(--color-on-surface)] truncate">
                  reviewer-agent
                </span>
              </Link>
              <MobileNavDrawer>
                <BrandBlock />
                <PrimaryNav />
                <FooterNav />
              </MobileNavDrawer>
            </header>

            <main className="flex-1 px-5 sm:px-8 lg:px-12 py-8 lg:py-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
