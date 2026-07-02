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
import { LanguageBootstrap } from "@/components/LanguageBootstrap";
import { getAppLanguage, type AppLanguage } from "@/server/appLanguage";
import { workspaceRegistry } from "@/workspaces/registry";
import type { WorkspaceIcon } from "@/workspaces/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResearchDesk",
  description: "AI prompt harnesses for scholarly articles.",
};

export const dynamic = "force-dynamic";

const SHELL_COPY: Record<AppLanguage, {
  ariaMain: string;
  ariaAccount: string;
  ariaPrimary: string;
  tagline: string;
  nav: Record<string, string>;
}> = {
  en: {
    ariaMain: "Main",
    ariaAccount: "Account",
    ariaPrimary: "Primary navigation",
    tagline: "AI prompt harnesses",
    nav: {
      dashboard: "Dashboard",
      methodsWorkbench: "Methods Workbench",
      myArticles: "My Articles",
      archives: "Archives",
      settings: "Settings",
      support: "Support",
    },
  },
  ko: {
    ariaMain: "주요 메뉴",
    ariaAccount: "계정 메뉴",
    ariaPrimary: "기본 탐색",
    tagline: "AI 프롬프트 하네스",
    nav: {
      dashboard: "대시보드",
      methodsWorkbench: "Methods Workbench",
      myArticles: "My Articles",
      archives: "아카이브",
      settings: "설정",
      support: "지원",
    },
  },
};

function BrandBlock({ language }: { language: AppLanguage }) {
  const copy = SHELL_COPY[language];

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
          RD
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-display text-[15px] font-semibold leading-tight text-[color:var(--color-on-surface)]">
          ResearchDesk
        </div>
        <div className="label-sm mt-0.5 text-[color:var(--color-on-surface-variant)]">
          {copy.tagline}
        </div>
      </div>
    </Link>
  );
}

function PrimaryNav({ language }: { language: AppLanguage }) {
  const copy = SHELL_COPY[language];
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
      aria-label={copy.ariaMain}
      className="flex-1 flex flex-col gap-0.5 py-3"
    >
      {workspaceRegistry.map((workspace) => (
        <NavLink
          key={workspace.id}
          href={workspace.href}
          icon={iconFor(workspace.icon)}
          matchPrefix={workspace.matchPrefix}
        >
          {copy.nav[workspace.id] ?? workspace.label}
        </NavLink>
      ))}
      <NavLink
        href="/archives"
        icon={<Archive className="h-4 w-4" strokeWidth={1.75} />}
      >
        {copy.nav.archives}
      </NavLink>
    </nav>
  );
}

function FooterNav({ language }: { language: AppLanguage }) {
  const copy = SHELL_COPY[language];

  return (
    <nav
      aria-label={copy.ariaAccount}
      className="flex flex-col gap-0.5 py-3 border-t border-[color:var(--color-outline-variant)]"
    >
      <NavLink
        href="/settings"
        icon={<Settings className="h-4 w-4" strokeWidth={1.75} />}
      >
        {copy.nav.settings}
      </NavLink>
      <NavLink
        href="/support"
        icon={<HelpCircle className="h-4 w-4" strokeWidth={1.75} />}
      >
        {copy.nav.support}
      </NavLink>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const language = getAppLanguage();
  const copy = SHELL_COPY[language];

  return (
    <html lang={language}>
      <body className="antialiased">
        <LanguageBootstrap language={language} />
        <div className="flex min-h-screen">
          {/* Desktop persistent rail */}
          <aside
            aria-label={copy.ariaPrimary}
            className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]"
          >
            <BrandBlock language={language} />
            <PrimaryNav language={language} />
            <FooterNav language={language} />
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
                  RD
                </span>
                <span className="font-display text-[14px] font-semibold text-[color:var(--color-on-surface)] truncate">
                  ResearchDesk
                </span>
              </Link>
              <MobileNavDrawer>
                <BrandBlock language={language} />
                <PrimaryNav language={language} />
                <FooterNav language={language} />
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
