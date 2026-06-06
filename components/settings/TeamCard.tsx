"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

/**
 * Team management card (Teams Phase 3). Owner-only. Lists current members
 * (with self highlighted), pending invitations, and an invite form. Disabled
 * with an "Upgrade for more seats →" link when the user is at their seat cap.
 *
 * All mutations hit the API routes added in Phase 3:
 *   POST   /api/projects/:id/invitations
 *   DELETE /api/projects/:id/invitations/:inviteId
 *   PATCH  /api/projects/:id/members/:userId
 *   DELETE /api/projects/:id/members/:userId
 */
interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
}
interface Invitation {
  id: string;
  email: string;
  role: "editor" | "viewer";
  expires_at: string;
  created_at: string;
}

interface MembersResponse { members: Member[]; invitations: Invitation[]; }

export default function TeamCard({
  projectId,
  currentUserId,
  seatsUsedInitial,
  seatsLimit,
}: {
  projectId: string;
  currentUserId: string;
  /** Distinct members across all this owner's projects + pending invites. */
  seatsUsedInitial: number;
  /** Plan seat cap (owner + invitees). */
  seatsLimit: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);

  // Server-rendered seat-count is the initial value; on every successful
  // mutation we just bump it locally (no extra round trip needed).
  const [seatsUsed, setSeatsUsed] = useState(seatsUsedInitial);
  const seatsFull = seatsUsed >= seatsLimit;

  async function refresh() {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as MembersResponse;
      setData(json);
    } catch {
      setErr("Couldn't load the team — refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite() {
    if (!inviteEmail.trim() || inviting) return;
    setErr(null);
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      if (res.status === 409) {
        const { error } = await res.json().catch(() => ({ error: "Couldn't send invitation." }));
        setErr(error);
        return;
      }
      if (!res.ok) { setErr("Couldn't send invitation. Try again."); return; }
      setInviteEmail("");
      setSeatsUsed((n) => n + 1);
      await refresh();
    } finally {
      setInviting(false);
    }
  }

  async function cancelInvite(inviteId: string) {
    await fetch(`/api/projects/${projectId}/invitations/${inviteId}`, { method: "DELETE" });
    setSeatsUsed((n) => Math.max(0, n - 1));
    refresh();
  }

  async function changeRole(userId: string, role: "editor" | "viewer") {
    await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    refresh();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the project? They'll lose access immediately.")) return;
    await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    setSeatsUsed((n) => Math.max(0, n - 1));
    refresh();
    router.refresh();
  }

  return (
    <section className="card" style={{ padding: 22 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Team</h2>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          {seatsUsed} / {seatsLimit} seat{seatsLimit === 1 ? "" : "s"}
        </span>
      </header>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14, maxWidth: 560 }}>
        Invite teammates to collaborate on this project. Editors can manage the watchlist and signals. Viewers can read but not edit.
      </p>

      {err && (
        <div className="auth-error" style={{ marginBottom: 12 }}>
          <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
          <span>{err}</span>
        </div>
      )}

      {/* Member list */}
      {loading ? (
        <p className="muted" style={{ fontSize: 13 }}>Loading team…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data?.members.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              isSelf={m.id === currentUserId}
              onChangeRole={(r) => changeRole(m.id, r)}
              onRemove={() => removeMember(m.id)}
            />
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {data && data.invitations.length > 0 && (
        <>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", margin: "20px 0 8px" }}>
            Pending invitations
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.invitations.map((inv) => (
              <PendingRow key={inv.id} inv={inv} onCancel={() => cancelInvite(inv.id)} />
            ))}
          </div>
        </>
      )}

      {/* Invite form */}
      <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
        {seatsFull ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p className="muted" style={{ fontSize: 13.5 }}>
              You&apos;re at your {seatsLimit}-seat limit. Upgrade your plan to invite more teammates.
            </p>
            <a href="/upgrade?reason=seat_cap" className="btn btn-accent btn-sm">
              Upgrade for more seats <Icon name="ArrowRight01Icon" size={14} stroke={2} />
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="modal-input"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") invite(); }}
              style={{ flex: "1 1 220px", minWidth: 0 }}
            />
            <select
              className="modal-input"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
              style={{ width: 130, paddingRight: 18 }}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              className="btn btn-accent"
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? "Sending…" : "Send invitation"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function MemberRow({
  m, isSelf, onChangeRole, onRemove,
}: {
  m: Member;
  isSelf: boolean;
  onChangeRole: (r: "editor" | "viewer") => void;
  onRemove: () => void;
}) {
  const initials = ((m.name || m.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
      <span className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{initials}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.name || m.email}{isSelf ? " · You" : ""}
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</span>
      </div>
      {m.role === "owner" ? (
        <span className="proj-role-chip" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>OWNER</span>
      ) : (
        <select
          className="modal-input"
          value={m.role}
          onChange={(e) => onChangeRole(e.target.value as "editor" | "viewer")}
          style={{ width: 110, height: 32, fontSize: 12.5, padding: "0 8px", paddingRight: 16 }}
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      )}
      {m.role !== "owner" && (
        <button className="watch-del" style={{ opacity: 1 }} onClick={onRemove} title="Remove member">
          <Icon name="Delete02Icon" size={14} stroke={1.8} />
        </button>
      )}
    </div>
  );
}

function PendingRow({ inv, onCancel }: { inv: Invitation; onCancel: () => void }) {
  const daysLeft = Math.max(0, Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px dashed var(--line-2)", borderRadius: 10, background: "var(--surface-2)" }}>
      <Icon name="Mail01Icon" size={16} stroke={1.7} color="var(--ink-3)" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.email}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {inv.role.toUpperCase()} · expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
        </span>
      </div>
      <button className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  );
}
