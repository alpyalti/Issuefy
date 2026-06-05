/* Issuefy dashboard — app shell + state. */
const { useState, useMemo } = React;
const D = window.ISSUEFY;

/* ---------- Sidebar ---------- */
const NAV = [
  { id:"today",        label:"Today",        icon:"DashboardSquare01Icon" },
  { id:"signals",      label:"All signals",  icon:"FlashIcon" },
  { id:"competitors",  label:"Competitors",  icon:"Target01Icon" },
  { id:"opportunities",label:"Opportunities",icon:"BulbIcon" },
  { id:"risks",        label:"Risks",        icon:"Alert02Icon" },
  { id:"saved",        label:"Saved",        icon:"Bookmark01Icon" },
  { id:"sources",      label:"Sources",      icon:"News01Icon" }
];

const PAGE = {
  today:        { title:"Today",         sub: D.today + " · brief generated " + D.generatedAt },
  signals:      { title:"All signals",   sub:"Everything Issuefy surfaced for your watchlist" },
  competitors:  { title:"Competitors",   sub:"Moves from the companies you track" },
  opportunities:{ title:"Opportunities", sub:"Openings worth acting on this week" },
  risks:        { title:"Risks",         sub:"Threats to defend against, flagged early" },
  saved:        { title:"Saved",         sub:"Signals you bookmarked to track over time" },
  sources:      { title:"Sources",       sub:"Every source behind your signals — click any to verify" }
};

function Sidebar({ active, setActive, signalCount, savedCount, watchlist, myCompany, onAdd, onDelete }) {
  const competitors = watchlist.filter(w=>w.type==="Competitor");
  const keywords = watchlist.filter(w=>w.type==="Keyword");
  return (
    <aside className="sidebar">
      <a href="Landing Page.html" className="brand side-brand">
        <img src="brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
      </a>

      <div className="side-section">
        <div className="side-label">Workspace</div>
        <nav className="side-nav">
          {NAV.map(n => {
            const badge = n.id==="signals" ? signalCount : n.id==="saved" ? (savedCount||null) : null;
            return (
              <button key={n.id} className={"side-item " + (active === n.id ? "on" : "")} onClick={()=>setActive(n.id)}>
                <Icon name={n.icon} size={19} stroke={active===n.id?1.9:1.6} />
                <span>{n.label}</span>
                {badge ? <span className="side-badge">{badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </div>

      {myCompany && (
        <div className="side-section">
          <div className="side-label">Your company</div>
          <div className="you-chip">
            <span className="you-logo" style={{ background:myCompany.color||"#15171A" }}>{myCompany.initials}</span>
            <span className="you-meta">
              <span className="you-name">{myCompany.name}</span>
              <span className="you-domain">{myCompany.domain}</span>
            </span>
          </div>
        </div>
      )}

      <div className="side-section side-watch">
        <div className="side-label">Watchlist</div>
        <div className="watchlist">
          {competitors.length>0 && <div className="watch-group">Competitors</div>}
          {competitors.map((w)=>(
            <div className="watch-item" key={"c-"+w.label}>
              <span className={"watch-live " + (w.live ? "on":"")}></span>
              <span className="watch-label">{w.label}</span>
              <button className="watch-del" onClick={()=>onDelete(w.label)} aria-label={"Remove "+w.label}><Icon name="Delete02Icon" size={14} stroke={1.7}/></button>
            </div>
          ))}
          {keywords.length>0 && <div className="watch-group">Keywords</div>}
          {keywords.map((w)=>(
            <div className="watch-item" key={"k-"+w.label}>
              <span className={"watch-live " + (w.live ? "on":"")}></span>
              <span className="watch-label">{w.label}</span>
              <button className="watch-del" onClick={()=>onDelete(w.label)} aria-label={"Remove "+w.label}><Icon name="Delete02Icon" size={14} stroke={1.7}/></button>
            </div>
          ))}
          <button className="watch-add" onClick={onAdd}><Icon name="PlusSignIcon" size={15} stroke={1.9}/> Add to watchlist</button>
        </div>
      </div>

      <div className="side-foot">
        <div className="profile">
          <span className="avatar">{D.user.initials}</span>
          <span className="profile-meta">
            <span className="profile-name">{D.user.name}</span>
            <span className="profile-role">{myCompany ? myCompany.name : D.user.company}</span>
          </span>
          <Icon name="Settings01Icon" size={17} stroke={1.6} />
        </div>
      </div>
    </aside>
  );
}

/* ---------- Topbar ---------- */
function Topbar({ title, subtitle, query, setQuery, onCmd, onHelp }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <span className="topbar-date">{subtitle}</span>
      </div>
      <div className="topbar-right">
        <div className="search">
          <Icon name="Search01Icon" size={17} stroke={1.7} />
          <input placeholder="Search signals, sources, companies…" value={query} onChange={e=>setQuery(e.target.value)} />
          {query
            ? <button className="search-clear" onClick={()=>setQuery("")}><Icon name="Cancel01Icon" size={14} stroke={1.8}/></button>
            : <button className="kbd" onClick={onCmd} title="Command menu (⌘K)" style={{cursor:"pointer"}}>⌘K</button>}
        </div>
        <button className="icon-btn lg" title="Setup guide" onClick={onHelp}><Icon name="Idea01Icon" size={18} stroke={1.6} /></button>
        <button className="icon-btn lg" title="Notifications"><Icon name="Notification01Icon" size={19} stroke={1.6} /><span className="bell-dot"></span></button>
        <span className="avatar sm">{D.user.initials}</span>
      </div>
    </header>
  );
}

/* ---------- ⌘K Command palette ---------- */
function CommandPalette({ open, onClose, setActive }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = React.useRef(null);

  const ql = q.trim().toLowerCase();
  const navItems = NAV.filter(n => !ql || n.label.toLowerCase().includes(ql))
    .map(n => ({ type:"nav", id:n.id, icon:n.icon, title:n.label, sub:"Jump to " + n.label }));
  const sigItems = D.signals.filter(s => ql && (s.title + " " + s.tags.join(" ")).toLowerCase().includes(ql))
    .slice(0,5).map(s => ({ type:"signal", sig:s, icon:CAT[s.category].dotIcon, title:s.title, sub:CAT[s.category].label + " · " + s.tags.map(t=>"#"+t).join(" ") }));
  const sourceItems = D.recentSources.filter(s => !ql || (s.name + " " + s.headline).toLowerCase().includes(ql))
    .slice(0,6).map(s => ({ type:"source", src:s, title:s.headline, sub:s.name + " · " + s.time }));

  const groups = [];
  if (navItems.length) groups.push({ label:"Navigate", items:navItems });
  if (sigItems.length) groups.push({ label:"Signals", items:sigItems });
  if (sourceItems.length) groups.push({ label:"Recent sources", items:sourceItems });
  const flat = groups.flatMap(g => g.items);

  React.useEffect(()=>{ if(open){ setQ(""); setSel(0); const t=setTimeout(()=> inputRef.current && inputRef.current.focus(), 30); return ()=>clearTimeout(t); } }, [open]);
  React.useEffect(()=>{ setSel(0); }, [q]);

  function activate(item){
    if(!item) return;
    if(item.type==="nav"){ setActive(item.id); onClose(); }
    else if(item.type==="signal"){ setActive(item.sig.category==="signal"?"signals":(item.sig.category==="competitor"?"competitors":item.sig.category==="opportunity"?"opportunities":"risks")); onClose(); }
    else if(item.type==="source"){ if(item.src.url && item.src.url!=="#") window.open(item.src.url, "_blank"); onClose(); }
  }
  function onKey(e){
    if(e.key==="ArrowDown"){ e.preventDefault(); setSel(s=> Math.min(s+1, flat.length-1)); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); setSel(s=> Math.max(s-1, 0)); }
    else if(e.key==="Enter"){ e.preventDefault(); activate(flat[sel]); }
    else if(e.key==="Escape"){ e.preventDefault(); onClose(); }
  }
  if(!open) return null;
  let idx = -1;
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={e=>e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdk-input">
          <Icon name="Search01Icon" size={19} stroke={1.7}/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search signals, sources, or jump to a view…" />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-list">
          {flat.length===0 && <div className="cmdk-empty">No matches for “{q}”</div>}
          {groups.map((g,gi)=>(
            <div key={gi}>
              <div className="cmdk-group">{g.label}</div>
              {g.items.map((item,ii)=>{ idx++; const cur=idx;
                return (
                  <div key={ii} className={"cmdk-item " + (cur===sel?"sel":"")} onMouseEnter={()=>setSel(cur)} onClick={()=>activate(item)}>
                    {item.type==="source"
                      ? <Favicon s={item.src} size={31} />
                      : <span className="cmdk-ic"><Icon name={item.icon} size={17} stroke={1.7}/></span>}
                    <span className="cmdk-tx">
                      <span className="cmdk-t">{item.title}</span>
                      <span className="cmdk-s">{item.sub}</span>
                    </span>
                    <span className="cmdk-enter">↵</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Daily AI Summary ---------- */
function SummaryCard() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(true);
  function regen(){ setBusy(true); setTimeout(()=>setBusy(false), 1300); }
  const html = D.summary.body.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return (
    <section className={"brief-card " + (busy ? "busy":"")}>
      <div className="brief-glow"></div>
      <div className="brief-head">
        <div className="brief-eyebrow">
          <Icon name="SparklesIcon" size={15} stroke={1.7} color="#cdd6ff" />
          <span>AI summary</span>
          <span className="brief-sep">·</span>
          <span>{D.summary.count} things today</span>
        </div>
        <div className="brief-tools">
          <button className="brief-btn" onClick={regen}>
            <Icon name="RefreshIcon" size={15} stroke={1.8} className={busy?"spin":""} />
            {busy ? "Reading…" : "Regenerate"}
          </button>
        </div>
      </div>

      <p className="brief-lead">{D.summary.lead}</p>
      <p className="brief-body" dangerouslySetInnerHTML={{ __html: html }} />

      <button className="brief-toggle" onClick={()=>setShow(s=>!s)}>
        <Icon name={show?"ArrowUp01Icon":"ArrowDown01Icon"} size={14} stroke={1.8}/>
        {show ? "Hide suggested moves" : "Show suggested moves"}
      </button>

      {show && (
        <div className="brief-moves">
          {D.summary.moves.map((m,i)=>(
            <div className="move" key={i}>
              <span className="move-num">{i+1}</span>
              <span className="move-text">{m}</span>
            </div>
          ))}
        </div>
      )}
      {busy && <div className="brief-shimmer"></div>}
    </section>
  );
}

/* ---------- Stats row ---------- */
function Stats() {
  return (
    <div className="stats-row">
      {D.stats.map((s,i)=>(
        <div className={"stat tone-"+s.tone} key={i}>
          <div className="stat-top">
            <span className="stat-label">{s.label}</span>
            <span className="stat-ic"><Icon name={s.icon} size={17} stroke={1.7} /></span>
          </div>
          <div className="stat-bottom">
            <span className="stat-num">{s.value}</span>
            <span className="stat-delta"><Icon name="ArrowUp01Icon" size={12} stroke={2} />{s.delta.replace(/^\+/, "")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Filter tabs ---------- */
const TABS = [
  { id:"all", label:"Latest signals" },
  { id:"competitor", label:"Competitors" },
  { id:"opportunity", label:"Opportunities" },
  { id:"threat", label:"Risks" }
];
function Tabs({ value, setValue, counts }) {
  return (
    <div className="tabs">
      {TABS.map(t=>(
        <button key={t.id} className={"tab " + (value===t.id?"on":"")} onClick={()=>setValue(t.id)}>
          {t.label}<span className="tab-count">{counts[t.id]}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Recent sources rail ---------- */
function RecentSources({ onViewAll }) {
  return (
    <section className="rail-card">
      <div className="rail-head">
        <h3>Recent sources</h3>
        <span className="rail-sub">Newest, click to verify</span>
      </div>
      <div className="rail-sources">
        {D.recentSources.map((s,i)=>(
          <a className="rail-source" href={s.url} target="_blank" rel="noopener" key={i} onClick={(e)=>{ if(s.url==="#") e.preventDefault(); }}>
            <Favicon s={s} size={26} />
            <span className="rail-src-meta">
              <span className="rail-src-head">{s.headline}</span>
              <span className="rail-src-sub">{s.name} · {s.time}</span>
            </span>
            <Icon name="ArrowUpRight01Icon" size={15} stroke={1.7} />
          </a>
        ))}
      </div>
      <button className="rail-all" onClick={onViewAll}>View all sources <Icon name="ArrowRight01Icon" size={15} stroke={1.8}/></button>
    </section>
  );
}

/* ---------- Sources page ---------- */
function SourcesPage() {
  const all = [];
  D.signals.forEach(sig => sig.sources.forEach(s => all.push(s)));
  D.recentSources.forEach(s => all.push(s));
  const map = new Map();
  all.forEach(s => {
    if(!map.has(s.name)) map.set(s.name, { name:s.name, kind:s.kind, color:s.color, initials:s.initials, items:new Map() });
    const e = map.get(s.name);
    if(!e.items.has(s.headline)) e.items.set(s.headline, s);
  });
  const pubs = [...map.values()].map(p=>({ ...p, items:[...p.items.values()] })).sort((a,b)=> b.items.length - a.items.length);
  const totalLinks = pubs.reduce((n,p)=> n + p.items.length, 0);
  const kinds = new Set(pubs.map(p=>p.kind));
  return (
    <div className="sources-page">
      <div className="sources-summary">
        <div className="ss-stat"><span className="ss-num">{pubs.length}</span><span className="ss-lab">sources tracked</span></div>
        <div className="ss-divider"></div>
        <div className="ss-stat"><span className="ss-num">{kinds.size}</span><span className="ss-lab">source types</span></div>
        <div className="ss-divider"></div>
        <div className="ss-stat"><span className="ss-num">{totalLinks}</span><span className="ss-lab">links to verify</span></div>
      </div>
      <div className="source-pubs">
        {pubs.map((p,i)=>(
          <div className="source-pub" key={i}>
            <div className="source-pub-head">
              <Favicon s={p} size={34} />
              <span className="source-pub-meta">
                <span className="source-pub-name">{p.name}</span>
                <span className="source-pub-kind">{p.kind} · {p.items.length} link{p.items.length>1?"s":""}</span>
              </span>
            </div>
            <div className="source-pub-links">
              {p.items.map((it,j)=>(
                <a className="source-link" href={it.url} target="_blank" rel="noopener" key={j} onClick={(e)=>{ if(it.url==="#") e.preventDefault(); }}>
                  <span className="source-link-dot"></span>
                  <span className="source-link-head">{it.headline}</span>
                  <span className="source-link-time">{it.time}</span>
                  <Icon name="ArrowUpRight01Icon" size={14} stroke={1.7} />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Filter bar (date / company / topic) ---------- */
const DATE_RANGES = [["7d","7 days"],["30d","30 days"],["90d","90 days"]];
const RANGE_HOURS = { "7d":168, "30d":720, "90d":2160 };
const COMPANIES = D.watchlist.filter(w=>w.type==="Competitor").map(w=>w.label);
const TOPICS = [...new Set(D.signals.flatMap(s=>s.tags))].filter(t=> !COMPANIES.includes(t)).sort();

function Dropdown({ icon, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{ const h=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); }, []);
  const cur = options.find(o=> o.value===(value||""));
  return (
    <div className={"dd " + (open?"open":"")} ref={ref}>
      <button className="dd-btn" onClick={()=>setOpen(o=>!o)}>
        {icon && <Icon name={icon} size={15} stroke={1.7}/>}
        {cur && cur.dot && <span className="dd-dot" style={{background:cur.dot}}></span>}
        <span className="dd-val">{cur ? cur.label : label}</span>
        <Icon name="ArrowDown01Icon" size={14} stroke={2} className="dd-chev"/>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map(o=>(
            <button key={o.value||"all"} className={"dd-item " + (o.value===(value||"")?"sel":"")} onClick={()=>{ onChange(o.value||null); setOpen(false); }}>
              {o.dot ? <span className="dd-dot" style={{background:o.dot}}></span> : null}
              <span className="dd-item-label">{o.label}</span>
              {o.value===(value||"") && <Icon name="Tick02Icon" size={15} stroke={2}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({ dateRange, setDateRange, company, setCompany, topic, setTopic, flagged, setFlagged }) {
  const companyOpts = [{ value:"", label:"All companies" }, ...COMPANIES.map(c=>({ value:c, label:c, dot:"var(--accent)" }))];
  const topicOpts = [{ value:"", label:"All topics" }, ...TOPICS.map(t=>({ value:t, label:t }))];
  return (
    <div className="filterbar">
      <div className="seg">
        {DATE_RANGES.map(([v,l])=>(
          <button key={v} className={"seg-btn " + (dateRange===v?"on":"")} onClick={()=>setDateRange(v)}>{l}</button>
        ))}
      </div>
      <div className="filter-selects">
        <button className={"flag-toggle " + (flagged?"on":"")} onClick={()=>setFlagged(f=>!f)} title="Show flagged signals only">
          <Icon name="Flag02Icon" size={15} stroke={1.8}/> Flagged
        </button>
        <Dropdown icon="Target01Icon" label="All companies" value={company} options={companyOpts} onChange={setCompany} />
        <Dropdown icon="Tag01Icon" label="All topics" value={topic} options={topicOpts} onChange={setTopic} />
      </div>
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [active, setActive] = useState("today");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(()=> new Set(D.signals.filter(s=>s.saved).map(s=>s.id)));
  const [dismissed, setDismissed] = useState(()=> new Set());
  const [leaving, setLeaving] = useState(()=> new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dateRange, setDateRange] = useState("7d");
  const [company, setCompany] = useState(null);
  const [topic, setTopic] = useState(null);
  const [flagged, setFlagged] = useState(false);
  const [watchlist, setWatchlist] = useState(D.watchlist);
  const [myCompany, setMyCompany] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [onboard, setOnboard] = useState(()=>{ try { return !localStorage.getItem("issuefy_onboarded"); } catch(e){ return false; } });

  function addWatch(label, type){ setWatchlist(prev=> prev.some(w=>w.label.toLowerCase()===label.toLowerCase()) ? prev : [...prev, { label, type, live:true }]); }
  function deleteWatch(label){ setWatchlist(prev=> prev.filter(w=> w.label!==label)); }
  function dismissOnboard(){ try { localStorage.setItem("issuefy_onboarded","1"); } catch(e){} setOnboard(false); }
  function completeOnboard({ me, competitors, keywords }){
    if(me) setMyCompany(me);
    const adds = [ ...competitors.map(c=>({label:c.name,type:"Competitor",live:true})), ...keywords.map(l=>({label:l,type:"Keyword",live:true})) ];
    setWatchlist(prev=>{ const names=new Set(prev.map(w=>w.label.toLowerCase())); return [...prev, ...adds.filter(a=>!names.has(a.label.toLowerCase()))]; });
  }

  React.useEffect(()=>{
    const onKey = (e)=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setPaletteOpen(o=>!o); }
    };
    window.addEventListener("keydown", onKey);
    return ()=> window.removeEventListener("keydown", onKey);
  }, []);

  const navTab = { today:"all", signals:"all", competitors:"competitor", opportunities:"opportunity", risks:"threat" };
  const isFeedTabbed = active==="today" || active==="signals";
  const effectiveTab = isFeedTabbed ? tab : (navTab[active] || "all");

  const maxHours = active==="today" ? 24 : RANGE_HOURS[dateRange];

  const base = useMemo(()=>{
    return D.signals.filter(s=>{
      if(dismissed.has(s.id)) return false;
      if(active==="saved" && !saved.has(s.id)) return false;
      if(s.hoursAgo > maxHours) return false;
      if(active!=="today"){
        if(flagged && s.severity!=="high") return false;
        if(company && !(s.title+" "+s.context+" "+s.tags.join(" ")).toLowerCase().includes(company.toLowerCase())) return false;
        if(topic && !s.tags.includes(topic)) return false;
      }
      return true;
    });
  }, [active, dismissed, saved, maxHours, company, topic, flagged]);

  const counts = useMemo(()=>{
    const c = { all:base.length, competitor:0, opportunity:0, threat:0 };
    base.forEach(s=>{ if(c[s.category]!=null) c[s.category]++; });
    return c;
  }, [base]);

  const savedCount = useMemo(()=> [...saved].filter(id=> !dismissed.has(id)).length, [saved, dismissed]);

  const list = useMemo(()=>{
    const q = query.trim().toLowerCase();
    return base.filter(s=>{
      if(effectiveTab!=="all" && s.category!==effectiveTab) return false;
      if(q){
        const hay = (s.title+" "+s.context+" "+s.tags.join(" ")+" "+s.sources.map(x=>x.name+x.headline).join(" ")).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }, [base, effectiveTab, query]);

  function toggleSave(id){ setSaved(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function dismiss(id){
    setLeaving(prev=> new Set(prev).add(id));
    setTimeout(()=>{
      setDismissed(prev=> new Set(prev).add(id));
      setLeaving(prev=>{ const n=new Set(prev); n.delete(id); return n; });
    }, 240);
  }

  const meta = PAGE[active] || PAGE.today;

  return (
    <div className="dash">
      <Sidebar active={active} setActive={setActive} signalCount={counts.all} savedCount={savedCount} watchlist={watchlist} myCompany={myCompany} onAdd={()=>setAddOpen(true)} onDelete={deleteWatch} />
      <main className="main">
        <Topbar title={meta.title} subtitle={meta.sub} query={query} setQuery={setQuery} onCmd={()=>setPaletteOpen(true)} onHelp={()=>setOnboard(true)} />
        <div className="main-scroll">
          {active==="sources" ? (
            <div className="page-wrap"><SourcesPage /></div>
          ) : (
            <div className="main-grid">
              <div className="feed">
                {active==="today" && <><SummaryCard /><Stats /></>}
                {active!=="today" && <FilterBar dateRange={dateRange} setDateRange={setDateRange} company={company} setCompany={setCompany} topic={topic} setTopic={setTopic} flagged={flagged} setFlagged={setFlagged} />}

                <div className="feed-head">
                  {isFeedTabbed
                    ? <Tabs value={tab} setValue={setTab} counts={counts} />
                    : <h2 className="feed-title">{meta.title}<span className="feed-title-count">{list.length}</span></h2>}
                  <div className="feed-sort"><Icon name="FilterHorizontalIcon" size={15} stroke={1.7}/> Sorted by relevance</div>
                </div>

                <div className="signal-list">
                  {list.length===0 && (
                    <div className="empty">
                      <Icon name={active==="saved"?"Bookmark01Icon":"Search01Icon"} size={26} stroke={1.5} />
                      <p>{active==="saved"
                        ? "No saved signals yet. Bookmark a signal to keep track of how it develops."
                        : ("No signals match" + (query?` "${query}"`:"") + ".")}</p>
                    </div>
                  )}
                  {list.map(s=>(
                    <SignalCard key={s.id} sig={s} saved={saved.has(s.id)} leaving={leaving.has(s.id)}
                      onSave={()=>toggleSave(s.id)} onDismiss={()=>dismiss(s.id)} />
                  ))}
                </div>
              </div>

              <div className="rail">
                <RecentSources onViewAll={()=>setActive("sources")} />
                {active!=="saved" ? (
                  <button className="rail-card mini saved-card" onClick={()=>setActive("saved")}>
                    <div className="rail-head"><h3>Saved</h3><Icon name="ArrowRight01Icon" size={15} stroke={1.7}/></div>
                    <div className="saved-count">
                      <span className="saved-big">{savedCount}</span>
                      <span>signal{savedCount===1?"":"s"} saved for later</span>
                    </div>
                  </button>
                ) : (
                  <section className="rail-card mini">
                    <div className="rail-head"><h3>How saving works</h3></div>
                    <div className="rail-tip">
                      <Icon name="Idea01Icon" size={15} stroke={1.7} color="#1E47C0" />
                      <span>Bookmarked signals stay here so you can watch a story develop across the week.</span>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} setActive={setActive} />
      {addOpen && <AddWatchModal onClose={()=>setAddOpen(false)} onAdd={addWatch} />}
      {onboard && <Onboarding userName={D.user.name} defaultCompany={D.user.company} onClose={dismissOnboard} onComplete={completeOnboard} />}
    </div>
  );
}

function mount(){ ReactDOM.createRoot(document.getElementById("root")).render(<App />); }
if (window.Issuefy && window.Issuefy.ready) mount();
else document.addEventListener("issuefy:icons-ready", mount, { once:true });
