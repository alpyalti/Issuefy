import Link from "next/link";
import "./landing.css";
import { Icon } from "@/components/icons/Icon";
import GradientBlinds from "@/components/landing/GradientBlinds";
import SignalFlow from "@/components/landing/SignalFlow";
import LandingChrome from "@/components/landing/LandingChrome";

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
            <Link href="/dashboard">Live demo</Link>
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
          <Link href="/dashboard">Live demo</Link>
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
              <span>TechCrunch</span><span>Hacker News</span><span>G2</span><span>Reddit</span><span>Crunchbase</span><span>The{" "}Information</span>
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
            <h2>One brief, four ways to stay sharp.</h2>
            <p>Founders, product, marketing and strategy teams use Issuefy to replace a dozen open tabs with a single trusted read.</p>
          </div>
          <div className="cases">
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Target01Icon" size={22} /></div>
              <h3>Competitive intelligence</h3>
              <p>Catch launches, pricing changes and positioning shifts the moment they surface, not three weeks later in a sales call.</p>
            </div></div>
            <div className="bg-card"><span className="bg-edge" /><div className="bg-inner usecase">
              <div className="uc-ic"><Icon name="Megaphone01Icon" size={22} /></div>
              <h3>Customer pain points</h3>
              <p>Surface recurring complaints and unmet needs from reviews, forums and social, then turn them into roadmap and messaging.</p>
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
          </div>
        </div>
      </section>

      {/* ============ PRICING (PRD §21) ============ */}
      <section className="sec pricing" id="pricing" data-billing="annual">
        <div className="wrap">
          <div className="sec-head center">
            <h2>Simple pricing that scales with you.</h2>
            <p>Try Starter free for 14 days, no credit card. Upgrade anytime as you grow.</p>
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
              <div className="tier-cta"><Link href="/sign-up" className="btn btn-accent">Start free trial</Link></div>
              <div className="tier-trial">14-day free trial · no card</div>
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">1</span></li>
                <li><span className="lbl">Projects</span><span className="val">1</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">3</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">15</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">300</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">100</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Daily AI summary</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Competitor tracking</li>
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span>Keyword monitoring</li>
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
              <div className="tier-cta"><Link href="/sign-up" className="btn btn-accent">Get started</Link></div>
              <div className="tier-trial" />
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">3</span></li>
                <li><span className="lbl">Projects</span><span className="val">3</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">5</span></li>
                <li><span className="lbl">Keywords/project</span><span className="val">20</span></li>
                <li><span className="lbl">Sources/month</span><span className="val">1,500</span></li>
                <li><span className="lbl">AI signals/month</span><span className="val">500</span></li>
              </ul>
              <ul className="tier-feats">
                <li><span className="fi"><Icon name="Tick02Icon" size={15} /></span><b>Everything in Starter</b></li>
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
              <div className="tier-cta"><Link href="/sign-up" className="btn btn-ghost">Get started</Link></div>
              <div className="tier-trial" />
              <ul className="tier-specs">
                <li><span className="lbl">Seats</span><span className="val">10</span></li>
                <li><span className="lbl">Projects</span><span className="val">10</span></li>
                <li><span className="lbl">Competitors/project</span><span className="val">5</span></li>
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

          <div className="pricing-note">Every plan includes the daily AI brief, source verification, and the full dashboard.</div>
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
                ["Where do the signals come from?", "Issuefy continuously reads thousands of public sources — news, forums, product reviews, social posts and filings — and surfaces what's relevant to the competitors, keywords and markets on your watchlist."],
                ["Can I trust what the AI tells me?", "Every signal links straight to its original public sources. Nothing is a black box — one click takes you to the article, thread or review so you can verify each claim yourself."],
                ["How is the daily brief generated?", "Each morning, Issuefy reads overnight activity across your sources and condenses it into one short summary plus a handful of categorized signal cards — what changed, and why it matters to you."],
                ["Can I choose what to monitor?", "Yes. Set the competitors, keywords and markets you care about in your watchlist, and adjust them anytime. Your brief adapts the next morning."],
                ["Is my data secure?", "Issuefy only reads public sources — never your private systems. Your watchlist and workspace stay private to your team, and SSO with white-label is available on Enterprise."],
                ["Do you offer a free trial?", "Starter comes with a 14-day free trial — no credit card needed. Explore the full daily brief and dashboard, then pick a plan whenever you're ready."],
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
            <Link href="/dashboard" className="btn btn-accent btn-lg">Open the dashboard<Icon name="ArrowRight01Icon" size={18} stroke={2} /></Link>
            <a href="#product" className="btn btn-ghost btn-lg">See a sample brief</a>
          </div>
          <div className="cta-note">No credit card · 14-day trial · Cancel anytime</div>
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
              <Link href="/dashboard">Live demo</Link>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="foot-col">
              <h4>Use cases</h4>
              <a href="#cases">Competitive intel</a>
              <a href="#cases">Customer signals</a>
              <a href="#cases">Market signals</a>
              <a href="#cases">Risk monitoring</a>
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
    </div>
  );
}
