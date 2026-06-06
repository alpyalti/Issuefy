/**
 * FAQ content for /support. Hardcoded as a single source of truth so the
 * support page and any later marketing surfaces (landing page, docs) can
 * share the same answers.
 */
export interface FaqEntry { q: string; a: string }

export const SUPPORT_FAQ: FaqEntry[] = [
  {
    q: "How does the free trial work?",
    a: "Starter comes with a 14-day free trial. We collect a card upfront, but you won't be charged until day 15 — cancel anytime before then and you pay nothing. Growth and Agency start today.",
  },
  {
    q: "What sources does Issuefy read?",
    a: "We read 40,000+ public sources, including TechCrunch, Hacker News, G2, Reddit, Crunchbase and the websites of every competitor you add. The AI summarizes the day across them into one short brief and a list of signals.",
  },
  {
    q: "When does the daily brief arrive?",
    a: "Around 06:00 UTC every weekday, in your inbox if you've enabled it in Account → Notifications. You can also trigger a refresh from the dashboard at any time to see signals sooner.",
  },
  {
    q: "Can I invite my team?",
    a: "Yes — owners can invite Editors (full data control) and Viewers (read-only) from Project Settings → Team. Seats are counted per-account: Starter 1, Growth 3, Agency 10 (owner + invitees). Invitees ride on your plan; they don't need their own card.",
  },
  {
    q: "How does competitor change detection work?",
    a: "Each scrape hashes the competitor's homepage and stores the previous text when the hash changes. The AI compares before vs after on the next signal pass and surfaces material changes (pricing flips, hero rewrites, dropped products, leadership changes) as Competitor Move or Pricing/Offer Change signals.",
  },
  {
    q: "Do you scrape social media?",
    a: "Selectively. YouTube and Reddit are monitored daily (free, public APIs). LinkedIn About-page is scraped once a week using premium proxies. We deliberately skip Instagram, X/Twitter, TikTok and Facebook — their public surface is too small or too brittle to justify the cost.",
  },
  {
    q: "Is my data secure?",
    a: "Issuefy only reads public sources — never your private systems. Your watchlist and workspace stay private to your team. Tickets and account information are stored on the same managed Postgres + S3 infrastructure as your projects, with TLS everywhere.",
  },
  {
    q: "How do I change or cancel my plan?",
    a: "Account → Plan → Manage billing opens Stripe's Customer Portal where you can change plan, update your card, view invoices, or cancel. Invited team members ride on the owner's plan and don't have their own billing controls.",
  },
];
