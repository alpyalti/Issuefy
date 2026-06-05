import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { Icon } from "@/components/icons/Icon";
import UpgradePicker from "@/components/upgrade/UpgradePicker";
import "../landing.css";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your plan — Issuefy" };

export default async function UpgradePage() {
  const user = await getOrCreateUser();

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.08 }}>
            Choose your plan.
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>
            14 days free, then your plan kicks in. Card on file required, but you won&apos;t be charged until day 15. Cancel anytime.
          </p>
        </div>
        <Link href="/account" className="btn btn-ghost">
          <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Back to account
        </Link>
      </header>
      <UpgradePicker currentPlan={user.plan} />
    </div>
  );
}
