"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

export interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  last_dashboard_visit_at: string | null;
  projects: number;
}

export default function UsersTable({ users: initial, initialSearch }: { users: UserListRow[]; initialSearch: string }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [search, setSearch] = useState(initialSearch);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/admin/users?q=${encodeURIComponent(search)}`);
  }

  async function toggleRole(u: UserListRow) {
    const nextRole = u.role === "admin" ? "user" : "admin";
    if (!confirm(`${nextRole === "admin" ? "Grant" : "Revoke"} admin for ${u.email}?`)) return;
    const res = await fetch(`/api/admin/users/${u.id}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
    } else {
      alert("Couldn't change role. Check console.");
    }
  }

  return (
    <>
      <form onSubmit={submitSearch} style={{ display: "flex", gap: 8 }}>
        <input
          className="modal-input"
          placeholder="Search by email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost">Search</button>
      </form>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase" }}>
              <Th>User</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th>Projects</Th>
              <Th>Joined</Th>
              <Th>Role</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                <Td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{u.email}</span>
                    {u.name && <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{u.name}</span>}
                  </div>
                </Td>
                <Td><span className="pill pill-info" style={{ fontSize: 11 }}>{u.plan}</span></Td>
                <Td>
                  <span className="mono" style={{ fontSize: 11.5, color: u.subscription_status === "past_due" ? "var(--neg)" : u.subscription_status === "active" ? "var(--pos)" : "var(--ink-3)" }}>
                    {u.subscription_status || "—"}
                  </span>
                </Td>
                <Td>{u.projects}</Td>
                <Td>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </Td>
                <Td>
                  <button
                    className={"btn btn-sm " + (u.role === "admin" ? "btn-accent" : "btn-ghost")}
                    onClick={() => toggleRole(u)}
                    style={{ fontSize: 12 }}
                  >
                    {u.role === "admin" ? <><Icon name="CheckmarkBadge01Icon" size={12} stroke={1.8} />Admin</> : "Make admin"}
                  </button>
                </Td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><Td colSpan={6}><p className="muted" style={{ textAlign: "center", padding: 24, fontSize: 13.5 }}>No users match.</p></Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 500 }}>{children}</th>;
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ padding: "10px 14px" }}>{children}</td>;
}
