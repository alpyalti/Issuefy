"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

/**
 * "Accept invitation" button on /invite/[token] for logged-in users whose
 * email matches the invitation. Calls POST /api/invitations/:token/accept;
 * on success redirects to /dashboard/:projectId where the new member can
 * start collaborating. Failure surfaces inline.
 */
export default function InvitationAcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    if (pending) return;
    setErr(null);
    setPending(true);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        const { projectId } = (await res.json()) as { projectId: string };
        router.push(`/dashboard/${projectId}`);
        return;
      }
      if (res.status === 409) {
        const { error } = await res.json().catch(() => ({ error: "Couldn't accept the invitation." }));
        setErr(error);
        return;
      }
      setErr("Couldn't accept the invitation. Try again in a moment.");
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {err && (
        <div className="auth-error">
          <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
          <span>{err}</span>
        </div>
      )}
      <button className="btn btn-accent" onClick={accept} disabled={pending} style={{ minHeight: 44 }}>
        {pending ? "Joining…" : "Accept invitation →"}
      </button>
    </>
  );
}
