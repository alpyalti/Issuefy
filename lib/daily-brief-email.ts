/**
 * Daily brief email HTML template.
 *
 * Hand-rolled inline-styled HTML — required for email clients (Gmail/Outlook
 * strip <style>). Editorial design language: white background, calm spacing,
 * a single dark-ink summary card as the hero, then a long scannable list of
 * today's new signals, then the cited sources strip and CTA.
 *
 * The logo at the top is fetched as a static SVG from the app's /brand/
 * folder; Gmail/Apple Mail render it inline, Outlook desktop falls back to
 * the alt text ("Issuefy"). The text remains on-brand either way.
 *
 * CAN-SPAM compliance: the footer includes the unsubscribe link, business
 * tagline, and a clear "you got this because…" sentence.
 */

export interface DailyBriefSignal {
  title: string;
  category: string;          // raw DB category, e.g. "Competitor Move"
  description: string;       // 1–3 sentence body
  importance: "High" | "Medium" | "Low";
  source?: { url: string; domain: string } | null;
}

export interface DailyBriefEmailInput {
  projectName: string;
  summaryDate: string;        // YYYY-MM-DD, rendered as "Tuesday, June 4"
  summaryText: string;        // the 80–140 word paragraph
  sources: Array<{
    title: string;
    url: string;
    domain: string;
  }>;
  signals?: DailyBriefSignal[]; // capped to ~12 server-side
  appUrl: string;             // origin used to source the logo, no trailing slash
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

/** Color tokens kept inline — Gmail strips <style>. */
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
  // High/Medium/Low importance dots — same palette as the in-app severity bars.
  sevHigh: "#C0392B",
  sevMed:  "#B7791F",
  sevLow:  "#898E96",
};

function importanceDot(level: DailyBriefSignal["importance"]): string {
  const color = level === "High" ? C.sevHigh : level === "Medium" ? C.sevMed : C.sevLow;
  return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};vertical-align:middle;margin-right:6px;"></span>`;
}

function renderSignalRow(s: DailyBriefSignal, isLast: boolean): string {
  const sourceLink = s.source
    ? `<a href="${esc(s.source.url)}" style="display:inline-block;margin-top:8px;color:${C.accentInk};text-decoration:none;font-family:${C.mono};font-size:11.5px;letter-spacing:0.02em;">${esc(s.source.domain)} <span style="color:${C.ink3};">→</span></a>`
    : "";
  return `
  <tr><td style="padding:18px 0;${isLast ? "" : `border-bottom:1px solid ${C.line};`}">
    <p style="margin:0 0 6px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.1em;text-transform:uppercase;">
      ${importanceDot(s.importance)}${esc(s.category)} <span style="color:${C.ink4};">·</span> ${esc(s.importance)}
    </p>
    <p style="margin:0 0 6px 0;font-family:${C.serif};font-size:17px;line-height:1.3;color:${C.ink};letter-spacing:-0.005em;">
      ${esc(s.title)}
    </p>
    <p style="margin:0;font-family:${C.sans};font-size:14px;line-height:1.55;color:${C.ink2};">
      ${esc(s.description)}
    </p>
    ${sourceLink}
  </td></tr>`;
}

export function buildDailyBriefEmail(input: DailyBriefEmailInput): { subject: string; html: string; text: string } {
  const { projectName, summaryDate, summaryText, sources, signals = [], appUrl, dashboardUrl, unsubscribeUrl } = input;
  const dateLabel = formatDateForEmail(summaryDate);
  const topSources = sources.slice(0, 3);
  // Hard cap defensively in case the caller passed too many.
  const signalsToShow = signals.slice(0, 12);

  // Subject line — short, mentions the project so multi-project users can scan.
  const subject = `Today's market signals — ${projectName}`;

  // Plain-text fallback for clients that don't render HTML.
  const text = [
    `Today's market signals — ${projectName}`,
    `${dateLabel}`,
    "",
    summaryText,
    "",
    signalsToShow.length > 0 ? `Today's signals (${signalsToShow.length}):` : "",
    ...signalsToShow.map((s, i) =>
      `${i + 1}. [${s.importance}] ${s.category} — ${s.title}\n   ${s.description}${s.source ? `\n   ${s.source.domain} — ${s.source.url}` : ""}`,
    ),
    "",
    topSources.length > 0 ? "Sources cited in the brief:" : "",
    ...topSources.map((s) => `  · ${s.title} (${s.domain}) — ${s.url}`),
    "",
    `Open the full dashboard: ${dashboardUrl}`,
    "",
    "—",
    "You're receiving this because you signed up for Issuefy daily briefs.",
    `Unsubscribe with one click: ${unsubscribeUrl}`,
  ].filter((l) => l !== undefined).join("\n");

  const logoUrl = `${appUrl.replace(/\/+$/, "")}/brand/logo-ink.svg`;

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

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:transparent;">

      <!-- Brand logo (centered) -->
      <tr><td align="center" style="padding-bottom:8px;">
        <img src="${esc(logoUrl)}" height="22" alt="Issuefy" style="display:block;border:0;outline:none;height:22px;">
      </td></tr>

      <!-- Date eyebrow -->
      <tr><td align="center" style="padding-bottom:36px;">
        <p style="margin:0;font-family:${C.mono};font-size:11px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
          ${esc(dateLabel)}
        </p>
      </td></tr>

      <!-- Hero brief card (dark ink) -->
      <tr><td style="background:${C.ink};border-radius:18px;padding:32px 32px 28px 32px;">
        <p style="margin:0 0 12px 0;font-family:${C.mono};font-size:10.5px;color:#9aa3b2;letter-spacing:0.14em;text-transform:uppercase;">
          AI summary · ${esc(projectName)}
        </p>
        <p style="margin:0 0 10px 0;font-family:${C.serif};font-size:22px;color:#FFFFFF;letter-spacing:-0.01em;font-weight:500;">
          Today's brief
        </p>
        <p style="margin:0;font-family:${C.serif};font-size:17px;line-height:1.6;color:#cfd3db;letter-spacing:-0.005em;">
          ${esc(summaryText)}
        </p>
      </td></tr>

      <!-- CTA button -->
      <tr><td align="center" style="padding:28px 0 0 0;">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.accent};color:#FFFFFF;text-decoration:none;font-family:${C.sans};font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">
          Open the full dashboard →
        </a>
      </td></tr>

      ${signalsToShow.length > 0 ? `
      <!-- Today's signals (long list, scannable) -->
      <tr><td style="padding:56px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" style="font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
              Today's signals
            </td>
            <td align="right" style="font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.04em;">
              ${signalsToShow.length} new
            </td>
          </tr>
        </table>
        <p style="margin:8px 0 0 0;font-family:${C.serif};font-size:22px;font-weight:500;letter-spacing:-0.01em;color:${C.ink};">
          What we found
        </p>
      </td></tr>
      <tr><td style="padding-top:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${signalsToShow.map((s, i) => renderSignalRow(s, i === signalsToShow.length - 1)).join("")}
        </table>
      </td></tr>
      ` : ""}

      ${topSources.length > 0 ? `
      <!-- Cited sources strip -->
      <tr><td style="padding:48px 0 0 0;">
        <p style="margin:0 0 14px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
          Sources behind the brief
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${topSources.map((s) => `
          <tr><td style="padding:6px 0;">
            <a href="${esc(s.url)}" style="display:block;text-decoration:none;color:${C.ink};background:${C.surface};border:1px solid ${C.line2};border-radius:12px;padding:12px 16px;font-family:${C.sans};font-size:13.5px;font-weight:500;">
              <span style="color:${C.ink};font-weight:600;">${esc(s.title.length > 80 ? s.title.slice(0, 77) + "…" : s.title)}</span>
              <span style="color:${C.ink3};font-family:${C.mono};font-size:10.5px;display:block;margin-top:3px;letter-spacing:0.04em;">${esc(s.domain)} →</span>
            </a>
          </td></tr>
          `).join("")}
        </table>
      </td></tr>
      ` : ""}

      <!-- Footer / unsubscribe (CAN-SPAM) -->
      <tr><td style="padding:48px 0 0 0;">
        <div style="border-top:1px solid ${C.line};padding-top:24px;">
          <p style="margin:0;text-align:center;font-family:${C.mono};font-size:10.5px;color:${C.ink3};line-height:1.7;letter-spacing:0.02em;">
            You're receiving this because you signed up for Issuefy daily briefs.<br>
            <a href="${esc(unsubscribeUrl)}" style="color:${C.accentInk};text-decoration:underline;">Unsubscribe with one click</a>
            <span style="color:${C.line2};">·</span>
            <a href="${esc(dashboardUrl.replace(/\/dashboard\/.+$/, "/dashboard"))}" style="color:${C.accentInk};text-decoration:underline;">Manage projects</a>
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
