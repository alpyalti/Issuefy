import { Resend } from "resend";
import type { Notification } from "./webhook";

export async function sendBillingNotification(notification: Notification) {
  if (!process.env.RESEND_API_KEY) throw new Error("Billing email is not configured");
  const client = new Resend(process.env.RESEND_API_KEY);
  const messages = {
    plan_changed: [`You're now on the Issuefy ${notification.plan} plan`, `Your Issuefy plan has changed to ${notification.plan}.`],
    canceled: ["Your Issuefy subscription has been canceled", "Your subscription is canceled. Your account stays open and you can come back any time."],
    payment_failed: ["Issuefy: we couldn't process your payment", "Your subscription is past due. Please update your payment method in your Issuefy account."],
  };
  const [subject, text] = messages[notification.kind];
  const result = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Issuefy <hello@issuefy.app>",
    to: notification.recipient, subject, text,
  }, { idempotencyKey: `billing/${notification.event_id}/${notification.kind}` });
  if (result.error) throw new Error(`Billing email failed: ${result.error.name}`);
}
