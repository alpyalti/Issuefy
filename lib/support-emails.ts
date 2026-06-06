/**
 * Support email templates. Three: confirmation to the user when they open a
 * ticket, an admin reply notification to the user, and an inbound notification
 * sent to support@issuefy.app so the team sees new tickets outside the panel.
 *
 * All inline-styled HTML (Gmail / Outlook strip <style>). Editorial design
 * language matching daily-brief-email.ts: logo at top, white card, calm-blue
 * accents, mono labels, Newsreader serif for headlines.
 */

export interface SupportTicketCreatedInput {
  userName: string | null;
  subject: string;
  body: string;
  ticketId: string;
}

export interface SupportAdminReplyInput {
  userName: string | null;
  subject: string;
  body: string;
  ticketId: string;
  resolved: boolean;
}

export interface SupportInboundInput {
  userName: string | null;
  userEmail: string;
  subject: string;
  body: string;
  category: string;
  ticketId: string;
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

function shell(opts: { appUrl: string; subject: string; bodyHtml: string }): string {
  const { appUrl, subject, bodyHtml } = opts;
  const logoUrl = `${appUrl.replace(/\/+$/, "")}/brand/logo-ink.svg`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${C.sans};color:${C.ink};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding-bottom:28px;">
        <img src="${esc(logoUrl)}" height="22" alt="Issuefy" style="display:block;border:0;outline:none;height:22px;">
      </td></tr>
      ${bodyHtml}
      <tr><td style="padding:36px 0 0 0;">
        <div style="border-top:1px solid ${C.line};padding-top:24px;">
          <p style="margin:0;text-align:center;font-family:${C.mono};font-size:10.5px;color:${C.ink4};letter-spacing:0.04em;">
            Issuefy · Daily AI market intelligence
          </p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function quoteBlock(label: string, body: string): string {
  return `
  <p style="margin:0 0 6px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">${esc(label)}</p>
  <div style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 16px;font-family:${C.sans};font-size:14px;line-height:1.55;color:${C.ink2};white-space:pre-wrap;">${esc(body)}</div>`;
}

function buttonRow(url: string, label: string): string {
  return `
  <p style="margin:22px 0 0 0;">
    <a href="${esc(url)}" style="display:inline-block;background:${C.accent};color:#FFFFFF;text-decoration:none;font-family:${C.sans};font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${esc(label)}</a>
  </p>`;
}

/** Confirmation sent to the user when they open a ticket. */
export function buildSupportTicketCreatedEmail(input: SupportTicketCreatedInput, appUrl: string) {
  const greeting = (input.userName?.trim().split(/\s+/)[0]) || "there";
  const ticketUrl = `${appUrl.replace(/\/+$/, "")}/support/tickets/${encodeURIComponent(input.ticketId)}`;
  const subject = `We got your message — "${input.subject}"`;
  const text = [
    `Hi ${greeting},`,
    "",
    "Thanks for reaching out. We've opened a ticket and will reply as soon as we can.",
    "",
    `Subject: ${input.subject}`,
    `Your message:`,
    input.body,
    "",
    `Track it here: ${ticketUrl}`,
    "",
    "— Issuefy support",
  ].join("\n");
  const bodyHtml = `
    <tr><td style="background:${C.surface};border:1px solid ${C.line2};border-radius:18px;padding:30px 28px;">
      <p style="margin:0 0 14px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">Ticket opened</p>
      <p style="margin:0 0 12px 0;font-family:${C.serif};font-size:24px;font-weight:500;letter-spacing:-0.01em;color:${C.ink};line-height:1.25;">
        Thanks, ${esc(greeting)} — we got it.
      </p>
      <p style="margin:0 0 22px 0;font-family:${C.sans};font-size:14.5px;line-height:1.6;color:${C.ink2};">
        We've opened a support ticket for "<em style="font-style:italic;">${esc(input.subject)}</em>". Someone from the team will reply here as soon as we can.
      </p>
      ${quoteBlock("Your message", input.body)}
      ${buttonRow(ticketUrl, "Track your ticket →")}
    </td></tr>`;
  return { subject, html: shell({ appUrl, subject, bodyHtml }), text };
}

/** Notification sent to the user when an admin replies. */
export function buildSupportAdminReplyEmail(input: SupportAdminReplyInput, appUrl: string) {
  const greeting = (input.userName?.trim().split(/\s+/)[0]) || "there";
  const ticketUrl = `${appUrl.replace(/\/+$/, "")}/support/tickets/${encodeURIComponent(input.ticketId)}`;
  const subject = input.resolved
    ? `Re: ${input.subject} — resolved`
    : `Re: ${input.subject}`;
  const text = [
    `Hi ${greeting},`,
    "",
    input.resolved
      ? "We've replied and marked this ticket resolved. If anything's still unclear, reply and it'll reopen."
      : "We've replied to your support ticket.",
    "",
    "Our reply:",
    input.body,
    "",
    `View the full thread: ${ticketUrl}`,
    "",
    "— Issuefy support",
  ].join("\n");
  const bodyHtml = `
    <tr><td style="background:${C.surface};border:1px solid ${C.line2};border-radius:18px;padding:30px 28px;">
      <p style="margin:0 0 14px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
        ${input.resolved ? "Resolved · we replied" : "We replied"}
      </p>
      <p style="margin:0 0 12px 0;font-family:${C.serif};font-size:24px;font-weight:500;letter-spacing:-0.01em;color:${C.ink};line-height:1.25;">
        ${esc(input.subject)}
      </p>
      <p style="margin:0 0 22px 0;font-family:${C.sans};font-size:14.5px;line-height:1.6;color:${C.ink2};">
        ${input.resolved
          ? "We've replied and marked this ticket resolved. If anything's still unclear, just reply to this thread and it'll reopen."
          : "We've replied to your support ticket. The full thread is in the dashboard."}
      </p>
      ${quoteBlock("Our reply", input.body)}
      ${buttonRow(ticketUrl, "Open ticket →")}
    </td></tr>`;
  return { subject, html: shell({ appUrl, subject, bodyHtml }), text };
}

/** Inbound notification sent to support@issuefy.app whenever a user opens a
 *  ticket. Same payload the admin panel shows; useful for ops staff who live
 *  in email. */
export function buildSupportInboundEmail(input: SupportInboundInput, appUrl: string) {
  const adminUrl = `${appUrl.replace(/\/+$/, "")}/admin/support/${encodeURIComponent(input.ticketId)}`;
  const reqLabel = input.userName?.trim() || input.userEmail;
  const subject = `[Issuefy support] ${input.subject}`;
  const text = [
    `New support ticket from ${reqLabel} <${input.userEmail}>`,
    `Category: ${input.category}`,
    "",
    `Subject: ${input.subject}`,
    "",
    "Message:",
    input.body,
    "",
    `Open in admin: ${adminUrl}`,
  ].join("\n");
  const bodyHtml = `
    <tr><td style="background:${C.surface};border:1px solid ${C.line2};border-radius:18px;padding:30px 28px;">
      <p style="margin:0 0 14px 0;font-family:${C.mono};font-size:10.5px;color:${C.ink3};letter-spacing:0.14em;text-transform:uppercase;">
        New support ticket · ${esc(input.category)}
      </p>
      <p style="margin:0 0 12px 0;font-family:${C.serif};font-size:22px;font-weight:500;letter-spacing:-0.01em;color:${C.ink};line-height:1.25;">
        ${esc(input.subject)}
      </p>
      <p style="margin:0 0 18px 0;font-family:${C.mono};font-size:12px;color:${C.ink3};">
        From ${esc(reqLabel)} · ${esc(input.userEmail)}
      </p>
      ${quoteBlock("Message", input.body)}
      ${buttonRow(adminUrl, "Open in admin →")}
    </td></tr>`;
  return { subject, html: shell({ appUrl, subject, bodyHtml }), text };
}
