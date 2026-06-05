import DashboardApp from "@/components/dashboard/DashboardApp";

/* Phase 1: single-project mock dashboard. Phase 2 moves to
   /dashboard/[projectId] with real project data; this top-level route then
   becomes the project list / "no project" empty state with a redirect. */
export default function DashboardPage() {
  return <DashboardApp />;
}
