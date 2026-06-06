"use client";

import { createContext, useContext } from "react";

export type DashboardRole = "owner" | "editor" | "viewer";

/**
 * Project-level role context. Threaded from the dashboard layout (where
 * getProject returns the caller's current_user_role) through DashChrome
 * and into any client component that wants to gate buttons or hide owner-
 * only sections.
 *
 * The server-side `manageableProject` / `adminProject` helpers added in
 * Phase 1 are what actually enforce security. This context is purely a
 * UX layer — disabling buttons + hiding sections so viewers see a cleaner,
 * read-only experience and editors don't see owner-only chrome.
 */
const DashboardRoleContext = createContext<DashboardRole>("owner");

export function DashboardRoleProvider({
  role, children,
}: {
  role: DashboardRole;
  children: React.ReactNode;
}) {
  return (
    <DashboardRoleContext.Provider value={role}>
      {children}
    </DashboardRoleContext.Provider>
  );
}

export function useDashboardRole(): DashboardRole {
  return useContext(DashboardRoleContext);
}

/** True for owner + editor — anyone who can mutate watchlist or signal state. */
export function canManage(role: DashboardRole): boolean {
  return role === "owner" || role === "editor";
}
