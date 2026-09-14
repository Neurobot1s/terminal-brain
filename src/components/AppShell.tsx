/**
 * AppShell — persistent layout: desktop sidebar, top bar, mobile bottom nav,
 * routed page content.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/nav";
import { BrainProvider } from "@/components/BrainProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

/** Memoized: only re-renders when the active route actually changes. */
const BottomNav = memo(function BottomNav() {
  const { pathname } = useLocation();
  const items = useMemo(() => NAV_ITEMS.slice(0, 5), []);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 hidden items-stretch justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:flex lg:hidden">
      {items.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="truncate">{label}</span>
            <span
              className={cn(
                "h-0.5 w-6 rounded-full",
                active ? "bg-primary" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
      {/* More → Settings */}
      <Link
        to="/settings"
        aria-label="More"
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] transition-colors",
          pathname.startsWith("/settings") ? "text-primary" : "text-muted-foreground",
        )}
      >
        <span className="grid size-4 place-items-center font-mono text-[10px] leading-none">⋯</span>
        <span>More</span>
        <span
          className={cn(
            "h-0.5 w-6 rounded-full",
            pathname.startsWith("/settings") ? "bg-primary" : "bg-transparent",
          )}
        />
      </Link>
    </nav>
  );
});

export default AppShell;

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Body scroll lock while drawer is open. Drawer links close it themselves.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <BrainProvider>
      <div className="min-h-screen bg-background">
        <div className="term-grid pointer-events-none fixed inset-0 opacity-70" />
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className={cn("relative transition-[padding] duration-300", collapsed ? "lg:pl-16" : "lg:pl-60")}>
          <TopBar onMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-5 sm:px-6 lg:pb-10">
            <Outlet />
          </main>
        </div>
        <BottomNav />
      </div>
    </BrainProvider>
  );
}
