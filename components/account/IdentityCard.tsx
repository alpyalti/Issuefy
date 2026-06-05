"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10.5,
  color: "var(--ink-3)",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 6,
};

export default function IdentityCard({
  email, initialName, initialCompany,
}: {
  email: string;
  initialName: string | null;
  initialCompany: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, company_name: company }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1_500);
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="card" style={{ padding: 22 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>Identity</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Email</label>
          <div style={{
            height: 46, padding: "0 14px",
            border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)",
            background: "var(--surface-2)", color: "var(--ink-2)",
            display: "flex", alignItems: "center", fontFamily: "var(--mono)", fontSize: 14,
          }}>{email}</div>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-4)", marginTop: 6 }}>
            Email changes are managed in Clerk — click Security below.
          </p>
        </div>
        <div>
          <label style={labelStyle} htmlFor="acc-name">Name</label>
          <input id="acc-name" className="modal-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="acc-company">Company</label>
          <input id="acc-company" className="modal-input" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }}>
        {status === "saved" && <span className="mono" style={{ fontSize: 12, color: "var(--pos)" }}>✓ Saved</span>}
        {status === "error" && <span className="mono" style={{ fontSize: 12, color: "var(--neg)" }}>Couldn&apos;t save — try again</span>}
        <button className="btn btn-accent" onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

export { labelStyle as accountLabelStyle };
void Icon; // keep import for future use
