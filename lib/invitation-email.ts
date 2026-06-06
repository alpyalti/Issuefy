/**
 * Team invitation email template.
 *
 * Modeled on lib/daily-brief-email.ts — same color tokens, same esc() helper,
 * same CAN-SPAM-style footer. Hand-rolled inline-styled HTML (Gmail / Outlook
 * strip <style>). Subject + plain-text fallback included.
 */

export interface InvitationEmailInput {
  /** Display name of the person inviting (falls back to email). */
  inviterName: string;
  inviterEmail: string;
  projectName: string;
  /** "editor" or "viewer". Used for the role-specific blurb. */
  role: "editor" | "viewer";
  /** Absolute URL like https://issuefy.app/invite/{token}. */
  acceptUrl: string;
  /** Absolute origin used to source the brand logo. No trailing slash. */
  appUrl: string;
  /** Days until expiry. Default 7. */
  expiresInDays?: number;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const C = {
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  ink: "#15171A",
  ink2: "#565B62",
  ink3: "#898E96",
  ink4: "#B4B8BD",
  line: "#E8E7E2",
  line2: "#DEDDD7",
  accent: "#2D5BE3",
  accentInk: "#1E47C0",
  serif: "Newsreader, Georgia, 'Times New Roman', serif",
  sans: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', Menlo, monospace",
};

const ROLE_BLURB: Record<"editor" | "viewer", string> = {
  editor: "You'll be added as an Editor — you can add competitors and keywords, edit project details, save signals, and add notes. You can't change billing or invite others.",
  viewer: "You'll be added as a Viewer — you can read the daily brief, see every signal, and explore sources. You can't make changes.",
};

export function buildInvitationEmail(input: InvitationEmailInput): {
  subject: string; html: string; text: string;
} {
  const { inviterName, inviterEmail, projectName, role, acceptUrl, appUrl, expiresInDays = 7 } = input;
  const inviterLabel = inviterName?.trim() || inviterEmail;
  const subject = `${inviterLabel} invited you to ${projectName} on Issuefy`;
  const logoUrl = `${appUrl.replace(/\/+$/, "")}/brand/logo-ink.svg`;

  const text = [
    subject,
    "",
    `${inviterLabel} (${inviterEmail}) has invited you to join "${projectName}" on Issuefy as a ${role}.`,
    "",
    ROLE_BLURB[role],
    "",
    `Accept the invitation: ${acceptUrl}`,
    "",
    `This invitation expires in ${expiresInDays} days.`,
    "",
    "—",
    "Issuefy · Daily AI market intelligence",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${C.sans};color:${C.ink};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:transparent;">

      <!-- Logo -->
      <tr><td align="center" style="padding-bottom:36px;">
        <img src="${esc(logoUrl)}" height="22" alt="Issuefy" style="display:block;border:0;outline:none;height:22px;">
      </td></tr>

      <!-- Hero card -->
      <tr><td style="background:${C.surface};border:1px solid ${C.line2};border-radius:18px;padding:34px 32px;">
        <p style="margin:0 0 14px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
          Team invitation
        </p>
        <p style="margin:0 0 14px 0;font-family:${C.serif};font-size:26px;font-weight:500;letter-spacing:-0.015em;color:${C.ink};line-height:1.2;">
          ${esc(inviterLabel)} invited you to <em style="font-style:italic;">${esc(projectName)}</em>.
        </p>
        <p style="margin:0 0 24px 0;font-family:${C.sans};font-size:15px;line-height:1.6;color:${C.ink2};">
          ${esc(ROLE_BLURB[role])}
        </p>
        <a href="${esc(acceptUrl)}" style="display:inline-block;background:${C.accent};color:#FFFFFF;text-decoration:none;font-family:${C.sans};font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">
          Accept invitation →
        </a>
        <p style="margin:18px 0 0 0;font-family:${C.mono};font-size:11px;color:${C.ink3};letter-spacing:0.04em;">
          This invitation expires in ${expiresInDays} days.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:36px 0 0 0;">
        <div style="border-top:1px solid ${C.line};padding-top:24px;">
          <p style="margin:0;text-align:center;font-family:${C.mono};font-size:10.5px;color:${C.ink3};line-height:1.7;letter-spacing:0.02em;">
            You're receiving this because ${esc(inviterLabel)} (${esc(inviterEmail)}) invited you to a project on Issuefy.
          </p>
          <p style="margin:14px 0 0 0;text-align:center;font-family:${C.mono};font-size:10.5px;color:${C.ink4};letter-spacing:0.04em;">
            Issuefy · Daily AI market intelligence
          </p>
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
