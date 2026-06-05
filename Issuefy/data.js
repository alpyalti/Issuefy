/* Issuefy — sample dashboard data (B2B SaaS persona: a flat-rate project-management tool).
   Exposed on window.ISSUEFY for the React app. */
(function(){
  const S = {
    techcrunch:  { name:"TechCrunch",       kind:"News",    color:"#168F6B", initials:"TC" },
    hn:          { name:"Hacker News",      kind:"Forum",   color:"#FF6600", initials:"Y"  },
    reddit:      { name:"r/SaaS",           kind:"Forum",   color:"#FF4500", initials:"R"  },
    g2:          { name:"G2 Reviews",       kind:"Reviews", color:"#E1523D", initials:"G2" },
    linkedin:    { name:"LinkedIn",         kind:"Social",  color:"#0A66C2", initials:"in" },
    crunchbase:  { name:"Crunchbase",       kind:"Data",    color:"#146AFF", initials:"cb" },
    theinfo:     { name:"The Information",  kind:"News",    color:"#111111", initials:"Ti" },
    producthunt: { name:"Product Hunt",     kind:"Launch",  color:"#DA552F", initials:"P"  },
    changelog:   { name:"Northwind blog",   kind:"Official",color:"#2D5BE3", initials:"N"  },
    glassdoor:   { name:"Glassdoor",        kind:"Reviews", color:"#0CAA41", initials:"G"  },
    gartner:     { name:"Gartner",          kind:"Analyst", color:"#00355E", initials:"Gr" },
    x:           { name:"X",                kind:"Social",  color:"#111111", initials:"X"  }
  };
  function src(key, headline, time){ const s=S[key]; return { ...s, key, headline, time, url:"#" }; }

  window.ISSUEFY = {
    user: { name:"Maya Chen", role:"Head of Strategy", company:"Tasklane", initials:"MC" },
    today: "Tuesday, June 4",
    generatedAt: "7:02 AM",
    summary: {
      count: 3,
      lead: "Three things this morning.",
      body: "Your closest competitor, **Northwind**, quietly shipped usage-based pricing overnight, and early Reddit reaction is split on the migration path. Two enterprise buyers flagged **onboarding friction** with incumbents as a churn reason on G2. And a $40M raise in adjacent infra tooling suggests budget is shifting toward **consolidation** this quarter.",
      moves: [
        "Counter-position your flat-rate pricing while Northwind's migration is contentious.",
        "Pull the onboarding complaints into this week's product review.",
        "Watch Vega's raise, which signals a mid-market push."
      ]
    },
    stats: [
      { label:"New signals", value:"12", icon:"FlashIcon", delta:"+4", tone:"mute" },
      { label:"Competitor moves", value:"3", icon:"Target01Icon", delta:"+2", tone:"info" },
      { label:"Opportunities", value:"5", icon:"BulbIcon", delta:"+1", tone:"pos" },
      { label:"Risks flagged", value:"2", icon:"Alert02Icon", delta:"+1", tone:"neg" }
    ],
    signals: [
      {
        id:"s1", category:"competitor", severity:"high", isNew:true, saved:false, hoursAgo:2,
        title:"Northwind launched usage-based pricing tiers aimed squarely at mid-market.",
        context:"Announced at 11pm ET with no migration tooling. Reddit sentiment is split: power users like the upside, smaller teams fear bill shock. A credible window to reinforce your flat-rate positioning.",
        tags:["Northwind","Pricing"],
        sources:[ src("changelog","Introducing usage-based plans","2h ago"), src("reddit","Northwind's new pricing is... a lot","3h ago"), src("techcrunch","Northwind moves to usage-based model","2h ago") ]
      },
      {
        id:"s2", category:"opportunity", severity:"high", isNew:true, saved:true, hoursAgo:5,
        title:"Buyers repeatedly cite onboarding friction with incumbents as a reason to switch.",
        context:"Four fresh G2 reviews and a LinkedIn thread name slow setup and confusing permissions. Your guided onboarding is a direct answer, worth a comparison page and an outbound sequence.",
        tags:["Onboarding","Churn"],
        sources:[ src("g2","'Took us 3 weeks to get going'","5h ago"), src("linkedin","Why we left our PM tool","6h ago"), src("g2","Permissions are a maze","8h ago"), src("reddit","Best onboarding PM tool?","9h ago") ]
      },
      {
        id:"s3", category:"threat", severity:"high", isNew:true, saved:false, hoursAgo:11,
        title:"Vega raised $40M Series B to push into the mid-market you're growing into.",
        context:"Led by a top-tier fund, with explicit language about 'moving upmarket.' Expect aggressive hiring and a louder marketing presence within two quarters.",
        tags:["Vega","Funding"],
        sources:[ src("crunchbase","Vega: Series B, $40M","11h ago"), src("theinfo","Vega's upmarket bet","12h ago"), src("linkedin","Vega is hiring 30 AEs","10h ago") ]
      },
      {
        id:"s4", category:"signal", severity:"med", isNew:false, saved:false, hoursAgo:26,
        title:"Demand for AI project summaries is spiking across founder communities.",
        context:"Mentions of 'auto status updates' and 'AI standups' are up sharply this month. Aligns with a feature you have in beta, so consider accelerating the public launch.",
        tags:["AI","Demand"],
        sources:[ src("hn","Show HN: AI standup bot","1d ago"), src("reddit","Anyone automating status updates?","1d ago"), src("producthunt","StandupAI","2d ago") ]
      },
      {
        id:"s5", category:"competitor", severity:"med", isNew:false, saved:false, hoursAgo:30,
        title:"Cadence shipped a Slack-native approvals flow, closing a gap you led on.",
        context:"Their changelog shows approvals now live inside Slack. Your differentiation here narrows; lean on your audit trail and roles depth instead.",
        tags:["Cadence","Feature"],
        sources:[ src("changelog","Approvals, now in Slack","1d ago"), src("x","Cadence approvals look slick","1d ago") ]
      },
      {
        id:"s6", category:"opportunity", severity:"med", isNew:false, saved:false, hoursAgo:28,
        title:"A mid-size agency segment is actively shopping for a flat-rate alternative.",
        context:"Several agency owners are asking for predictable per-seat pricing after surprise usage bills elsewhere. Your model is the punchline, and a targeted landing page could convert.",
        tags:["Agencies","ICP"],
        sources:[ src("reddit","Flat-rate PM tool for agencies?","1d ago"), src("linkedin","Done with usage billing","2d ago"), src("g2","Predictable pricing matters","2d ago") ]
      },
      {
        id:"s7", category:"threat", severity:"low", isNew:false, saved:false, hoursAgo:72,
        title:"Employee reviews hint Northwind is cutting support headcount.",
        context:"A handful of Glassdoor posts mention support layoffs. Likely to show up as slower response times, an angle for your 'real human support' messaging if it holds.",
        tags:["Northwind","Support"],
        sources:[ src("glassdoor","Support team downsized","3d ago"), src("reddit","Northwind support got slow","2d ago") ]
      },
      {
        id:"s8", category:"signal", severity:"low", isNew:false, saved:false, hoursAgo:96,
        title:"Analysts expect PM-tool consolidation as buyers cut redundant SaaS.",
        context:"Gartner commentary points to teams collapsing overlapping tools. Position your platform breadth as a way to consolidate, not add another seat.",
        tags:["Market","Consolidation"],
        sources:[ src("gartner","SaaS consolidation outlook","4d ago"), src("theinfo","The great SaaS cull","3d ago") ]
      }
    ]
  };

  // Recent sources rail = newest source items across all signals
  const all = [];
  window.ISSUEFY.signals.forEach(sig => sig.sources.forEach(s => all.push({ ...s, sigCat:sig.category })));
  window.ISSUEFY.recentSources = all.slice(0, 7);

  window.ISSUEFY.watchlist = [
    { label:"Northwind", type:"Competitor", live:true },
    { label:"Vega", type:"Competitor", live:true },
    { label:"Cadence", type:"Competitor", live:true },
    { label:"\"usage-based pricing\"", type:"Keyword", live:true },
    { label:"\"onboarding\"", type:"Keyword", live:false }
  ];
})();
