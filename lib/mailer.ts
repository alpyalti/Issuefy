import { Resend } from "resend";
import { buildDailyBriefEmail, type DailyBriefEmailInput } from "./daily-brief-email";
import { buildInvitationEmail, type InvitationEmailInput } from "./invitation-email";
import {
  buildSupportAdminReplyEmail,
  buildSupportInboundEmail,
  buildSupportTicketCreatedEmail,
  type SupportAdminReplyInput,
  type SupportInboundInput,
  type SupportTicketCreatedInput,
} from "./support-emails";

/**
 * Product-email mailer (Resend).
 *
 * Clerk handles auth emails (verification, password reset, magic link), so
 * Resend covers only product emails:
 *   - sendWelcomeEmail       on first sign-up / first lazy upsert (PRD §10.11)
 *   - sendTrialReminder      14-day trial ending soon (PRD §10.11)
 *   - sendUsageNotice        monthly cap or call budget hit (PRD §21.4, send-once per cycle)
 *   - sendDailyBriefEmail    the daily AI market brief (P0 sprint — beyond PRD MVP)
 *
 * When RESEND_API_KEY is unset, every send no-ops with a console log so local
 * dev doesn't crash.
 */
type SendArgs = { to: string; subject: string; html: string; text?: string };

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL || "Issuefy <hello@issuefy.app>";

const client = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function send({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!client) {
    // eslint-disable-next-line no-console
    console.info("[mailer] (no RESEND_API_KEY) would send:", { to, subject });
    return { ok: true };
  }
  try {
    const res = await client.emails.send({ from: FROM, to, subject, html, text });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, id: res.data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendWelcomeEmail(to: string, name?: string | null) {
  const first = (name || "").split(" ")[0];
  const subject = "Welcome to Issuefy";
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:26px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Welcome${first ? `, ${first}` : ""}.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        Issuefy reads the open web for you — competitors, customer signals and risks — and hands you one short, sourced brief every morning.
      </p>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 24px">
        Open the dashboard to set up your watchlist. Your first brief lands tomorrow.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/dashboard" style="display:inline-block;background:#2D5BE3;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Open dashboard</a>
    </div>`;
  return send({ to, subject, html });
}

export async function sendTrialReminderEmail(to: string, daysLeft: number) {
  const subject = `Your Issuefy trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:24px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Your trial wraps up soon.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left of your Issuefy trial. Pick a plan to keep your daily brief running.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/dashboard" style="display:inline-block;background:#15171A;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Choose a plan</a>
    </div>`;
  return send({ to, subject, html });
}

/**
 * Daily AI market brief.
 *
 * Called by the worker after Stage 4 (summary generation) when the user is
 * opted-in AND daily_summaries.email_sent_at is null. The send-once guard
 * lives in the worker; this function just renders + sends.
 */
export async function sendDailyBriefEmail(to: string, input: DailyBriefEmailInput) {
  const { subject, html, text } = buildDailyBriefEmail(input);
  return send({ to, subject, html, text });
}

/**
 * Team invitation (Teams Phase 3). Sent when an owner invites someone to a
 * project via POST /api/projects/:id/invitations. The recipient gets a link
 * to /invite/{token} that drives the acceptance flow in Phase 4.
 */
export async function sendInvitationEmail(to: string, input: InvitationEmailInput) {
  const { subject, html, text } = buildInvitationEmail(input);
  return send({ to, subject, html, text });
}

// ── Support ticket emails ──────────────────────────────────────────────
const APP_URL = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
const SUPPORT_INBOX = process.env.SUPPORT_INBOX_EMAIL || "support@issuefy.app";

/** Confirmation sent to the user when they open a ticket. */
export async function sendSupportTicketCreatedEmail(to: string, input: SupportTicketCreatedInput) {
  const { subject, html, text } = buildSupportTicketCreatedEmail(input, APP_URL);
  return send({ to, subject, html, text });
}

/** Notification sent to the user when an admin replies on their ticket. */
export async function sendSupportAdminReplyEmail(to: string, input: SupportAdminReplyInput) {
  const { subject, html, text } = buildSupportAdminReplyEmail(input, APP_URL);
  return send({ to, subject, html, text });
}

/** Heads-up sent to support@issuefy.app for ops staff who live in email. */
export async function sendSupportInboundNotification(input: SupportInboundInput) {
  const { subject, html, text } = buildSupportInboundEmail(input, APP_URL);
  return send({ to: SUPPORT_INBOX, subject, html, text });
}

/** Stripe — payment failed (sent on invoice.payment_failed webhook). */
export async function sendPaymentFailedEmail(to: string) {
  const subject = "Issuefy: we couldn't process your payment";
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:24px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Payment didn't go through.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        We tried to charge your card for your Issuefy subscription, but the charge failed.
        Update your payment method below to keep your daily briefs coming.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/account" style="display:inline-block;background:#2D5BE3;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Update payment method</a>
    </div>`;
  return send({ to, subject, html });
}

/** Stripe — subscription canceled. */
export async function sendSubscriptionCanceledEmail(to: string) {
  const subject = "Your Issuefy subscription has been canceled";
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:24px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Sorry to see you go.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        Your subscription is canceled and you won't be charged again. Your account stays open and you can come back any time.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/upgrade" style="display:inline-block;background:#15171A;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Restart Issuefy</a>
    </div>`;
  return send({ to, subject, html });
}

/** Stripe — plan changed (upgrade / downgrade) — sent from subscription.updated. */
export async function sendPlanChangedEmail(to: string, plan: string) {
  const subject = `You're now on the Issuefy ${plan} plan`;
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:24px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Welcome to ${planLabel}.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        Your Issuefy plan is now active. Your new limits and features take effect immediately.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/dashboard" style="display:inline-block;background:#2D5BE3;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Open dashboard</a>
    </div>`;
  return send({ to, subject, html });
}

export async function sendUsageNoticeEmail(to: string, kind: "sources" | "budget") {
  const subject = "Issuefy: you've reached this month's limit";
  const detail = kind === "sources"
    ? "your monthly source cap"
    : "your monthly API-call budget";
  const html = `
    <div style="font-family:Newsreader,Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#15171A">
      <h1 style="font-size:24px;font-weight:500;letter-spacing:-0.02em;margin:0 0 16px">Limit reached.</h1>
      <p style="font-family:Hanken Grotesk,sans-serif;font-size:16px;line-height:1.55;color:#565B62;margin:0 0 16px">
        You've hit ${detail} for this billing cycle. Issuefy will keep competitor scraping running, but new keyword discovery is paused until the next cycle. Upgrade to keep going right away.
      </p>
      <a href="${process.env.APP_URL || "https://issuefy.app"}/dashboard/settings" style="display:inline-block;background:#2D5BE3;color:#fff;text-decoration:none;font-family:Hanken Grotesk,sans-serif;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">Upgrade plan</a>
    </div>`;
  return send({ to, subject, html });
}
