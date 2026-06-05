import "../dashboard.css";

/* Reuses the dashboard's design tokens / card styles for visual consistency.
   No sidebar/topbar on /account — it's a focused, single-column flow. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
