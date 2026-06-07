import Link from "next/link";
import dynamic from "next/dynamic";
import "./landing.css";
import { Icon } from "@/components/icons/Icon";
import LandingChrome from "@/components/landing/LandingChrome";

// Heavy interactive canvases load on demand — saves ~30KB on initial LCP.
const GradientBlinds = dynamic(() => import("@/components/landing/GradientBlinds"), {
  loading: () => <div className="hero-canvas" />,
});
const SignalFlow = dynamic(() => import("@/components/landing/SignalFlow"));

export default function LandingPage() {
  return (
    <div className="landing">
      {/* ============ NAV (floating glass island) ============ */}
      <div className="navbar" id="navbar">
        <nav className="nav">
          <Link href="/" className="brand" aria-label="Issuefy home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
          </Link>
          <div className="nav-links">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#cases">Use cases</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-cta">
            <Link href="/sign-in" className="btn btn-quiet nav-signin">Sign in</Link>
            <Link href="/sign-up" className="btn btn-accent btn-sm">Start free</Link>
            <button className="nav-burger" id="navBurger" aria-label="Open menu" aria-expanded="false">
              <Icon name="Menu01Icon" size={22} />
            </button>
          </div>
        </nav>
      </div>

      {/* ============ MOBILE MENU ============ */}
      <div className="mobile-menu" id="mobileMenu" aria-hidden="true">
        <button className="mm-close" id="mmClose" aria-label="Close menu"><Icon name="Cancel01Icon" size={24} /></button>
        <nav className="mm-links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#cases">Use cases</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="mm-cta">
          <Link href="/sign-in" className="btn btn-ghost btn-lg">Sign in</Link>
          <Link href="/sign-up" className="btn btn-accent btn-lg">Start free</Link>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <section className="hero">
        <GradientBlinds />
        <div className="hero-veil" />
        <div className="wrap hero-inner">
          <h1>Daily AI market intelligence for{" "}your <em>business</em>.</h1>
          <p className="hero-sub">
            Issuefy reads the market while you sleep, tracking competitors, customer signals, and emerging risks,
            then hands you one short, sourced brief every morning. No dashboards to dig through. No tabs to babysit.
          </p>
          <div className="hero-actions">
            <Link href="/sign-up" className="btn btn-accent btn-lg">Start free<Icon name="ArrowRight01Icon" size={18} stroke={2} /></Link>
            <a href="#product" className="btn btn-ghost btn-lg">See a sample brief</a>
          </div>
          <div className="hero-trust">
            <div className="label">Reads 40,000+ public sources, including</div>
            <div className="logos">
              <span>TechCrunch</span><span>Hacker News</span><span>G2</span><span>Reddit</span><span>YouTube</span><span>LinkedIn</span><span>Crunchbase</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRODUCT SHOWCASE ============ */}
      <section className="showcase" id="product">
        <div className="wrap">
          <div className="frame" id="showcaseFrame">
            <div className="frame-bar">
              <div className="dots"><i /><i /><i /></div>
              <div className="bnav">
                <Icon name="ArrowLeft01Icon" size={15} />
                <Icon name="ArrowRight01Icon" size={15} />
                <Icon name="RefreshIcon" size={14} />
              </div>
              <div className="url"><span className="lock"><Icon name="ShieldUserIcon" size={12} /></span>issuefy.app<b>/portal</b></div>
              <div className="btools">
                <Icon name="Bookmark01Icon" size={14} />
                <Icon name="MoreHorizontalIcon" size={15} />
              </div>
            </div>
            <div className="frame-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/portal.png" alt="Issuefy dashboard" className="frame-shot" />
            </div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="sec" id="how">
        <div className="wrap">
          <div className="flow-head">
            <h2>One signal, from the open web to a brief you trust.</h2>
            <p>Issuefy does the reading. Watch a signal travel the system, end to end.</p>
          </div>
          <SignalFlow />
        </div>
      </section>

      {/* ============ BRIEF BAND ============ */}
      <section className="sec">
        <div className="wrap">
          <div className="band">
            <div className="glow" />
            <div className="band-grid">
              <div>
                <h2>A two-minute read that keeps you ahead of the market.</h2>
                <p className="lead">
                  Not another inbox to clear. Issuefy writes one plain-language summary of what actually moved,
                  then shows its work so your team can act with confidence.
                </p>
              </div>
              <div className="quote-card">
                <div className="b-eyebrow"><Icon name="SparklesIcon" size={14} color="#cdd6ff" /> Today&apos;s brief · 4 signals</div>
                <p>Your closest competitor <span className="hl">repriced overnight</span>, and the market hasn&apos;t fully reacted yet.</p>
                <p style={{ fontSize: 16, color: "#aeb4c0" }}>
                  Northwind moved to usage-based tiers at 11pm ET. Reddit sentiment is split on the migration path,
                  a credible opening for your flat-rate positioning this week.
                </p>
                <div className="qfoot">
                  <div className="src-stack">
                    <span className="favicon" style={{ background: "#FF6634" }}>TC</span>
                    <span className="favicon" style={{ background: "#FF4500" }}>R</span>
                    <span className="favicon" style={{ background: "#161b22", color: "#fff" }}>HN</span>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#9aa3b2", marginLeft: 6 }}>Verified across 3 sources</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ USE CASES ============ */}
      <section className="sec" id="cases">
        <div className="wrap">
          <div className="sec-head center">
            <h2>One brief, every angle covered.</h2>
            <p>Founders, product, marketing and strategy teams use Issuefy to replace a dozen open tabs with a single trusted read.</p>
          </div>
          <div className="cases">
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Target01Icon" size={22} /></div>
              <h3>Competitive intelligence</h3>
              <p>Catch launches, pricing changes and positioning shifts the moment they surface — Issuefy re-reads competitor pages and flags what changed, not three weeks later in a sales call.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Megaphone01Icon" size={22} /></div>
              <h3>Customer pain points</h3>
              <p>Surface recurring complaints and unmet needs from reviews, forums, YouTube and Reddit, then turn them into roadmap and messaging.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="ChartIncreaseIcon" size={22} /></div>
              <h3>Market signals</h3>
              <p>Track funding, hiring, and demand shifts across your category so you spot where the market is heading first.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Alert02Icon" size={22} /></div>
              <h3>Risk &amp; threat monitoring</h3>
              <p>Get early warning on new entrants, regulatory moves and reputation risks before they become a fire drill.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Flag02Icon" size={22} /></div>
              <h3>Industry events</h3>
              <p>Catch conferences, summits, trade shows and webinars worth attending, sponsoring or watching — with dates, locations and why they matter, all in one card.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Globe02Icon" size={22} /></div>
              <h3>Local-market coverage</h3>
              <p>Selling outside the US? Issuefy reads in your market&apos;s local language alongside English across 50+ countries — so news, competitors and reviews from your region land in the same brief.</p>
            </div></div>
          </div>
        </div>
      </section>

      {/* ============ PRICING (PRD §21) ============ */}
      <section className="sec pricing" id="pricing" data-billing="annual">
        <div className="wrap">
          <div className="sec-head center">
            <h2>Simple pricing that scales with you.</h2>
            <p>Start with Starter free for 14 days. Upgrade anytime as you grow.</p>
            <div className="bill-toggle">
              <button type="button" id="billMonthly">Monthly</button>
              <button type="button" id="billAnnual" className="on">Annual <span className="bill-save">Save ~2 months</span></button>
            </div>
          </div>

          <div className="tiers">
            {/* Starter */}
            <div className="tier">
              <div className="tier-name">Starter</div>
              <div className="tier-desc">One company, one market.</div>
              <div className="tier-was pa"><span className="old">$29/mo</span></div>
              <div className="tier-price">
                <span className="cur">$</span><span className="amt pa">24</span><span className="amt pm">29</span><span className="per">/mo</span>
              </div>
              <div className="tier-bill pa">billed annually · $288/yr</div>
              <div className="tier-bill pm">billed monthly</div>
              <div className="tier-cta"><Link href="/sign-up?plan=starter&billing=annual" className="btn btn-accent">Start free trial</Link></div>
              <div className="tier-trial">14-day free trial · card required</div>
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">1</span></li>
                <li><span className="lbl">Projects</span><span className="val">1</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">3</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">10</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">300</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">100</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Daily AI summary</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Competitor tracking + change detection</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Keyword monitoring</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Industry-event tracking</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Local-language sources (50+ markets)</li>
              </ul>
            </div>

            {/* Growth */}
            <div className="tier featured">
              <span className="tier-badge">Most popular</span>
              <div className="tier-name">Growth</div>
              <div className="tier-desc">Multiple markets or a small team.</div>
              <div className="tier-was pa"><span className="old">$79/mo</span></div>
              <div className="tier-price">
                <span className="cur">$</span><span className="amt pa">65</span><span className="amt pm">79</span><span className="per">/mo</span>
              </div>
              <div className="tier-bill pa">billed annually · $780/yr</div>
              <div className="tier-bill pm">billed monthly</div>
              <div className="tier-cta"><Link href="/sign-up?plan=growth&billing=annual" className="btn btn-ghost">Get started</Link></div>
              <div className="tier-trial" />
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">3</span></li>
                <li><span className="lbl">Projects</span><span className="val">3</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">5</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">15</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">1,500</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">500</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span><b>Everything in Starter</b></li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Team workspaces (invite Editors &amp; Viewers)</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Source filters</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Priority processing</li>
              </ul>
            </div>

            {/* Agency */}
            <div className="tier">
              <div className="tier-name">Agency</div>
              <div className="tier-desc">Managing several clients or brands.</div>
              <div className="tier-was pa"><span className="old">$199/mo</span></div>
              <div className="tier-price">
                <span className="cur">$</span><span className="amt pa">165</span><span className="amt pm">199</span><span className="per">/mo</span>
              </div>
              <div className="tier-bill pa">billed annually · $1,980/yr</div>
              <div className="tier-bill pm">billed monthly</div>
              <div className="tier-cta"><Link href="/sign-up?plan=agency&billing=annual" className="btn btn-ghost">Get started</Link></div>
              <div className="tier-trial" />
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">10</span></li>
                <li><span className="lbl">Projects</span><span className="val">10</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">10</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">20</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">6,000</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">2,000</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span><b>Everything in Growth</b></li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Client report views</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Shared workspaces</li>
              </ul>
            </div>

            {/* Enterprise */}
            <div className="tier">
              <div className="tier-name">Enterprise</div>
              <div className="tier-desc">Custom volume and controls.</div>
              <div className="tier-was" />
              <div className="tier-price">
                <span className="custom">Custom</span>
              </div>
              <div className="tier-bill">Tailored to your team</div>
              <div className="tier-cta"><a href="#contact" className="btn btn-ghost">Talk to us</a></div>
              <div className="tier-trial" />
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">Custom</span></li>
                <li><span className="lbl">Projects</span><span className="val">Custom</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">Custom</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">Custom</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">Custom</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">Custom</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span><b>Everything in Agency</b></li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>SSO &amp; white-label</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Dedicated support</li>
              </ul>
            </div>
          </div>

          <div className="pricing-note">Every plan includes the daily AI brief, source verification, change detection, industry-event tracking, and local-language coverage in 50+ markets.</div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="sec faq" id="faq">
        <div className="wrap">
          <div className="faq-grid">
            <div className="faq-aside">
              <h2>Questions,<br />answered.</h2>
              <p>Everything you need to know about how Issuefy reads the market. Still curious? <a href="#contact">Talk to us</a>.</p>
            </div>
            <div className="faq-list">
              {[
                ["Where do the signals come from?", "Issuefy continuously reads thousands of public sources — news, forums, product reviews, YouTube, Reddit, LinkedIn and filings — and surfaces what's relevant to the competitors, keywords and markets on your watchlist."],
                ["Does Issuefy work for non-English markets?", "Yes. Pick your market from a curated list of 50+ countries and regions when you set up a project, and Issuefy reads in the local language alongside English. News, competitors and reviews from your region land in the same brief, in their original language."],
                ["Can I trust what the AI tells me?", "Every signal links straight to its original public sources. Nothing is a black box — one click takes you to the article, thread or review so you can verify each claim yourself."],
                ["How is the daily brief generated?", "Each morning, Issuefy reads overnight activity across your sources and condenses it into one short summary plus a handful of categorized signal cards — what changed, and why it matters to you."],
                ["Can my team work on the same project?", "Yes — Growth and Agency plans include team workspaces. Invite teammates as Editors (add competitors, edit settings) or Viewers (read-only access to the brief and signals). Billing stays with the owner."],
                ["Does Issuefy track industry events?", "Yes. Conferences, summits, trade shows and notable webinars are detected as their own 'Industry Event' signal category, with the date and location pulled out so you can decide whether to attend, sponsor or watch."],
                ["Can I choose what to monitor?", "Yes. Set the competitors, keywords and target market you care about in your watchlist, and adjust them anytime. Your brief adapts the next morning."],
                ["Is my data secure?", "Issuefy only reads public sources — never your private systems. Your watchlist and workspace stay private to your team, and SSO with white-label is available on Enterprise."],
                ["Do you offer a free trial?", "Yes — Starter comes with a 14-day free trial. We collect a card upfront, but you won't be charged until day 15. Cancel anytime before then and you pay nothing."],
              ].map(([q, a]) => (
                <div className="faq-item" key={q}>
                  <button className="faq-q">{q}<span className="faq-ic"><Icon name="Add01Icon" size={16} stroke={1.8} /></span></button>
                  <div className="faq-a"><div className="faq-a-inner">{a}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ CONTACT ============ */}
      <section className="sec" id="contact">
        <div className="wrap">
          <div className="contact-band">
            <div className="c-glow" />
            <div className="contact-grid">
              <div className="contact-info">
                <h2>Let&apos;s put Issuefy to work for your market.</h2>
                <p>Questions about plans, security, or a custom setup? Reach out — a real person replies within one business day.</p>
                <a href="mailto:hello@issuefy.app" className="contact-mail"><Icon name="Mail01Icon" size={20} />hello@issuefy.app</a>
                <div className="contact-channels">
                  <Link href="/sign-up" className="c-chip">Book a demo <Icon name="ArrowUpRight01Icon" size={14} /></Link>
                  <a href="#faq" className="c-chip">Browse FAQ <Icon name="ArrowUpRight01Icon" size={14} /></a>
                  <a href="mailto:support@issuefy.app" className="c-chip">Support <Icon name="ArrowUpRight01Icon" size={14} /></a>
                </div>
              </div>
              <div>
                <form className="contact-form" id="contactForm" noValidate>
                  <div className="cf-row">
                    <div className="cf-field">
                      <label htmlFor="cf-name">Name</label>
                      <input className="cf-input" id="cf-name" type="text" placeholder="Maya Chen" required />
                    </div>
                    <div className="cf-field">
                      <label htmlFor="cf-email">Work email</label>
                      <input className="cf-input" id="cf-email" type="email" placeholder="maya@company.com" required />
                    </div>
                  </div>
                  <div className="cf-field">
                    <label htmlFor="cf-msg">How can we help?</label>
                    <textarea className="cf-input" id="cf-msg" placeholder="Tell us what you'd like to monitor…" required />
                  </div>
                  <button type="submit" className="btn btn-accent btn-lg">Send message<Icon name="ArrowRight01Icon" size={18} stroke={2} /></button>
                </form>
                <div className="contact-success">
                  <span className="ok"><Icon name="CheckmarkBadge01Icon" size={24} /></span>
                  <h4>Thanks — message received.</h4>
                  <p>We&apos;ll get back to you within one business day. In the meantime, your first brief is just a trial away.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="cta-final">
        <div className="wrap">
          <h2>Start every morning <em>ahead</em> of the market.</h2>
          <p>Set up your watchlist in minutes. Your first brief lands tomorrow at 7am.</p>
          <div className="acts">
            <Link href="/sign-up" className="btn btn-accent btn-lg">Start free<Icon name="ArrowRight01Icon" size={18} stroke={2} /></Link>
            <a href="#product" className="btn btn-ghost btn-lg">See a sample brief</a>
          </div>
          <div className="cta-note">14-day trial · Card required · Cancel anytime</div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-about">
              <Link href="/" className="brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
              </Link>
              <p>Daily AI market intelligence for businesses that move first. Monitor, summarize, verify.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#product">Overview</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <Link href="/sign-up">Start free</Link>
            </div>
            <div className="foot-col">
              <h4>Use cases</h4>
              <a href="#cases">Competitive intel</a>
              <a href="#cases">Customer signals</a>
              <a href="#cases">Market signals</a>
              <a href="#cases">Risk monitoring</a>
              <a href="#cases">Industry events</a>
              <a href="#cases">Local-market coverage</a>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Careers</a>
              <a href="#">Security</a>
              <a href="#faq">FAQ</a>
              <a href="#contact">Contact</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span className="mono">© 2026 Issuefy, Inc.</span>
            <span className="mono">Built for teams that read the room.</span>
          </div>
        </div>
      </footer>

      <LandingChrome />

      {/* JSON-LD for SEO: Organization + SoftwareApplication + Product offers. */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Issuefy",
              url: "https://issuefy.app",
              logo: "https://issuefy.app/brand/logo-ink.svg",
              sameAs: [],
              description: "Daily AI market intelligence for businesses that move first.",
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Issuefy",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              offers: [
                { "@type": "Offer", name: "Starter",  price: "29",  priceCurrency: "USD", description: "1 project · 3 competitors · 10 keywords" },
                { "@type": "Offer", name: "Growth",   price: "79",  priceCurrency: "USD", description: "3 projects · 5 competitors/project · 15 keywords" },
                { "@type": "Offer", name: "Agency",   price: "199", priceCurrency: "USD", description: "10 projects · 10 competitors/project · 20 keywords" },
              ],
              aggregateRating: undefined,
            },
          ]),
        }}
      />
    </div>
  );
}

export const metadata = {
  title: "Daily AI market intelligence",
  description: "Issuefy reads the open web in your market's language — competitors, customer signals, industry events and emerging risks — and hands you one short, sourced brief every morning. Built for teams that read the room.",
  alternates: { canonical: "/" },
};
