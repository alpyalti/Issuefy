/* /account only redirects (see page.tsx) into /dashboard/[projectId]/account,
   where the dashboard shell provides chrome. No UI renders here. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
