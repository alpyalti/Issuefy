/* Issuefy dashboard — UI components. Exposes to window for app.jsx. */

function Icon({ name, size = 20, stroke = 1.6, color = "currentColor", className = "", style = {} }) {
  const html = (window.Issuefy && window.Issuefy.svgFor)
    ? window.Issuefy.svgFor(name, { size, stroke, color })
    : "";
  return <span className={"ic-wrap " + className} style={{ display: "inline-flex", lineHeight: 0, ...style }}
    dangerouslySetInnerHTML={{ __html: html }} />;
}

const CAT = {
  competitor:  { label:"Competitor",  pill:"pill-info", dotIcon:"Target01Icon",     tone:"info" },
  opportunity: { label:"Opportunity", pill:"pill-pos",  dotIcon:"BulbIcon",         tone:"pos"  },
  threat:      { label:"Risk",        pill:"pill-neg",  dotIcon:"Alert02Icon",      tone:"neg"  },
  signal:      { label:"Market",      pill:"",          dotIcon:"ChartIncreaseIcon",tone:"mute" }
};
const SEV = {
  high: { label:"High signal", cls:"sev-high" },
  med:  { label:"Worth a look", cls:"sev-med" },
  low:  { label:"FYI", cls:"sev-low" }
};
function fmtAge(h){ if(h==null) return ""; if(h<1) return "just now"; if(h<24) return h+"h ago"; const d=Math.round(h/24); return d+"d ago"; }
const COMPANY_SET = new Set(((window.ISSUEFY && window.ISSUEFY.watchlist) || []).filter(w=>w.type==="Competitor").map(w=>w.label));

/* ---- Favicon chip ---- */
function Favicon({ s, size = 22 }) {
  return <span className="favicon" style={{ background: s.color, width: size, height: size, fontSize: size <= 18 ? 9 : 10 }}>{s.initials}</span>;
}

/* ---- Clickable source button (credibility-forward) ---- */
function SourceButton({ s }) {
  return (
    <a className="source" href={s.url} target="_blank" rel="noopener" onClick={(e)=>{ if(s.url==="#") e.preventDefault(); }}>
      <Favicon s={s} />
      <span className="src-meta">
        <span className="src-name">{s.name}</span>
        <span className="src-time">{s.kind} · {s.time}</span>
      </span>
      <span className="ext"><Icon name="ArrowUpRight01Icon" size={15} stroke={1.8} /></span>
    </a>
  );
}

/* ---- Stacked favicons ---- */
function SourceStack({ sources }) {
  return (
    <div className="src-stack">
      {sources.slice(0,3).map((s,i)=> <Favicon key={i} s={s} size={24} />)}
      {sources.length > 3 && <span className="favicon more">+{sources.length-3}</span>}
    </div>
  );
}

/* ---- Signal card ---- */
function SignalCard({ sig, saved, leaving, onSave, onDismiss }) {
  const [open, setOpen] = React.useState(false);
  const cat = CAT[sig.category];
  const sev = SEV[sig.severity];
  return (
    <article className={"signal " + (sig.isNew ? "is-new " : "") + (leaving ? "leaving" : "")}>
      <div className="signal-rail">
        <span className={"sev-bar cat-" + sig.category}></span>
      </div>
      <div className="signal-body">
        <header className="signal-top">
          <div className="signal-tags">
            <span className={"pill " + cat.pill}><span className="dot"></span>{cat.label}</span>
            {(sig.severity==="high" || sig.severity==="med") &&
              <span className={"sev-flag sev-" + sig.severity} title={sig.severity==="high" ? "Flagged · high importance" : "Worth a look"}>
                <Icon name="Flag02Icon" size={13} stroke={2} />
              </span>}
            {sig.isNew && <span className="new-dot">New</span>}
            <span className="signal-age">{fmtAge(sig.hoursAgo)}</span>
          </div>
          <div className="signal-actions">
            <button className={"icon-btn " + (saved ? "on" : "")} title={saved ? "Saved" : "Save"} onClick={onSave}>
              <Icon name={saved ? "Bookmark01Icon" : "Bookmark01Icon"} size={17} stroke={saved?2:1.6} />
            </button>
            <button className="icon-btn" title="Dismiss" onClick={onDismiss}>
              <Icon name="Cancel01Icon" size={16} stroke={1.7} />
            </button>
          </div>
        </header>

        <p className="signal-take">{sig.title}</p>
        <p className="signal-context">{sig.context}</p>

        <div className="signal-meta">
          {[...sig.tags].sort((a,b)=> (COMPANY_SET.has(b)?1:0)-(COMPANY_SET.has(a)?1:0)).map((t,i)=> <span className={"tag " + (COMPANY_SET.has(t)?"tag-co":"")} key={i}>{t}</span>)}
        </div>

        <footer className="signal-foot">
          <button className="srcbtn" onClick={()=>setOpen(o=>!o)}>
            <SourceStack sources={sig.sources} />
            <span className="srcbtn-label">{sig.sources.length} sources</span>
            <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={15} stroke={1.8} />
          </button>
          <span className="verified"><Icon name="CheckmarkBadge01Icon" size={15} stroke={1.7}/> Cross-verified</span>
        </footer>

        {open && (
          <div className="sources-open">
            <div className="sources-open-head">
              <Icon name="LinkSquare02Icon" size={14} stroke={1.7} />
              <span>Verify at the source</span>
            </div>
            <div className="sources-list">
              {sig.sources.map((s,i)=> <SourceButton key={i} s={s} />)}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

Object.assign(window, { Icon, Favicon, SourceButton, SourceStack, SignalCard, CAT, SEV });
