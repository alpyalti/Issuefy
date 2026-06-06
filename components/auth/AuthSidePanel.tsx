"use client";

import { Icon } from "@/components/icons/Icon";

/**
 * Right-side panel for /sign-in and /sign-up — shows what users are about to
 * step into: a sample brief card on dark ink (matching the in-app design),
 * with a pull-quote, a source trust strip, and a value bullet list.
 *
 * Hidden on mobile (<880px) — auth form takes the full width there.
 */
export default function AuthSidePanel() {
  return (
    <aside className="auth-side">
      <div className="auth-side-inner">
        {/* Editorial pull quote */}
        <p className="auth-side-quote">
          Your morning, <em>one read</em>.
        </p>
        <p className="auth-side-sub">
          One short, AI-summarized market brief — every weekday, before your first meeting.
        </p>

        {/* Mini brief card — same design language as in-app .brief-card */}
        <div className="auth-side-card">
          <div className="auth-side-card-eyebrow">
            <Icon name="SparklesIcon" size={12} stroke={1.7} color="#cdd6ff" />
            <span>AI summary · Today</span>
          </div>
          <p className="auth-side-card-lead">Three things this morning.</p>
          <p className="auth-side-card-body">
            Your closest competitor quietly shipped usage-based pricing overnight, and early Reddit reaction is split. A credible window to reinforce your positioning.
          </p>
          <div className="auth-side-card-foot">
            <span className="auth-side-stack">
              <span className="auth-side-favicon" style={{ background: "#FF6634" }}>TC</span>
              <span className="auth-side-favicon" style={{ background: "#FF4500" }}>R</span>
              <span className="auth-side-favicon" style={{ background: "#161b22" }}>HN</span>
            </span>
            <span className="auth-side-stack-label">Verified across 3 sources</span>
          </div>
        </div>

        {/* Trust strip */}
        <div className="auth-side-trust">
          <span className="auth-side-trust-label">Reads 40,000+ sources, including</span>
          <div className="auth-side-trust-logos">
            <span>TechCrunch</span>
            <span>Hacker News</span>
            <span>G2</span>
            <span>Reddit</span>
            <span>Crunchbase</span>
          </div>
        </div>

        {/* Value bullets */}
        <ul className="auth-side-list">
          <li><Icon name="Tick02Icon" size={13} stroke={2} /> 14-day free trial — no charge until day 15</li>
          <li><Icon name="Tick02Icon" size={13} stroke={2} /> Daily brief in your inbox, every morning</li>
          <li><Icon name="Tick02Icon" size={13} stroke={2} /> Every claim links to its original source</li>
        </ul>
      </div>
    </aside>
  );
}
