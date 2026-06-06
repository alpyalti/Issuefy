"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/icons/Icon";

/**
 * Reusable sign-out button. Two visual modes:
 *   - "icon"  → compact 32px icon button, used in sidebar / drawer profile chips
 *   - "ghost" → full-width ghost button with label, used on the /account page
 *
 * Clears the Clerk session and redirects to the landing page. Disables itself
 * during the round-trip so a rapid double-click can't double-sign-out.
 */
export default function SignOutButton({
  variant = "ghost",
  className,
  title = "Sign out",
}: {
  variant?: "icon" | "ghost";
  className?: string;
  title?: string;
}) {
  const clerk = useClerk();
  const [pending, setPending] = useState(false);

  async function signOut(e: React.MouseEvent) {
    // Stop propagation so clicking the icon inside a profile chip doesn't
    // also navigate to /account.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      await clerk.signOut({ redirectUrl: "/" });
    } catch {
      setPending(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={signOut}
        title={title}
        aria-label={title}
        disabled={pending}
        className={"signout-icon " + (className || "")}
      >
        <Icon name="Logout01Icon" size={17} stroke={1.7} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={"btn btn-ghost " + (className || "")}
    >
      <Icon name="Logout01Icon" size={15} stroke={1.8} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
