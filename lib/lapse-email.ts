/**
 * Subscription-lapsed email template.
 *
 * Modeled on lib/invitation-email.ts — same color tokens, same esc() helper,
 * same CAN-SPAM-style footer. Sent by app/api/cron/cleanup/route.ts when the
 * lapse sweep finds a canceled+expired sub, downgrades the user to Starter,
 * and auto-pauses extra projects beyond the Starter 1-project cap.
 *
 * Tone: warm, factual, blame-free. The user already canceled (or let payment
 * fail through to canceled) — this is the "your stuff is safe, here's how
 * to resume" beat, not a guilt trip.
 */

export interface LapseEmailInput {
  /** Display name. Falls back to empty string. */
  userName: string | null;
  /** Plan they were on before downgrade — used in copy ("your Growth plan"). */
  previousPlan: "growth" | "agency" | "enterprise" | string;
  /** Count of projects we just auto-paused. May be 0 (Starter→Starter rare path). */
  pausedProjectCount: number;
  /** Absolute origin used to source the brand logo. No trailing slash. */
  appUrl: string;
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
  serif: "Newsreader, Georgia, 'Times New Roman', serif",
  sans: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', Menlo, monospace",
};

function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function buildLapseEmail(input: LapseEmailInput): {
  subject: string; html: string; text: string;
} {
  const { userName, previousPlan, pausedProjectCount, appUrl } = input;
  const first = (userName || "").trim().split(/\s+/)[0] || "";
  const subject = "Your Issuefy subscription has ended";
  const logoUrl = `${appUrl.replace(/\/+$/, "")}/brand/logo-ink.svg`;
  const resumeUrl = `${appUrl.replace(/\/+$/, "")}/upgrade?required=1&reason=lapse`;
  const prev = planLabel(previousPlan);
  const pausedLine = pausedProjectCount > 0
    ? `We kept your oldest project active and paused ${pausedProjectCount} other${pausedProjectCount === 1 ? "" : "s"}. Your data and signals are all preserved — nothing was deleted.`
    : `Your project stays active on the Starter plan.`;

  const text = [
    subject,
    "",
    first ? `Hi ${first},` : "Hi,",
    "",
    `Your ${prev} subscription has ended, so we've moved your account back to the Starter plan.`,
    "",
    pausedLine,
    "",
    `Resume your projects: ${resumeUrl}`,
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
          Subscription ended
        </p>
        <p style="margin:0 0 14px 0;font-family:${C.serif};font-size:26px;font-weight:500;letter-spacing:-0.015em;color:${C.ink};line-height:1.2;">
          Your ${esc(prev)} plan has ended.
        </p>
        <p style="margin:0 0 14px 0;font-family:${C.sans};font-size:15px;line-height:1.6;color:${C.ink2};">
          ${first ? `Hi ${esc(first)} — your` : "Your"} ${esc(prev)} subscription wrapped up, so we've moved your account back to the Starter plan.
        </p>
        <p style="margin:0 0 26px 0;font-family:${C.sans};font-size:15px;line-height:1.6;color:${C.ink2};">
          ${esc(pausedLine)}
        </p>
        <a href="${esc(resumeUrl)}" style="display:inline-block;background:${C.accent};color:#FFFFFF;text-decoration:none;font-family:${C.sans};font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">
          Resume my projects →
        </a>
        <p style="margin:18px 0 0 0;font-family:${C.mono};font-size:11px;color:${C.ink3};letter-spacing:0.04em;">
          Pick any plan to reactivate. Your paused projects come back instantly.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:36px 0 0 0;">
        <div style="border-top:1px solid ${C.line};padding-top:24px;">
          <p style="margin:0;text-align:center;font-family:${C.mono};font-size:10.5px;color:${C.ink3};line-height:1.7;letter-spacing:0.02em;">
            You're receiving this because your Issuefy subscription has ended.
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
