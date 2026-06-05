/* Issuefy dashboard — Add-to-watchlist modal + first-run onboarding (website-first). */
const { useState: useStateM, useRef: useRefM } = React;

/* ---------- simulated website enrichment ---------- */
function domainFrom(url){
  let u = (url||"").trim().toLowerCase();
  u = u.replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"").replace(/\s+/g,"");
  return u;
}
function titleCase(s){ return s.split(/[-_]/).map(w=> w.charAt(0).toUpperCase()+w.slice(1)).join(" "); }
function nameFromDomain(d){ const base=(d.split(".")[0]||d); return titleCase(base); }

/* a few known companies for realism; everything else is derived generically */
const KNOWN = {
  "tasklane.com":  { name:"Tasklane",  tagline:"Flat-rate project management for teams", color:"#2D5BE3" },
  "northwind.io":  { name:"Northwind", tagline:"Usage-based work platform", color:"#168F6B" },
  "vega.com":      { name:"Vega",      tagline:"Project tools for mid-market", color:"#7C3AED" },
  "cadence.app":   { name:"Cadence",   tagline:"Workflow automation in Slack", color:"#DA552F" }
};
const SOCIAL_DEFS = [
  { kind:"Website",  icon:"Globe02Icon",    fmt:(d,h)=> d },
  { kind:"X",        icon:"NewTwitterIcon",  fmt:(d,h)=> "@"+h },
  { kind:"LinkedIn", icon:"Linkedin01Icon",  fmt:(d,h)=> "/company/"+h },
  { kind:"Instagram",icon:"InstagramIcon",   fmt:(d,h)=> "@"+h }
];
function enrichFromWebsite(url){
  const d = domainFrom(url);
  const known = KNOWN[d];
  const name = known ? known.name : nameFromDomain(d);
  const handle = name.toLowerCase().replace(/[^a-z0-9]/g,"");
  const initials = name.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  // generic companies surface the 3 most common channels; known ones add Instagram
  const defs = known ? SOCIAL_DEFS : SOCIAL_DEFS.slice(0,3);
  return {
    name, domain:d,
    tagline: known ? known.tagline : "",
    color: known ? known.color : "#15171A",
    initials,
    socials: defs.map(s=> ({ kind:s.kind, icon:s.icon, value:s.fmt(d,handle), on:true }))
  };
}

/* ---------- website lookup field (with simulated "finding…") ---------- */
function WebsiteLookup({ placeholder, cta, onFound, busyLabel }) {
  const [val, setVal] = useStateM("");
  const [busy, setBusy] = useStateM(false);
  const ref = useRefM(null);
  function run(){
    const d = domainFrom(val);
    if(!d || !d.includes(".")) { if(ref.current){ ref.current.focus(); } return; }
    setBusy(true);
    setTimeout(()=>{ setBusy(false); setVal(""); onFound(enrichFromWebsite(val)); }, 950);
  }
  return (
    <div className="lookup">
      <div className="lookup-field">
        <Icon name="Globe02Icon" size={17} stroke={1.7} />
        <span className="lookup-proto">https://</span>
        <input ref={ref} value={val} disabled={busy} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") run(); }} placeholder={placeholder} autoFocus />
      </div>
      <button className="btn btn-accent lookup-btn" onClick={run} disabled={busy}>
        {busy ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin"/>{busyLabel||"Finding…"}</> : cta}
      </button>
    </div>
  );
}

/* ---------- detected company card (editable socials) ---------- */
function CompanyCard({ data, onChange, onRemove, compact }) {
  function toggle(i){ const s=data.socials.map((x,j)=> j===i? {...x, on:!x.on}:x); onChange({...data, socials:s}); }
  function edit(i,v){ const s=data.socials.map((x,j)=> j===i? {...x, value:v}:x); onChange({...data, socials:s}); }
  return (
    <div className={"co-card " + (compact?"compact":"")}>
      <div className="co-head">
        <span className="co-logo" style={{ background:data.color }}>{data.initials}</span>
        <span className="co-meta">
          <span className="co-name">{data.name}</span>
          <span className="co-domain">{data.domain}{data.tagline? " · "+data.tagline : ""}</span>
        </span>
        {onRemove && <button className="co-remove" onClick={onRemove} aria-label="Remove"><Icon name="Delete02Icon" size={16} stroke={1.7}/></button>}
      </div>
      <div className="co-socials">
        {data.socials.map((s,i)=>(
          <div className={"co-social " + (s.on?"on":"off")} key={i}>
            <span className="co-social-ic"><Icon name={s.icon} size={15} stroke={1.7}/></span>
            <span className="co-social-kind">{s.kind}</span>
            <input className="co-social-val" value={s.value} onChange={e=>edit(i,e.target.value)} spellCheck="false" />
            <button className="co-social-toggle" onClick={()=>toggle(i)} title={s.on?"Tracking":"Off"}>
              <Icon name={s.on?"CheckmarkBadge01Icon":"Add01Icon"} size={16} stroke={1.7}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Add to watchlist (competitor = website-first, keyword = text) ---------- */
function AddWatchModal({ onClose, onAdd }) {
  const [type, setType] = useStateM("Competitor");
  const [val, setVal] = useStateM("");
  const [found, setFound] = useStateM(null);
  function submitKeyword(){ const l=val.trim(); if(!l) return; onAdd(l, "Keyword"); onClose(); }
  function confirmCompetitor(){ if(!found) return; onAdd(found.name, "Competitor", found); onClose(); }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>Add to watchlist</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="Cancel01Icon" size={18} stroke={1.8}/></button>
        </div>
        <div className="modal-body">
          <div className="seg seg-modal">
            <button className={"seg-btn " + (type==="Competitor"?"on":"")} onClick={()=>{setType("Competitor");}}>Competitor</button>
            <button className={"seg-btn " + (type==="Keyword"?"on":"")} onClick={()=>{setType("Keyword");}}>Keyword</button>
          </div>
          {type==="Competitor" ? (
            found ? (
              <>
                <p className="modal-hint" style={{marginBottom:0}}>Here's what we found. Edit anything, then add.</p>
                <CompanyCard data={found} onChange={setFound} onRemove={()=>setFound(null)} compact />
              </>
            ) : (
              <>
                <WebsiteLookup placeholder="competitor.com" cta="Find" onFound={setFound} />
                <p className="modal-hint">Just paste the competitor's website. Issuefy finds their profiles and channels to monitor automatically.</p>
              </>
            )
          ) : (
            <>
              <input className="modal-input" autoFocus value={val} onChange={e=>setVal(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") submitKeyword(); }} placeholder="e.g. usage-based pricing" />
              <p className="modal-hint">Issuefy will track this theme across news, forums, reviews and social — and fold it into tomorrow's brief.</p>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {type==="Competitor"
            ? <button className="btn btn-accent" onClick={confirmCompetitor} disabled={!found}>Add competitor</button>
            : <button className="btn btn-accent" onClick={submitKeyword}>Add keyword</button>}
        </div>
      </div>
    </div>
  );
}

/* chip input for keywords step */
function ChipInput({ items, setItems, suggestions, placeholder }) {
  const [val, setVal] = useStateM("");
  function add(label){ const l=(label||"").trim(); if(!l) return; if(!items.includes(l)) setItems([...items, l]); setVal(""); }
  function remove(l){ setItems(items.filter(x=>x!==l)); }
  const rest = suggestions.filter(s=> !items.includes(s));
  return (
    <div className="chipin">
      <div className="chipin-field">
        {items.map(it=>(
          <span className="chip-tok" key={it}>{it}<button onClick={()=>remove(it)} aria-label="Remove"><Icon name="Cancel01Icon" size={12} stroke={2.2}/></button></span>
        ))}
        <input value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); add(val); } }}
          placeholder={items.length? "Add another…" : placeholder} />
      </div>
      {rest.length>0 && (
        <div className="chipin-sugg">
          <span className="chipin-sugg-l">Suggested</span>
          {rest.map(s=>(
            <button className="sugg-chip" key={s} onClick={()=>add(s)}><Icon name="Add01Icon" size={12} stroke={2.2}/>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- first-run onboarding ----------
   welcome → your company (website→socials) → competitors (website→socials) → keywords → done */
function Onboarding({ userName, defaultCompany, onClose, onComplete }) {
  const [step, setStep] = useStateM(0);
  const [me, setMe] = useStateM(null);            // my company {name,domain,socials,…}
  const [competitors, setCompetitors] = useStateM([]); // [{name,domain,socials,…}]
  const [keywords, setKeywords] = useStateM([]);
  const STEPS = ["Welcome","Your company","Competitors","Keywords","Done"];
  const N = STEPS.length;
  const first = (userName||"").split(" ")[0];

  function addCompetitor(d){ setCompetitors(prev=> prev.some(c=>c.domain===d.domain)? prev : [...prev, d]); }
  function updateCompetitor(i,d){ setCompetitors(prev=> prev.map((c,j)=> j===i?d:c)); }
  function removeCompetitor(i){ setCompetitors(prev=> prev.filter((_,j)=> j!==i)); }
  function finish(){ onComplete({ me, competitors, keywords }); onClose(); }

  const canNext = step!==1 || !!me;  // must confirm a company before leaving step 1

  return (
    <div className="modal-overlay onb-overlay">
      <div className="modal onb" onClick={e=>e.stopPropagation()}>
        <div className="onb-top">
          <div className="onb-dots">{STEPS.map((_,i)=> <span key={i} className={"onb-dot " + (i<=step?"on":"")}></span>)}</div>
          <button className="modal-x" onClick={onClose} aria-label="Skip">Skip</button>
        </div>
        <div className="onb-body">
          {step===0 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="SparklesIcon" size={34} stroke={1.5}/></div>
              <h2>Welcome to Issuefy{first?`, ${first}`:""}.</h2>
              <p>Every morning, Issuefy reads the market for you — competitors, customer signals and risks — and hands you one short, sourced brief. Let's set up what to watch. It takes about a minute.</p>
            </div>
          )}

          {step===1 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 1 · Your company</span>
              <h2>First, what's your company?</h2>
              <p>We track your company too — so opportunities and risks are judged against <i>you</i>, not in a vacuum. Paste your website and we'll pull in your profiles.</p>
              {me ? (
                <>
                  <CompanyCard data={me} onChange={setMe} onRemove={()=>setMe(null)} />
                  <p className="onb-confirm"><Icon name="CheckmarkBadge01Icon" size={15} stroke={1.7} color="#1A8A5C"/> Looks right? Edit anything above, or continue.</p>
                </>
              ) : (
                <WebsiteLookup placeholder="yourcompany.com" cta="Find my company" busyLabel="Looking up…" onFound={setMe} />
              )}
            </div>
          )}

          {step===2 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 2 · Competitors</span>
              <h2>Who do you want to watch?</h2>
              <p>Just paste a competitor's website — Issuefy finds their channels for you. Add as many as you like.</p>
              <WebsiteLookup placeholder="competitor.com" cta="Find" onFound={addCompetitor} />
              <div className="onb-list">
                {competitors.length===0 && <div className="onb-empty">No competitors yet. Try <b>northwind.io</b> or <b>vega.com</b>.</div>}
                {competitors.map((c,i)=>(
                  <CompanyCard key={c.domain} data={c} onChange={d=>updateCompetitor(i,d)} onRemove={()=>removeCompetitor(i)} compact />
                ))}
              </div>
            </div>
          )}

          {step===3 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 3 · Keywords</span>
              <h2>Any topics to follow?</h2>
              <p>Add themes to track across the whole market, not just one company. Optional — you can skip this.</p>
              <ChipInput items={keywords} setItems={setKeywords} suggestions={["usage-based pricing","onboarding","funding","consolidation"]} placeholder="Type a keyword, press Enter" />
            </div>
          )}

          {step===4 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="CheckmarkBadge01Icon" size={34} stroke={1.5}/></div>
              <h2>You're all set.</h2>
              <p>Tracking <b>{me?me.name:"your company"}</b>, <b>{competitors.length}</b> competitor{competitors.length===1?"":"s"} and <b>{keywords.length}</b> keyword{keywords.length===1?"":"s"}. Your first brief lands tomorrow at <b>7:00 AM</b> — and you can change or remove anything from your watchlist anytime.</p>
            </div>
          )}
        </div>
        <div className="onb-foot">
          {step>0 ? <button className="btn btn-ghost" onClick={()=>setStep(step-1)}>Back</button> : <span className="onb-spacer"></span>}
          {step < N-1
            ? <button className="btn btn-accent" disabled={!canNext} onClick={()=>setStep(step+1)}>{step===3 && keywords.length===0 ? "Skip for now" : "Continue"}<Icon name="ArrowRight01Icon" size={16} stroke={2}/></button>
            : <button className="btn btn-accent" onClick={finish}>Open my dashboard<Icon name="ArrowRight01Icon" size={16} stroke={2}/></button>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChipInput, AddWatchModal, Onboarding, CompanyCard, WebsiteLookup, enrichFromWebsite, domainFrom });
