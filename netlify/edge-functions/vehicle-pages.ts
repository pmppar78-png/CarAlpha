import type { Context, Config } from "@netlify/edge-functions";
import DATA from "./vehicle-data.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MakeData { name: string; type: string; country: string }
interface ModelData { name: string; bodyType: string; makeName: string; makeSlug: string; yearStart: number; yearEnd: number | null }
interface ModelYearData { name: string; makeName: string; bodyType: string }
interface StateData { name: string; abbreviation: string; region: string; insuranceMinimum: string; averageInsuranceCost: number; hasLemonLaw: boolean; evIncentives: boolean }

const makes = DATA.makes as Record<string, MakeData>;
const models = DATA.models as Record<string, ModelData>;
const modelYears = DATA.modelYears as Record<string, ModelYearData>;
const states = DATA.states as Record<string, StateData>;
const modelsByMake = DATA.modelsByMake as Record<string, string[]>;
const yearsByModel = DATA.yearsByModel as Record<string, number[]>;
const statesByRegion = DATA.statesByRegion as Record<string, string[]>;

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------
type PageType = "modelYearState" | "modelState" | "makeState";

interface RouteParams {
  type: PageType;
  makeSlug: string;
  modelSlug?: string;
  year?: number;
  stateSlug: string;
}

function parseRoute(pathname: string): RouteParams | null {
  const clean = pathname.replace(/\/+$/, "");

  // /makes/:make/:model/:year/in/:state
  let m = clean.match(/^\/makes\/([^/]+)\/([^/]+)\/(\d{4})\/in\/([^/]+)$/);
  if (m) return { type: "modelYearState", makeSlug: m[1], modelSlug: m[2], year: Number(m[3]), stateSlug: m[4] };

  // /makes/:make/:model/in/:state
  m = clean.match(/^\/makes\/([^/]+)\/([^/]+)\/in\/([^/]+)$/);
  if (m) return { type: "modelState", makeSlug: m[1], modelSlug: m[2], stateSlug: m[3] };

  // /makes/:make/in/:state
  m = clean.match(/^\/makes\/([^/]+)\/in\/([^/]+)$/);
  if (m) return { type: "makeState", makeSlug: m[1], stateSlug: m[2] };

  return null;
}

// ---------------------------------------------------------------------------
// Data lookup helpers
// ---------------------------------------------------------------------------
function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function getRegionStates(region: string, excludeSlug: string): { slug: string; name: string; abbreviation: string }[] {
  const slugs = statesByRegion[region] || [];
  return slugs
    .filter(s => s !== excludeSlug)
    .map(s => ({ slug: s, name: states[s]?.name || s, abbreviation: states[s]?.abbreviation || "" }));
}

function getOtherModels(makeSlug: string, excludeModelSlug?: string): { slug: string; name: string; bodyType: string }[] {
  const slugs = modelsByMake[makeSlug] || [];
  return slugs
    .filter(s => s !== excludeModelSlug)
    .map(s => {
      const md = models[`${makeSlug}/${s}`];
      return { slug: s, name: md?.name || s, bodyType: md?.bodyType || "" };
    });
}

function getOtherYears(makeSlug: string, modelSlug: string, excludeYear?: number): number[] {
  const yrs = yearsByModel[`${makeSlug}/${modelSlug}`] || [];
  return excludeYear ? yrs.filter(y => y !== excludeYear) : yrs;
}

// ---------------------------------------------------------------------------
// Shared layout shell
// ---------------------------------------------------------------------------
function layoutShell(title: string, description: string, canonicalPath: string, bodyContent: string): string {
  const canonicalUrl = `https://www.caralpha.com${canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${e(title)}" />
  <meta property="og:description" content="${e(description)}" />
  <meta property="og:image" content="https://www.caralpha.com/assets/images/og-default.jpg" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Car Alpha" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${e(title)}" />
  <meta name="twitter:description" content="${e(description)}" />
  <meta name="twitter:image" content="https://www.caralpha.com/assets/images/og-default.jpg" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            carbon: { 50:'#f6f7f8', 100:'#ebedf0', 200:'#d3d7de', 300:'#b0b8c4', 400:'#8692a3', 500:'#647080', 600:'#4a5568', 700:'#1e2530', 800:'#13181f', 900:'#0d1117', 950:'#080b0f' },
            volt: { 300:'#67e8f9', 400:'#22d3ee', 500:'#06b6d4', 600:'#0891b2', 700:'#0e7490' },
            silver: { 300:'#c0c7d0', 400:'#a0aab8', 500:'#7e8a9a' },
            steel: { 400:'#94a3b8', 500:'#64748b' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .carbon-bg { background-color: #0a0d12; }
    .glass-dark { backdrop-filter: blur(20px) saturate(1.6); background: rgba(10,13,18,0.88); border-bottom: 1px solid rgba(6,182,212,0.08); }
    .glass-card { backdrop-filter: blur(16px); background: linear-gradient(135deg, rgba(19,24,31,0.85) 0%, rgba(13,17,23,0.9) 100%); border: 1px solid rgba(6,182,212,0.1); }
    .metallic-border { position: relative; border: 1px solid transparent; background-clip: padding-box; }
    .metallic-border::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(6,182,212,0.3) 0%, rgba(148,163,184,0.15) 30%, rgba(6,182,212,0.2) 50%, rgba(148,163,184,0.1) 70%, rgba(6,182,212,0.25) 100%); z-index: -1; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; padding: 1px; }
    .glow-cyan-sm { box-shadow: 0 0 20px rgba(6,182,212,0.1), 0 4px 16px rgba(0,0,0,0.3); }
    .gradient-mesh { background: radial-gradient(ellipse 90% 50% at 50% -20%, rgba(6,182,212,0.1) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 85% 50%, rgba(6,182,212,0.05) 0%, transparent 50%); }
    .text-gradient { background: linear-gradient(135deg, #67e8f9 0%, #06b6d4 40%, #22d3ee 70%, #67e8f9 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .steel-header { background: linear-gradient(135deg, rgba(148,163,184,0.08) 0%, rgba(100,116,139,0.04) 50%, rgba(148,163,184,0.06) 100%); border-bottom: 1px solid rgba(148,163,184,0.08); }
    .carbon-panel { background-color: rgba(13,17,23,0.7); }
    .btn-primary { background: linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%); transition: all 0.3s; box-shadow: 0 4px 20px rgba(6,182,212,0.2), inset 0 1px 0 rgba(255,255,255,0.1); }
    .btn-primary:hover { background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%); box-shadow: 0 0 36px rgba(6,182,212,0.35), 0 8px 24px rgba(0,0,0,0.3); transform: translateY(-2px); }
    .btn-ghost { border: 1px solid rgba(6,182,212,0.2); background: rgba(6,182,212,0.04); transition: all 0.25s; }
    .btn-ghost:hover { border-color: rgba(6,182,212,0.45); background: rgba(6,182,212,0.1); }
    .card-hover { transition: all 0.3s; }
    .card-hover:hover { border-color: rgba(6,182,212,0.35); transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 24px rgba(6,182,212,0.08); }
    .feature-icon { background: linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.04) 100%); border: 1px solid rgba(6,182,212,0.15); }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(6,182,212,0.12), rgba(148,163,184,0.08), rgba(6,182,212,0.12), transparent); }
    .header-line { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(6,182,212,0.3), rgba(6,182,212,0.6), rgba(6,182,212,0.3), transparent); }
    .input-premium { background: rgba(10,13,18,0.7); border: 1px solid rgba(6,182,212,0.15); transition: all 0.3s; }
    .input-premium:focus { border-color: rgba(6,182,212,0.6); box-shadow: 0 0 0 3px rgba(6,182,212,0.15), 0 0 30px rgba(6,182,212,0.18); outline: none; }
    .vin-card { position: relative; }
    .vin-card::before { content: ''; position: absolute; inset: -2px; border-radius: 1.1rem; background: linear-gradient(135deg, rgba(6,182,212,0.4) 0%, rgba(148,163,184,0.1) 25%, rgba(6,182,212,0.3) 50%, rgba(148,163,184,0.1) 75%, rgba(6,182,212,0.35) 100%); z-index: -1; }
    .glow-cyan { box-shadow: 0 0 40px rgba(6,182,212,0.15), 0 0 80px rgba(6,182,212,0.06), 0 8px 32px rgba(0,0,0,0.4); }
    .ai-btn-glow { animation: ai-pulse 3s ease-in-out infinite; border: 1px solid rgba(6,182,212,0.3); }
    @keyframes ai-pulse { 0%, 100% { box-shadow: 0 0 24px rgba(6,182,212,0.25), 0 4px 16px rgba(0,0,0,0.3); } 50% { box-shadow: 0 0 40px rgba(6,182,212,0.4), 0 4px 16px rgba(0,0,0,0.3); } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .animate-in { animation: fadeInUp 0.6s ease forwards; }
  </style>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Car Alpha","url":"https://www.caralpha.com","logo":{"@type":"ImageObject","url":"https://www.caralpha.com/assets/images/logo.png","width":512,"height":512},"description":"Automotive data intelligence platform providing free VIN decoding, recall alerts, and vehicle ownership guidance powered by official NHTSA data.","foundingDate":"2024","areaServed":"US","contactPoint":{"@type":"ContactPoint","contactType":"customer service","email":"info@caralpha.com","url":"https://www.caralpha.com/contact/"}}
  </script>
</head>
<body class="min-h-screen carbon-bg text-gray-200 antialiased">
  ${headerHTML()}
  <main id="main-content">
    ${bodyContent}
  </main>
  ${footerHTML()}
  <script>document.querySelectorAll('[data-year]').forEach(function(el){ el.textContent = new Date().getFullYear(); });</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Header partial
// ---------------------------------------------------------------------------
function headerHTML(): string {
  return `<header class="sticky top-0 z-50 glass-dark">
  <div class="header-line"></div>
  <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/" class="flex items-center gap-3 group">
      <div class="relative h-10 w-10 rounded-xl bg-gradient-to-br from-volt-500 to-volt-700 grid place-items-center text-white font-black text-lg shadow-lg shadow-volt-500/25">A<div class="absolute inset-0 rounded-xl ring-1 ring-white/15"></div></div>
      <div><div class="text-xl font-extrabold tracking-tight text-white">Car <span class="text-gradient">Alpha</span></div><div class="text-[10px] font-semibold text-steel-400 tracking-widest uppercase -mt-0.5">Vehicle Intelligence Platform</div></div>
    </a>
    <div class="flex items-center gap-3">
      <nav class="hidden md:flex items-center gap-5 text-sm font-medium text-silver-400 mr-4">
        <a href="/tools/vin-decoder/" class="hover:text-volt-400 transition-colors">VIN Decoder</a>
        <a href="/recalls/" class="hover:text-volt-400 transition-colors">Recalls</a>
        <a href="/makes/" class="hover:text-volt-400 transition-colors">Makes</a>
        <a href="/guides/" class="hover:text-volt-400 transition-colors">Guides</a>
        <a href="/states/" class="hover:text-volt-400 transition-colors">States</a>
        <a href="/blog/" class="hover:text-volt-400 transition-colors">Blog</a>
      </nav>
      <button id="openAI" class="group relative flex items-center gap-2.5 px-5 py-3 rounded-xl btn-primary ai-btn-glow text-white text-sm font-bold tracking-wide">
        <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg>
        <span class="text-sm font-bold">Ask Car Alpha AI</span>
      </button>
    </div>
  </div>
</header>`;
}

// ---------------------------------------------------------------------------
// Footer partial
// ---------------------------------------------------------------------------
function footerHTML(): string {
  return `<footer class="relative">
  <div class="divider"></div>
  <div class="max-w-6xl mx-auto px-4 py-16">
    <div class="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2.5 mb-4"><div class="h-9 w-9 rounded-xl bg-gradient-to-br from-volt-500 to-volt-700 grid place-items-center text-white text-sm font-black shadow-lg shadow-volt-500/20">A</div><div><div class="font-extrabold text-white tracking-tight">Car <span class="text-gradient">Alpha</span></div></div></a>
        <p class="text-sm text-silver-500 leading-relaxed mb-4">Consumer-first vehicle intelligence. Free VIN lookup, recall checks, and AI-powered guidance.</p>
        <div class="text-xs text-silver-500">&copy; <span data-year></span> Car Alpha.<br/>All rights reserved.</div>
      </div>
      <div><h4 class="text-xs font-bold text-silver-300 uppercase tracking-widest mb-4">Tools</h4><ul class="space-y-2.5 text-sm"><li><a href="/tools/vin-decoder/" class="text-silver-500 hover:text-volt-400 transition-colors">VIN Decoder</a></li><li><a href="/recalls/" class="text-silver-500 hover:text-volt-400 transition-colors">Recall Lookup</a></li><li><a href="/tools/compare/" class="text-silver-500 hover:text-volt-400 transition-colors">Compare Vehicles</a></li></ul></div>
      <div><h4 class="text-xs font-bold text-silver-300 uppercase tracking-widest mb-4">Resources</h4><ul class="space-y-2.5 text-sm"><li><a href="/guides/" class="text-silver-500 hover:text-volt-400 transition-colors">Buying Guides</a></li><li><a href="/learn/" class="text-silver-500 hover:text-volt-400 transition-colors">Learn</a></li><li><a href="/learn/how-vin-decoding-works/" class="text-silver-500 hover:text-volt-400 transition-colors">How VIN Decoding Works</a></li><li><a href="/blog/" class="text-silver-500 hover:text-volt-400 transition-colors">Blog</a></li><li><a href="/states/" class="text-silver-500 hover:text-volt-400 transition-colors">State Laws</a></li><li><a href="/makes/" class="text-silver-500 hover:text-volt-400 transition-colors">All Makes</a></li></ul></div>
      <div><h4 class="text-xs font-bold text-silver-300 uppercase tracking-widest mb-4">Legal</h4><ul class="space-y-2.5 text-sm"><li><a href="/privacy/" class="text-silver-500 hover:text-volt-400 transition-colors">Privacy Policy</a></li><li><a href="/terms/" class="text-silver-500 hover:text-volt-400 transition-colors">Terms of Service</a></li><li><a href="/disclaimer/" class="text-silver-500 hover:text-volt-400 transition-colors">Disclaimer</a></li><li><a href="/affiliate-disclosure/" class="text-silver-500 hover:text-volt-400 transition-colors">Affiliate Disclosure</a></li></ul></div>
      <div><h4 class="text-xs font-bold text-silver-300 uppercase tracking-widest mb-4">Company</h4><ul class="space-y-2.5 text-sm"><li><a href="/about/" class="text-silver-500 hover:text-volt-400 transition-colors">About Us</a></li><li><a href="/editorial-standards/" class="text-silver-500 hover:text-volt-400 transition-colors">Editorial Standards</a></li><li><a href="/contact/" class="text-silver-500 hover:text-volt-400 transition-colors">Contact</a></li><li><a href="/sitemap.xml" class="text-silver-500 hover:text-volt-400 transition-colors">Sitemap</a></li></ul></div>
    </div>
    <div class="divider mb-8"></div>
    <div class="space-y-4">
      <p class="text-xs text-silver-500/60 leading-relaxed">Vehicle data sourced from NHTSA VPIC. Recall data from NHTSA Office of Defects Investigation. Car Alpha is an independent platform and is not affiliated with any automaker or government entity.</p>
      <p class="text-xs text-silver-500/60 leading-relaxed"><strong class="text-silver-500/80">Affiliate Disclosure:</strong> Car Alpha may earn a commission when you click on partner links. This comes at no additional cost to you.</p>
    </div>
  </div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Breadcrumb builder
// ---------------------------------------------------------------------------
function breadcrumbs(items: { label: string; url?: string }[]): string {
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.url ? { item: `https://www.caralpha.com${item.url}` } : {}),
    })),
  });
  let html = `<script type="application/ld+json">${schema}</script>\n<nav aria-label="Breadcrumb" class="mb-6"><ol class="flex flex-wrap items-center gap-1.5 text-sm text-silver-400">`;
  items.forEach((item, i) => {
    if (i === items.length - 1) {
      html += `<li class="text-volt-400 font-medium" aria-current="page">${e(item.label)}</li>`;
    } else {
      html += `<li><a href="${item.url}" class="hover:text-volt-400 transition-colors">${e(item.label)}</a></li>`;
      html += `<li aria-hidden="true"><svg class="w-3.5 h-3.5 text-silver-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></li>`;
    }
  });
  html += `</ol></nav>`;
  return html;
}

// ---------------------------------------------------------------------------
// VIN decoder script (shared across all page types)
// ---------------------------------------------------------------------------
function vinDecoderScript(): string {
  return `<script>
(function(){
  var vinInput=document.getElementById('vinInput'),runBtn=document.getElementById('runBtn'),loading=document.getElementById('loading'),errorBox=document.getElementById('errorBox'),errorText=document.getElementById('errorText'),vehicleCard=document.getElementById('vehicleCard'),recallCard=document.getElementById('recallCard');
  if(!vinInput||!runBtn)return;
  function setLoading(on){loading.classList.toggle('hidden',!on);}
  function setError(msg){if(!msg){errorBox.classList.add('hidden');return;}errorText.textContent=msg;errorBox.classList.remove('hidden');}
  function fetchJSON(url,ms){var c=new AbortController();var t=setTimeout(function(){c.abort();},ms||12000);return fetch(url,{signal:c.signal}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).finally(function(){clearTimeout(t);});}
  async function run(){
    setError();vehicleCard.classList.add('hidden');recallCard.classList.add('hidden');
    var vin=(vinInput.value||'').trim().toUpperCase();
    if(vin.length!==17){setError('Please enter a valid 17-character VIN.');return;}
    setLoading(true);
    try{
      var d=await fetchJSON('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+vin+'?format=json');
      var dec=(d.Results&&d.Results[0])||{};
      var f=[['Year',dec.ModelYear],['Make',dec.Make],['Model',dec.Model],['Trim',dec.Trim],['Engine',((dec.DisplacementL||'')+'L '+(dec.FuelTypePrimary||'')).trim()],['Body',dec.BodyClass],['Drive',dec.DriveType]].filter(function(x){return x[1]&&String(x[1]).trim()!=='';});
      vehicleCard.innerHTML='<div class="glass-card metallic-border rounded-2xl overflow-hidden glow-cyan-sm animate-in carbon-panel"><div class="steel-header px-6 py-4"><h3 class="text-lg font-bold text-white">Vehicle Specs</h3></div><div class="px-6 py-5"><div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3">'+f.map(function(x){return '<div class="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase">'+x[0]+'</div><div class="font-semibold text-white mt-0.5">'+x[1]+'</div></div>';}).join('')+'</div></div></div>';
      vehicleCard.classList.remove('hidden');
      try{var mk=encodeURIComponent(dec.Make||''),md=encodeURIComponent(dec.Model||''),yr=encodeURIComponent(dec.ModelYear||'');if(mk&&md&&yr){var r=await fetchJSON('https://api.nhtsa.gov/recalls/recallsByVehicle?make='+mk+'&model='+md+'&modelYear='+yr);var cnt=(r&&r.results)?r.results.length:0;recallCard.innerHTML='<div class="glass-card metallic-border rounded-2xl p-6 animate-in carbon-panel"><div class="flex items-center gap-2 '+(cnt>0?'text-amber-300':'text-emerald-400')+' text-sm font-bold">'+(cnt>0?cnt+' recall(s) found. <a href="/recall-checker/" class="underline ml-1">View details</a>':'No open recalls found.')+'</div></div>';recallCard.classList.remove('hidden');}}catch(e2){}
    }catch(e3){setError('Service unavailable. Try again shortly.');}finally{setLoading(false);}
  }
  runBtn.addEventListener('click',run);vinInput.addEventListener('keydown',function(ev){if(ev.key==='Enter')run();});
})();
</script>`;
}

// ---------------------------------------------------------------------------
// VIN decoder card HTML (shared)
// ---------------------------------------------------------------------------
function vinDecoderCard(label: string): string {
  return `<div class="mb-10">
  <h2 class="text-xl font-black text-white mb-6">Decode a ${e(label)} VIN</h2>
  <div class="vin-card glass-card rounded-2xl p-6 glow-cyan carbon-panel">
    <label class="block text-sm font-bold text-silver-300 mb-3 tracking-wide uppercase">Enter VIN</label>
    <div class="flex flex-col sm:flex-row gap-3">
      <input id="vinInput" maxlength="17" placeholder="Enter 17-character VIN" class="flex-1 px-5 py-4 rounded-xl input-premium text-white placeholder-silver-500 text-base font-mono tracking-wider" />
      <button id="runBtn" class="px-8 py-4 rounded-xl btn-primary text-white font-bold text-base whitespace-nowrap tracking-wide">Decode VIN</button>
    </div>
  </div>
  <section class="mt-6 space-y-5">
    <div class="hidden" id="loading"><div class="glass-card rounded-2xl p-6 text-center carbon-panel"><div class="inline-flex items-center gap-3 text-silver-300"><svg class="animate-spin w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Decoding...</div></div></div>
    <div class="hidden" id="errorBox"><div class="p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300" id="errorText"></div></div>
    <div class="hidden" id="vehicleCard"></div>
    <div class="hidden" id="recallCard"></div>
  </section>
</div>`;
}

// ---------------------------------------------------------------------------
// Tool links (shared)
// ---------------------------------------------------------------------------
function toolLinks(): string {
  return `<div class="grid sm:grid-cols-3 gap-4">
  <a href="/vin-decoder/" class="glass-card metallic-border rounded-xl p-5 card-hover carbon-panel group text-center"><div class="feature-icon w-10 h-10 rounded-xl grid place-items-center mx-auto mb-3"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z"/></svg></div><h3 class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">VIN Decoder</h3><p class="text-xs text-silver-500 mt-1">Decode any VIN instantly</p></a>
  <a href="/recall-checker/" class="glass-card metallic-border rounded-xl p-5 card-hover carbon-panel group text-center"><div class="feature-icon w-10 h-10 rounded-xl grid place-items-center mx-auto mb-3"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/></svg></div><h3 class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">Recall Checker</h3><p class="text-xs text-silver-500 mt-1">Check for open recalls</p></a>
  <a href="/compare/" class="glass-card metallic-border rounded-xl p-5 card-hover carbon-panel group text-center"><div class="feature-icon w-10 h-10 rounded-xl grid place-items-center mx-auto mb-3"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg></div><h3 class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">Compare Vehicles</h3><p class="text-xs text-silver-500 mt-1">Side-by-side comparison</p></a>
</div>`;
}

// ---------------------------------------------------------------------------
// Authority links (shared internal linking to pillar pages)
// ---------------------------------------------------------------------------
function authorityLinks(): string {
  return `<div class="mt-10 mb-10">
  <h2 class="text-lg font-bold text-white mb-4">VIN &amp; Vehicle Resources</h2>
  <div class="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
    <a href="/learn/how-vin-decoding-works/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group"><div class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">How VIN Decoding Works</div><div class="text-[10px] text-silver-500 mt-1">Technical deep dive into VIN standards</div></a>
    <a href="/about/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group"><div class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">About Car Alpha</div><div class="text-[10px] text-silver-500 mt-1">Our data sources &amp; mission</div></a>
    <a href="/editorial-standards/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group"><div class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">Editorial Standards</div><div class="text-[10px] text-silver-500 mt-1">Data accuracy &amp; methodology</div></a>
    <a href="/learn/what-is-a-vin/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group"><div class="font-bold text-white text-sm group-hover:text-volt-400 transition-colors">What is a VIN?</div><div class="text-[10px] text-silver-500 mt-1">Complete VIN guide for consumers</div></a>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// State ownership topics card (shared)
// ---------------------------------------------------------------------------
function stateOwnershipTopics(stateSlug: string, stateName: string, hasEvIncentives: boolean): string {
  return `<div class="mb-10">
  <h2 class="text-xl font-black text-white mb-6">${e(stateName)} Vehicle Ownership Topics</h2>
  <div class="grid sm:grid-cols-2 gap-4">
    <a href="/states/${stateSlug}/insurance/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><svg class="w-5 h-5 text-volt-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} Car Insurance</div><div class="text-xs text-silver-500 mt-1">Requirements, average costs, and tips to save</div></div></a>
    <a href="/states/${stateSlug}/lemon-law/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><svg class="w-5 h-5 text-volt-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75"/></svg><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} Lemon Law</div><div class="text-xs text-silver-500 mt-1">Your rights and how to file a claim</div></div></a>
    <a href="/states/${stateSlug}/registration/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><svg class="w-5 h-5 text-volt-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} Registration</div><div class="text-xs text-silver-500 mt-1">Fees, process, and required documents</div></div></a>
    ${hasEvIncentives ? `<a href="/states/${stateSlug}/ev-incentives/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><svg class="w-5 h-5 text-volt-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} EV Incentives</div><div class="text-xs text-silver-500 mt-1">State and federal credits for electric vehicles</div></div></a>` : ""}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// PAGE RENDERERS
// ---------------------------------------------------------------------------

function renderModelYearStatePage(params: RouteParams): string {
  const { makeSlug, modelSlug, year, stateSlug } = params;
  const myKey = `${makeSlug}/${modelSlug}/${year}`;
  const my = modelYears[myKey];
  const make = makes[makeSlug];
  const state = states[stateSlug];
  if (!my || !make || !state) return "";

  const modelName = my.name;
  const makeName = my.makeName;
  const bodyType = my.bodyType;
  const makeType = make.type;
  const stateName = state.name;
  const stateAbbr = state.abbreviation;
  const stateRegion = state.region;
  const insuranceMinimum = state.insuranceMinimum;
  const avgCost = state.averageInsuranceCost;
  const hasLemonLaw = state.hasLemonLaw;
  const evIncentives = state.evIncentives;
  const path = `/makes/${makeSlug}/${modelSlug}/${year}/in/${stateSlug}/`;
  const title = `${year} ${makeName} ${modelName} in ${stateName} — Insurance, Ownership & VIN Guide`;
  const description = `Complete ${year} ${makeName} ${modelName} ownership guide for ${stateName} (${stateAbbr}). Insurance requirements (${insuranceMinimum}), registration, lemon law, VIN decoder, and more.`;

  const otherYears = getOtherYears(makeSlug, modelSlug!, year);

  let insuranceContext = "";
  if (year! >= 2024) {
    insuranceContext = `As a ${year} model, the ${makeName} ${modelName} is a current or near-new vehicle. Newer model years typically have higher insurance premiums in ${stateName} due to higher replacement costs, but may also benefit from advanced safety features that qualify for discounts.`;
  } else if (year! >= 2018) {
    insuranceContext = `The ${year} ${makeName} ${modelName} falls in a sweet spot for insurance in ${stateName} — depreciation has lowered the vehicle value compared to new, while the car is still modern enough to have contemporary safety features. Compare quotes from multiple carriers.`;
  } else {
    insuranceContext = `As an older model year, the ${year} ${makeName} ${modelName} generally has lower insurance premiums in ${stateName}. You may want to evaluate whether comprehensive and collision coverage is cost-effective given the vehicle's current market value.`;
  }

  let lemonLawContent = "";
  if (hasLemonLaw) {
    const lemonText = year! >= 2024
      ? `${stateName} has a lemon law that protects buyers of new ${makeName} ${modelName} vehicles. If your ${year} ${modelName} has a substantial defect that the manufacturer cannot repair after a reasonable number of attempts, you may be entitled to a replacement vehicle or a full refund under ${stateName} law.`
      : `${stateName}'s lemon law primarily covers new vehicle purchases. If you purchased your ${year} ${makeName} ${modelName} new and experienced persistent defects early on, you may have had lemon law protections. For used ${year} ${modelName} purchases, check ${stateName}'s used car consumer protection laws and implied warranty rules.`;
    lemonLawContent = `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"/></svg></div><h2 class="font-bold text-white text-lg">${e(String(year))} ${e(modelName)} Lemon Law in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(lemonText)}</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/lemon-law/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} lemon law details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/lemon-law/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Talk to a lemon law attorney <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>`;
  }

  let evContent = "";
  if (evIncentives) {
    evContent = `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg></div><h2 class="font-bold text-white text-lg">${e(String(year))} ${e(modelName)} EV Incentives in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} offers incentives for electric and plug-in hybrid vehicles. If you're considering a ${year} electric or hybrid ${e(makeName)} ${e(modelName)}, you may qualify for state-level tax credits, rebates, or HOV lane access in addition to the federal EV tax credit of up to $7,500.</p><a href="/states/${stateSlug}/ev-incentives/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} EV incentive details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>`;
  }

  const body = `<section class="relative overflow-hidden"><div class="absolute inset-0 gradient-mesh"></div><div class="relative max-w-5xl mx-auto px-4 pt-12 pb-20">
${breadcrumbs([{ label: "Home", url: "/" }, { label: "Makes", url: "/makes/" }, { label: makeName, url: `/makes/${makeSlug}/` }, { label: modelName, url: `/makes/${makeSlug}/${modelSlug}/` }, { label: String(year), url: `/makes/${makeSlug}/${modelSlug}/${year}/` }, { label: stateName }])}
<div class="glass-card metallic-border rounded-2xl overflow-hidden glow-cyan-sm carbon-panel mb-10"><div class="steel-header px-8 py-5"><div class="flex items-center justify-between flex-wrap gap-4"><div><h1 class="text-3xl md:text-4xl font-black text-white"><span class="text-gradient">${year}</span> ${e(makeName)} ${e(modelName)} in <span class="text-gradient">${e(stateName)}</span></h1><div class="flex items-center gap-4 mt-2 text-sm text-silver-400"><span>${e(bodyType)}</span><span>&middot;</span><span>Model Year ${year}</span><span>&middot;</span><span>${e(stateAbbr)}</span><span>&middot;</span><span>${e(stateRegion)}</span></div></div><span class="px-4 py-2 rounded-xl bg-volt-600/10 border border-volt-500/20 text-volt-400 text-xs font-bold uppercase tracking-wider">${e(makeType)}</span></div></div><div class="px-8 py-6"><p class="text-silver-400 leading-relaxed">Everything ${e(stateName)} drivers need to know about owning a ${year} ${e(makeName)} ${e(modelName)} — from ${e(stateName)} insurance requirements and minimum coverage (${e(insuranceMinimum)}) to lemon law protections, registration fees, and VIN decoding.</p></div></div>
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg></div><h2 class="font-bold text-white text-lg">${year} ${e(modelName)} Insurance in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} requires minimum liability coverage of ${e(insuranceMinimum)} for all registered vehicles, including the ${year} ${e(makeName)} ${e(modelName)}.</p><div class="grid sm:grid-cols-3 gap-4"><div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Minimum Coverage</div><div class="font-bold text-white text-lg mt-1">${e(insuranceMinimum)}</div></div><div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">Model Year</div><div class="font-bold text-white text-lg mt-1">${year}</div></div>${avgCost > 1 ? `<div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Avg. Annual Cost</div><div class="font-bold text-white text-lg mt-1">$${fmt(avgCost)}</div></div>` : ""}</div><p class="text-silver-400 text-sm leading-relaxed">${e(insuranceContext)}</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/insurance/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} insurance guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Compare ${year} ${e(modelName)} rates in ${e(stateAbbr)} <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>
${lemonLawContent}${evContent}
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></div><h2 class="font-bold text-white text-lg">Registering a ${year} ${e(modelName)} in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">All ${e(makeName)} ${e(modelName)} vehicles driven in ${e(stateName)} must be registered with the state DMV.</p><a href="/states/${stateSlug}/registration/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} registration guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">Explore ${year} ${e(makeName)} ${e(modelName)}</h2><div class="grid sm:grid-cols-2 gap-4"><a href="/makes/${makeSlug}/${modelSlug}/${year}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${year} ${e(makeName)} ${e(modelName)}</div><div class="text-xs text-silver-500 mt-1">VIN decoder, specs, recalls for the ${year} model year</div></div></a><a href="/makes/${makeSlug}/${modelSlug}/in/${stateSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(modelName)} in ${e(stateName)}</div><div class="text-xs text-silver-500 mt-1">All-years ownership guide for ${e(stateAbbr)}</div></div></a><a href="/makes/${makeSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">All ${e(makeName)} Models</div><div class="text-xs text-silver-500 mt-1">Browse every ${e(makeName)} model, specs, and tools</div></div></a><a href="/states/${stateSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} Vehicle Guide</div><div class="text-xs text-silver-500 mt-1">Insurance, registration, lemon law, and more</div></div></a></div></div>
${vinDecoderCard(`${year} ${makeName} ${modelName}`)}
${stateOwnershipTopics(stateSlug, stateName, evIncentives)}
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">Other ${e(modelName)} Years in ${e(stateName)}</h2><div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">${otherYears.map(yr => `<a href="/makes/${makeSlug}/${modelSlug}/${yr}/in/${stateSlug}/" class="glass-card metallic-border rounded-lg p-2 card-hover carbon-panel group text-center"><div class="font-bold text-white group-hover:text-volt-400 transition-colors text-sm">${yr}</div></a>`).join("")}</div></div>
${toolLinks()}
${authorityLinks()}
<div class="mt-12 glass-card metallic-border rounded-2xl p-8 carbon-panel text-center"><h3 class="text-xl font-bold text-white mb-3">Compare ${year} ${e(modelName)} Insurance Rates in ${e(stateName)}</h3><p class="text-silver-400 mb-6 max-w-lg mx-auto">See how much you could save on ${year} ${e(makeName)} ${e(modelName)} insurance by comparing rates from top carriers in ${e(stateName)}.</p><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-primary text-white font-bold text-sm">Get Free ${year} ${e(modelName)} Insurance Quotes in ${e(stateAbbr)} <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a><p class="mt-3 text-[10px] text-silver-500/50">Affiliate link. We may earn a commission at no cost to you.</p></div>
</div></section>${vinDecoderScript()}`;

  return layoutShell(title, description, path, body);
}

function renderModelStatePage(params: RouteParams): string {
  const { makeSlug, modelSlug, stateSlug } = params;
  const modelKey = `${makeSlug}/${modelSlug}`;
  const md = models[modelKey];
  const make = makes[makeSlug];
  const state = states[stateSlug];
  if (!md || !make || !state) return "";

  const modelName = md.name;
  const makeName = md.makeName;
  const bodyType = md.bodyType;
  const makeType = make.type;
  const stateName = state.name;
  const stateAbbr = state.abbreviation;
  const stateRegion = state.region;
  const insuranceMinimum = state.insuranceMinimum;
  const avgCost = state.averageInsuranceCost;
  const hasLemonLaw = state.hasLemonLaw;
  const evIncentives = state.evIncentives;
  const path = `/makes/${makeSlug}/${modelSlug}/in/${stateSlug}/`;
  const title = `${makeName} ${modelName} in ${stateName} — Insurance, Ownership & VIN Guide`;
  const description = `Complete ${makeName} ${modelName} ownership guide for ${stateName} (${stateAbbr}). Insurance requirements (${insuranceMinimum}), registration, lemon law, VIN decoder, and more.`;

  const regionStates = getRegionStates(stateRegion, stateSlug);
  const otherModels = getOtherModels(makeSlug, modelSlug);

  let insuranceTypeText = "";
  if (makeType === "luxury") insuranceTypeText = `As a luxury vehicle, the ${makeName} ${modelName} typically carries higher insurance premiums in ${stateName} due to elevated repair costs, parts pricing, and vehicle value.`;
  else if (makeType === "performance") insuranceTypeText = `Performance vehicles like the ${makeName} ${modelName} often have higher insurance premiums in ${stateName} due to increased horsepower ratings and associated risk profiles.`;
  else if (makeType === "ev") insuranceTypeText = `Electric vehicles like the ${makeName} ${modelName} may qualify for insurance discounts in ${stateName} through select carriers.`;
  else insuranceTypeText = `The ${makeName} ${modelName} is classified as a ${bodyType.toLowerCase()} for insurance purposes in ${stateName}. Rates vary by year and trim — compare quotes from multiple carriers.`;

  const body = `<section class="relative overflow-hidden"><div class="absolute inset-0 gradient-mesh"></div><div class="relative max-w-5xl mx-auto px-4 pt-12 pb-20">
${breadcrumbs([{ label: "Home", url: "/" }, { label: "Makes", url: "/makes/" }, { label: makeName, url: `/makes/${makeSlug}/` }, { label: modelName, url: `/makes/${makeSlug}/${modelSlug}/` }, { label: stateName }])}
<div class="glass-card metallic-border rounded-2xl overflow-hidden glow-cyan-sm carbon-panel mb-10"><div class="steel-header px-8 py-5"><div class="flex items-center justify-between flex-wrap gap-4"><div><h1 class="text-3xl md:text-4xl font-black text-white">${e(makeName)} ${e(modelName)} in <span class="text-gradient">${e(stateName)}</span></h1><div class="flex items-center gap-4 mt-2 text-sm text-silver-400"><span>${e(bodyType)}</span><span>&middot;</span><span>${e(stateAbbr)}</span><span>&middot;</span><span>${e(stateRegion)}</span></div></div><span class="px-4 py-2 rounded-xl bg-volt-600/10 border border-volt-500/20 text-volt-400 text-xs font-bold uppercase tracking-wider">${e(makeType)}</span></div></div><div class="px-8 py-6"><p class="text-silver-400 leading-relaxed">Everything ${e(stateName)} drivers need to know about owning a ${e(makeName)} ${e(modelName)} — from insurance requirements and minimum coverage (${e(insuranceMinimum)}) to lemon law protections, registration fees, and VIN decoding.</p></div></div>
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg></div><h2 class="font-bold text-white text-lg">${e(modelName)} Insurance in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} requires minimum liability coverage of ${e(insuranceMinimum)} for all registered vehicles, including the ${e(makeName)} ${e(modelName)}.</p><div class="grid sm:grid-cols-2 gap-4"><div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Minimum Coverage</div><div class="font-bold text-white text-lg mt-1">${e(insuranceMinimum)}</div></div>${avgCost > 1 ? `<div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Avg. Annual Cost</div><div class="font-bold text-white text-lg mt-1">$${fmt(avgCost)}</div></div>` : ""}</div><p class="text-silver-400 text-sm leading-relaxed">${e(insuranceTypeText)}</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/insurance/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} insurance guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Compare ${e(modelName)} rates in ${e(stateAbbr)} <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>
${hasLemonLaw ? `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"/></svg></div><h2 class="font-bold text-white text-lg">${e(modelName)} Lemon Law in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} has a lemon law that protects buyers of new ${e(makeName)} ${e(modelName)} vehicles.</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/lemon-law/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} lemon law details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/lemon-law/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Talk to a lemon law attorney <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>` : ""}
${evIncentives ? `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg></div><h2 class="font-bold text-white text-lg">${e(modelName)} EV Incentives in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} offers incentives for electric and plug-in hybrid vehicles.</p><a href="/states/${stateSlug}/ev-incentives/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} EV incentive details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>` : ""}
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></div><h2 class="font-bold text-white text-lg">Registering a ${e(modelName)} in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">All ${e(makeName)} ${e(modelName)} vehicles driven in ${e(stateName)} must be registered with the state DMV.</p><a href="/states/${stateSlug}/registration/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} registration guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">Explore ${e(makeName)} ${e(modelName)}</h2><div class="grid sm:grid-cols-2 gap-4"><a href="/makes/${makeSlug}/${modelSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(makeName)} ${e(modelName)}</div><div class="text-xs text-silver-500 mt-1">VIN decoder, specs, recalls, and year-by-year details</div></div></a><a href="/makes/${makeSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">All ${e(makeName)} Models</div><div class="text-xs text-silver-500 mt-1">Browse every ${e(makeName)} model, specs, and tools</div></div></a><a href="/states/${stateSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(stateName)} Vehicle Guide</div><div class="text-xs text-silver-500 mt-1">Insurance, registration, lemon law, and more</div></div></a><a href="/makes/${makeSlug}/in/${stateSlug}/" class="glass-card metallic-border rounded-2xl p-5 carbon-panel card-hover flex items-start gap-3 group"><div><div class="font-bold text-white group-hover:text-volt-400 transition-colors">${e(makeName)} in ${e(stateName)}</div><div class="text-xs text-silver-500 mt-1">All ${e(makeName)} models ownership guide for ${e(stateAbbr)}</div></div></a></div></div>
${vinDecoderCard(`${makeName} ${modelName}`)}
${stateOwnershipTopics(stateSlug, stateName, evIncentives)}
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">${e(modelName)} in Nearby States</h2><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">${regionStates.map(s => `<a href="/makes/${makeSlug}/${modelSlug}/in/${s.slug}/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group text-center"><div class="font-bold text-white group-hover:text-volt-400 transition-colors text-sm">${e(s.name)}</div><div class="text-[10px] text-silver-500 mt-1">${e(s.abbreviation)}</div></a>`).join("")}</div></div>
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">Other ${e(makeName)} Models in ${e(stateName)}</h2><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">${otherModels.map(m => `<a href="/makes/${makeSlug}/${m.slug}/in/${stateSlug}/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group text-center"><div class="font-bold text-white group-hover:text-volt-400 transition-colors text-sm">${e(m.name)}</div><div class="text-[10px] text-silver-500 mt-1">${e(m.bodyType)}</div></a>`).join("")}</div></div>
${toolLinks()}
${authorityLinks()}
<div class="mt-12 glass-card metallic-border rounded-2xl p-8 carbon-panel text-center"><h3 class="text-xl font-bold text-white mb-3">Compare ${e(modelName)} Insurance Rates in ${e(stateName)}</h3><p class="text-silver-400 mb-6 max-w-lg mx-auto">See how much you could save on ${e(makeName)} ${e(modelName)} insurance by comparing rates from top carriers in ${e(stateName)}.</p><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-primary text-white font-bold text-sm">Get Free ${e(modelName)} Insurance Quotes in ${e(stateAbbr)} <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a><p class="mt-3 text-[10px] text-silver-500/50">Affiliate link. We may earn a commission at no cost to you.</p></div>
</div></section>${vinDecoderScript()}`;

  return layoutShell(title, description, path, body);
}

function renderMakeStatePage(params: RouteParams): string {
  const { makeSlug, stateSlug } = params;
  const make = makes[makeSlug];
  const state = states[stateSlug];
  if (!make || !state) return "";

  const makeName = make.name;
  const makeType = make.type;
  const makeCountry = make.country;
  const stateName = state.name;
  const stateAbbr = state.abbreviation;
  const stateRegion = state.region;
  const insuranceMinimum = state.insuranceMinimum;
  const avgCost = state.averageInsuranceCost;
  const hasLemonLaw = state.hasLemonLaw;
  const evIncentives = state.evIncentives;
  const path = `/makes/${makeSlug}/in/${stateSlug}/`;
  const title = `${makeName} in ${stateName} — Insurance, Dealers & Ownership Guide`;
  const description = `Complete ${makeName} ownership guide for ${stateName} (${stateAbbr}). Insurance requirements (${insuranceMinimum}), registration, lemon law rights, and more.`;

  const regionStates = getRegionStates(stateRegion, stateSlug);
  const makeModels = getOtherModels(makeSlug);

  let insuranceTypeText = "";
  if (makeType === "luxury") insuranceTypeText = `As a luxury brand, ${makeName} vehicles typically carry higher insurance premiums in ${stateName} due to elevated repair costs, parts pricing, and vehicle value.`;
  else if (makeType === "performance") insuranceTypeText = `Performance vehicles from ${makeName} often have higher insurance premiums in ${stateName} due to increased horsepower ratings and associated risk profiles.`;
  else if (makeType === "ev") insuranceTypeText = `Electric vehicles from ${makeName} may qualify for insurance discounts in ${stateName} through select carriers.`;
  else insuranceTypeText = `${makeName} vehicles are generally considered ${makeType} vehicles for insurance purposes in ${stateName}. Rates vary by model — compare quotes from multiple carriers.`;

  const body = `<section class="relative overflow-hidden"><div class="absolute inset-0 gradient-mesh"></div><div class="relative max-w-5xl mx-auto px-4 pt-12 pb-20">
${breadcrumbs([{ label: "Home", url: "/" }, { label: "Makes", url: "/makes/" }, { label: makeName, url: `/makes/${makeSlug}/` }, { label: stateName }])}
<div class="glass-card metallic-border rounded-2xl overflow-hidden glow-cyan-sm carbon-panel mb-10"><div class="steel-header px-8 py-5"><div class="flex items-center justify-between flex-wrap gap-4"><div><h1 class="text-3xl md:text-4xl font-black text-white">${e(makeName)} in <span class="text-gradient">${e(stateName)}</span></h1><div class="flex items-center gap-4 mt-2 text-sm text-silver-400"><span>${e(stateAbbr)}</span><span>&middot;</span><span>${e(stateRegion)}</span><span>&middot;</span><span>${e(makeCountry)}</span></div></div><span class="px-4 py-2 rounded-xl bg-volt-600/10 border border-volt-500/20 text-volt-400 text-xs font-bold uppercase tracking-wider">${e(makeType)}</span></div></div><div class="px-8 py-6"><p class="text-silver-400 leading-relaxed">Everything ${e(stateName)} drivers need to know about owning a ${e(makeName)} vehicle — from insurance requirements and minimum coverage (${e(insuranceMinimum)}) to lemon law protections, registration fees, and EV incentives.</p></div></div>
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg></div><h2 class="font-bold text-white text-lg">${e(makeName)} Insurance in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} requires minimum liability coverage of ${e(insuranceMinimum)} for all registered vehicles, including ${e(makeName)} models.</p><div class="grid sm:grid-cols-2 gap-4"><div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Minimum Coverage</div><div class="font-bold text-white text-lg mt-1">${e(insuranceMinimum)}</div></div>${avgCost > 1 ? `<div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${e(stateName)} Avg. Annual Cost</div><div class="font-bold text-white text-lg mt-1">$${fmt(avgCost)}</div></div>` : ""}</div><p class="text-silver-400 text-sm leading-relaxed">${e(insuranceTypeText)}</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/insurance/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} insurance guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Compare ${e(makeName)} rates in ${e(stateAbbr)} <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>
${hasLemonLaw ? `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"/></svg></div><h2 class="font-bold text-white text-lg">${e(makeName)} Lemon Law in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} has a lemon law that protects buyers of new ${e(makeName)} vehicles.</p><div class="flex flex-wrap gap-3 pt-2"><a href="/states/${stateSlug}/lemon-law/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} lemon law details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a><a href="/go/lemon-law/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-sm font-bold">Talk to a lemon law attorney <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a></div></div></div>` : ""}
${evIncentives ? `<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg></div><h2 class="font-bold text-white text-lg">${e(makeName)} EV Incentives in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">${e(stateName)} offers incentives for electric and plug-in hybrid vehicles.</p><a href="/states/${stateSlug}/ev-incentives/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} EV incentive details <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>` : ""}
<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4 flex items-center gap-3"><div class="feature-icon w-11 h-11 rounded-xl grid place-items-center"><svg class="w-5 h-5 text-volt-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></div><h2 class="font-bold text-white text-lg">Registering a ${e(makeName)} in ${e(stateName)}</h2></div><div class="px-6 py-5 space-y-4"><p class="text-silver-400 text-sm leading-relaxed">All ${e(makeName)} vehicles driven in ${e(stateName)} must be registered with the state DMV.</p><a href="/states/${stateSlug}/registration/" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-volt-400 text-sm font-medium">${e(stateName)} registration guide <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a></div></div>
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">Popular ${e(makeName)} Models in ${e(stateName)}</h2><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">${makeModels.map(m => `<a href="/makes/${makeSlug}/${m.slug}/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group text-center"><div class="font-bold text-white group-hover:text-volt-400 transition-colors text-sm">${e(m.name)}</div><div class="text-[10px] text-silver-500 mt-1">${e(m.bodyType)}</div></a>`).join("")}</div></div>
${stateOwnershipTopics(stateSlug, stateName, evIncentives)}
<div class="mb-10"><h2 class="text-xl font-black text-white mb-6">${e(makeName)} in Nearby States</h2><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">${regionStates.map(s => `<a href="/makes/${makeSlug}/in/${s.slug}/" class="glass-card metallic-border rounded-xl p-4 card-hover carbon-panel group text-center"><div class="font-bold text-white group-hover:text-volt-400 transition-colors text-sm">${e(s.name)}</div><div class="text-[10px] text-silver-500 mt-1">${e(s.abbreviation)}</div></a>`).join("")}</div></div>
${vinDecoderCard(makeName)}
${toolLinks()}
${authorityLinks()}
<div class="mt-12 glass-card metallic-border rounded-2xl p-8 carbon-panel text-center"><h3 class="text-xl font-bold text-white mb-3">Compare ${e(makeName)} Insurance Rates in ${e(stateName)}</h3><p class="text-silver-400 mb-6 max-w-lg mx-auto">See how much you could save on ${e(makeName)} insurance by comparing rates from top carriers in ${e(stateName)}.</p><a href="/go/insurance/" target="_blank" rel="nofollow sponsored noopener" class="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-primary text-white font-bold text-sm">Get Free ${e(makeName)} Insurance Quotes in ${e(stateAbbr)} <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a><p class="mt-3 text-[10px] text-silver-500/50">Affiliate link. We may earn a commission at no cost to you.</p></div>
</div></section>${vinDecoderScript()}`;

  return layoutShell(title, description, path, body);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const params = parseRoute(url.pathname);

  if (!params) {
    return new Response("Not Found", { status: 404 });
  }

  let html = "";
  switch (params.type) {
    case "modelYearState":
      html = renderModelYearStatePage(params);
      break;
    case "modelState":
      html = renderModelStatePage(params);
      break;
    case "makeState":
      html = renderMakeStatePage(params);
      break;
  }

  if (!html) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
};

export const config: Config = {
  path: [
    "/makes/*/in/*",
    "/makes/*/*/in/*",
    "/makes/*/*/*/in/*",
  ],
  cache: "manual",
};
