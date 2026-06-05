import { Resend } from "resend";

/**
 * Product-email mailer (Resend).
 *
 * Clerk handles auth emails (verification, password reset, magic link), so
 * Resend covers only product emails (PRD §10.11):
 *   - sendWelcomeEmail   on first sign-up / first lazy upsert
 *   - sendTrialReminder  14-day trial ending soon
 *   - sendUsageNotice    monthly cap or call budget hit (send-once per cycle)
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
