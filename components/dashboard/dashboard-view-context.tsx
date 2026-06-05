"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/* In-dashboard view switching (Today / Signals / Competitor / Opportunity /
   Threat / Saved) is PURELY client-side state — no URL change, no server
   re-render. /sources and /settings stay as real Next routes (they're
   different pages, not just filtered views of the feed).

   Why context: DashChrome owns the sidebar, ProjectDashboard owns the feed.
   Both need to read+write `view`, and they're siblings in the layout tree.
   Lifting state to a shared context is the cleanest way without re-rendering
   half the layout on every click. */

export type DashboardView = "today" | "signals" | "competitor" | "opportunity" | "threat" | "saved";

interface Ctx {
  view: DashboardView;
  setView: (v: DashboardView) => void;
}

const DashboardViewContext = createContext<Ctx | null>(null);

export function DashboardViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DashboardView>("today");
  return (
    <DashboardViewContext.Provider value={{ view, setView }}>
      {children}
    </DashboardViewContext.Provider>
  );
}

export function useDashboardView(): Ctx {
  const ctx = useContext(DashboardViewContext);
  // Fallback (e.g. settings / sources pages) — return a no-op so non-dashboard
  // children inside the same chrome don't crash.
  return ctx ?? { view: "today", setView: () => {} };
}
