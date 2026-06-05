"use client";

import { UserProfile } from "@clerk/nextjs";
import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

/** Mounts Clerk's <UserProfile /> inside a collapsible card so the user can
 *  change email, password, set up 2FA, etc. Themed with our accent. */
export default function SecurityCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card" style={{ padding: 22 }}>
      <header
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Security</h2>
          <p className="muted" style={{ fontSize: 13.5 }}>Change email, password, set up 2FA, manage connected accounts.</p>
        </div>
        <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={18} stroke={1.7} />
      </header>
      {open && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
          <UserProfile
            appearance={{
              variables: {
                colorPrimary: "#2D5BE3",
                colorText: "#15171A",
                colorTextSecondary: "#565B62",
                borderRadius: "10px",
                fontFamily: "var(--sans)",
              },
              elements: {
                rootBox: { width: "100%" },
                cardBox: { boxShadow: "none", border: "none", width: "100%" },
                navbar: { display: "none" },
              },
            }}
          />
        </div>
      )}
    </section>
  );
}
