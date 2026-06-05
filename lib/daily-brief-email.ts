/**
 * Daily brief email HTML template.
 *
 * Hand-rolled inline-styled HTML — required for email clients (Gmail/Outlook
 * strip <style>). Mirrors the editorial design language of the in-app brief
 * card: dark ink background, Newsreader serif body, calm-blue accents, mono
 * eyebrow, IBM Plex stand-in via Georgia where Newsreader isn't available.
 *
 * Top 3 cited sources render as clickable chips at the bottom — the same
 * "verify at the source" affordance the dashboard exposes.
 *
 * CAN-SPAM compliance: the footer includes the unsubscribe link, business
 * tagline, and a clear "you got this because…" sentence.
 */

export interface DailyBriefEmailInput {
  projectName: string;
  summaryDate: string;        // YYYY-MM-DD, rendered as "Tuesday, June 4"
  summaryText: string;        // the 80–140 word paragraph
  sources: Array<{
    title: string;
    url: string;
    domain: string;
  }>;
  dashboardUrl: string;       // absolute URL → the project's dashboard
  unsubscribeUrl: string;     // absolute URL with ?token=…
}

/** Format a YYYY-MM-DD into "Tuesday, June 4" using UTC to match summary_date. */
function formatDateForEmail(d: string): string {
  // d is YYYY-MM-DD; construct as midnight UTC so toLocaleDateString doesn't shift days
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

/** Escape HTML special characters for safe inline interpolation. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildDailyBriefEmail(input: DailyBriefEmailInput): { subject: string; html: string; text: string } {
  const { projectName, summaryDate, summaryText, sources, dashboardUrl, unsubscribeUrl } = input;
  const dateLabel = formatDateForEmail(summaryDate);
  const topSources = sources.slice(0, 3);

  // Subject line — short, mentions the project so multi-project users can scan.
  const subject = `Today's market signals — ${projectName}`;

  // Plain-text fallback for clients that don't render HTML.
  const text = [
    `Today's market signals — ${projectName}`,
    `${dateLabel}`,
    "",
    summaryText,
    "",
    topSources.length > 0 ? "Sources:" : "",
    ...topSources.map((s) => `  · ${s.title} (${s.domain}) — ${s.url}`),
    "",
    `Open the full dashboard: ${dashboardUrl}`,
    "",
    "—",
    "You're receiving this because you signed up for Issuefy daily briefs.",
    `Unsubscribe with one click: ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#15171A;-webkit-font-smoothing:antialiased;">
<!-- Outlook conditional comments would go here in production -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;">
  <tr><td align="center" style="padding:32px 16px;">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:transparent;">

      <!-- Brand mark + eyebrow -->
      <tr><td style="padding-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#15171A;letter-spacing:-0.02em;font-weight:500;">
              Issuefy
            </td>
            <td align="right" style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;color:#898E96;letter-spacing:0.12em;text-transform:uppercase;">
              ${esc(dateLabel)}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Brief card (dark ink, editorial body) -->
      <tr><td style="background:#15171A;border-radius:18px;padding:30px 30px 26px 30px;">
        <p style="margin:0 0 14px 0;font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;color:#9aa3b2;letter-spacing:0.12em;text-transform:uppercase;">
          ✦ AI summary · ${esc(projectName)}
        </p>
        <p style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#FFFFFF;letter-spacing:-0.01em;font-weight:500;">
          Today's brief
        </p>
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#cfd3db;letter-spacing:-0.005em;">
          ${esc(summaryText)}
        </p>
      </td></tr>

      ${topSources.length > 0 ? `
      <!-- Cited sources -->
      <tr><td style="padding:24px 0 0 0;">
        <p style="margin:0 0 12px 0;font-family:'IBM Plex Mono',Menlo,monospace;font-size:10.5px;color:#898E96;letter-spacing:0.08em;text-transform:uppercase;">
          Verify at the source
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${topSources.map((s) => `
          <tr><td style="padding:6px 0;">
            <a href="${esc(s.url)}" style="display:block;text-decoration:none;color:#15171A;background:#FFFFFF;border:1px solid #DEDDD7;border-radius:999px;padding:10px 16px;font-family:'Hanken Grotesk',-apple-system,sans-serif;font-size:13px;font-weight:500;">
              <span style="color:#15171A;font-weight:600;">${esc(s.title.length > 70 ? s.title.slice(0, 67) + "…" : s.title)}</span>
              <span style="color:#898E96;font-family:'IBM Plex Mono',Menlo,monospace;font-size:10.5px;display:block;margin-top:2px;">${esc(s.domain)} →</span>
            </a>
          </td></tr>
          `).join("")}
        </table>
      </td></tr>
      ` : ""}

      <!-- CTA button -->
      <tr><td style="padding:28px 0 0 0;text-align:center;">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;background:#2D5BE3;color:#FFFFFF;text-decoration:none;font-family:'Hanken Grotesk',-apple-system,sans-serif;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;letter-spacing:0;">
          Open the full dashboard →
        </a>
      </td></tr>

      <!-- Footer / unsubscribe (CAN-SPAM) -->
      <tr><td style="padding:36px 0 0 0;border-top:1px solid #E8E7E2;margin-top:32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:28px;">
          <tr><td align="center" style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;color:#898E96;line-height:1.6;">
            You're receiving this because you signed up for Issuefy daily briefs.<br>
            <a href="${esc(unsubscribeUrl)}" style="color:#1E47C0;text-decoration:underline;">Unsubscribe with one click</a> ·
            <a href="${esc(dashboardUrl.replace(/\/dashboard\/.+$/, "/dashboard"))}" style="color:#1E47C0;text-decoration:underline;">Manage projects</a>
          </td></tr>
          <tr><td align="center" style="padding-top:14px;font-family:'IBM Plex Mono',Menlo,monospace;font-size:10.5px;color:#B4B8BD;letter-spacing:0.02em;">
            Issuefy · Daily AI market intelligence
          </td></tr>
        </table>
      </td></tr>

    </table>

  </td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
