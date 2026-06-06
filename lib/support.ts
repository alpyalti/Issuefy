/**
 * Support ticket helpers. Used by both user-side and admin-side routes /
 * pages so the access checks + label logic live in one place.
 */
import { requireSql } from "./db";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "bug" | "feature" | "billing" | "account" | "general";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Awaiting reply",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: "Bug",
  feature: "Feature request",
  billing: "Billing",
  account: "Account",
  general: "General",
};

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  last_message_at: string;
  last_message_by: "user" | "admin";
  created_at: string;
  updated_at: string;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_type: "user" | "admin";
  body: string;
  created_at: string;
}

/**
 * Ownership check: does the ticket belong to this user? Returns the row when
 * authorized, null when not. Admins should NOT call this — they have their
 * own admin-scoped reads that bypass user_id.
 */
export async function ownedTicket(userId: string, ticketId: string): Promise<SupportTicketRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, user_id, subject, category, priority, status,
           last_message_at, last_message_by, created_at, updated_at
      FROM support_tickets
     WHERE id = ${ticketId} AND user_id = ${userId}
     LIMIT 1
  `) as SupportTicketRow[];
  return rows[0] ?? null;
}

/**
 * Admin variant — any ticket by id, no ownership filter. Caller MUST have
 * already passed requireAdmin().
 */
export async function adminTicket(ticketId: string): Promise<SupportTicketRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, user_id, subject, category, priority, status,
           last_message_at, last_message_by, created_at, updated_at
      FROM support_tickets
     WHERE id = ${ticketId}
     LIMIT 1
  `) as SupportTicketRow[];
  return rows[0] ?? null;
}

/** Pull the message thread for a ticket, oldest first. */
export async function getTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, ticket_id, author_id, author_type, body, created_at
      FROM support_messages
     WHERE ticket_id = ${ticketId}
     ORDER BY created_at ASC
  `) as SupportMessageRow[];
  return rows;
}
