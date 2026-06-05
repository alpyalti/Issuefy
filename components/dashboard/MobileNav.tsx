"use client";

import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { useDashboardView, type DashboardView } from "./dashboard-view-context";

/**
 * Mobile bottom tab bar — fixed to the viewport, four tabs.
 *
 * Wired to the SAME DashboardViewContext as the desktop sidebar, so:
 *   - tapping Today / Signals updates context instantly (no server fetch)
 *   - tapping Sources / Settings is a real route navigation
 *
 * Hidden on viewports ≥ 760px (sidebar takes over).
 * Renders inside DashChrome but is positioned `fixed`, so the .main-scroll
 * already has bottom-padding via dashboard.css to clear it.
 */
const TABS: Array<{
  id: DashboardView | "sources" | "settings";
  label: string;
  icon: IconName;
  kind: "view" | "route";
}> = [
  { id: "today", label: "Today", icon: "DashboardSquare01Icon", kind: "view" },
  { id: "signals", label: "Signals", icon: "FlashIcon", kind: "view" },
  { id: "sources", label: "Sources", icon: "News01Icon", kind: "route" },
  { id: "settings", label: "Settings", icon: "Settings01Icon", kind: "route" },
];

export default function MobileNav({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { view, setView } = useDashboardView();

  const realRoute =
    pathname?.endsWith("/sources") ? "sources" :
    pathname?.endsWith("/settings") ? "settings" :
    null;
  const isDashboardIndex = !realRoute;
  const activeId: string = realRoute ?? view;

  function onTap(t: typeof TABS[number]) {
    if (t.kind === "view") {
      // If we're already on the dashboard index, just flip context. Otherwise
      // navigate back to the index AND set the desired view.
      if (isDashboardIndex) {
        setView(t.id as DashboardView);
      } else {
        setView(t.id as DashboardView);
        router.push(`/dashboard/${projectId}`);
      }
    } else if (t.id === "sources") {
      router.push(`/dashboard/${projectId}/sources`);
    } else if (t.id === "settings") {
      router.push(`/dashboard/${projectId}/settings`);
    }
  }

  return (
    <nav className="mobile-tabs" aria-label="Project navigation">
      {TABS.map((t) => {
        const isActive = activeId === t.id;
        return (
          <button
            key={t.id}
            className={"mobile-tab " + (isActive ? "on" : "")}
            onClick={() => onTap(t)}
            aria-current={isActive ? "page" : undefined}
            aria-label={t.label}
          >
            <Icon name={t.icon} size={20} stroke={isActive ? 1.9 : 1.6} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
