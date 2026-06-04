"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

interface NavLinkProps {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  /** Treat sub-paths as active too (default true). The root "/" never
   * matches by prefix — only exact, so it doesn't claim every page. */
  matchPrefix?: boolean;
  onNavigate?: () => void;
}

export function NavLink({
  href,
  icon,
  children,
  matchPrefix = true,
  onNavigate,
}: NavLinkProps) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : matchPrefix
        ? pathname === href || pathname.startsWith(`${href}/`)
        : pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 px-4 py-2.5 text-[14px] transition-colors ${
        active
          ? "bg-[color:var(--color-surface-container-high)] text-[color:var(--color-on-surface)] font-medium"
          : "text-[color:var(--color-on-surface-variant)] hover:bg-[color:var(--color-surface-container-low)] hover:text-[color:var(--color-on-surface)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[color:var(--color-primary)]"
        />
      )}
      <span
        className={`flex-shrink-0 ${
          active
            ? "text-[color:var(--color-primary)]"
            : "text-[color:var(--color-on-surface-variant)] group-hover:text-[color:var(--color-on-surface)]"
        }`}
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

/**
 * Mobile slide-in drawer. Auto-closes on pathname change so navigation
 * dismisses the drawer without callback wiring.
 */
export function MobileNavDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Compare-and-reset (React-recommended pattern over useEffect for
  // "reset state when a derived value changes"). Closes the drawer
  // whenever navigation lands on a new pathname.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded text-[color:var(--color-on-surface-variant)] hover:bg-[color:var(--color-surface-container)] hover:text-[color:var(--color-on-surface)] transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[color:var(--color-inverse-surface)]/40 backdrop-blur-[2px] cursor-default"
          />
          <aside
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] flex flex-col bg-[color:var(--color-surface-container-low)] border-r border-[color:var(--color-outline-variant)] shadow-[0_4px_24px_rgba(22,40,57,0.08)] animate-[slide-in_180ms_ease-out_both]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded text-[color:var(--color-on-surface-variant)] hover:bg-[color:var(--color-surface-container)] hover:text-[color:var(--color-on-surface)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </aside>
          <style>{`
            @keyframes slide-in {
              from { transform: translateX(-12px); opacity: 0; }
              to   { transform: translateX(0);     opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
