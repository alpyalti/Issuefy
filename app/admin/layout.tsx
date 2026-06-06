import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Icon } from "@/components/icons/Icon";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Issuefy" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Calling requireAdmin() at the layout level renders a 404 for non-admins
  // before any child page even tries to load.
  const admin = await requireAdmin();

  return (
    <div className="dash">
      <aside className="sidebar">
        <Link href="/" className="brand side-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
        </Link>
        <div className="side-section">
          <div className="side-label">Admin</div>
          <nav className="side-nav">
            <Link href="/admin" className="side-item">
              <Icon name="DashboardSquare01Icon" size={19} stroke={1.6} /> Overview
            </Link>
            <Link href="/admin/users" className="side-item">
              <Icon name="Target01Icon" size={19} stroke={1.6} /> Users
            </Link>
            <Link href="/admin/support" className="side-item">
              <Icon name="HelpCircleIcon" size={19} stroke={1.6} /> Support
            </Link>
            <Link href="/admin/settings" className="side-item">
              <Icon name="Settings01Icon" size={19} stroke={1.6} /> Settings
            </Link>
          </nav>
        </div>
        <div className="side-foot">
          <Link href="/dashboard" className="profile">
            <span className="avatar">{(admin.name || admin.email).split(/\s|@/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase()}</span>
            <span className="profile-meta">
              <span className="profile-name">{admin.name || admin.email}</span>
              <span className="profile-role">Admin</span>
            </span>
            <Icon name="ArrowLeft01Icon" size={17} stroke={1.6} />
          </Link>
        </div>
      </aside>
      <main className="main">
        <div className="main-scroll">{children}</div>
      </main>
    </div>
  );
}
