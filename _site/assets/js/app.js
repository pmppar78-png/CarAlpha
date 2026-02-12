/**
 * Car Alpha — Main Application JavaScript
 * VIN Decoder, Recall Checker, AI Chat, and Affiliate System
 */

// ==========================================
// AFFILIATE CONFIGURATION
// ==========================================
const AFFILIATES = {
  insurance: "/go/insurance/?ref={{REF}}&vin={{VIN}}",
  warranty: "/go/warranty/?ref={{REF}}&vin={{VIN}}",
  loans: "/go/loans/?ref={{REF}}&vin={{VIN}}",
  refinance: "/go/refinance/?ref={{REF}}&vin={{VIN}}",
  sell: "/go/sell/?ref={{REF}}&vin={{VIN}}",
  repair: "/go/repair/?ref={{REF}}&vin={{VIN}}",
  mechanics: "/go/mechanics/?ref={{REF}}&vin={{VIN}}",
  "lemon-law": "/go/lemon-law/?ref={{REF}}&state={{STATE}}",
  "ev-charger": "/go/ev-charger/?ref={{REF}}",
};

function affiliateUrl(key, opts = {}) {
  let url = AFFILIATES[key] || "#";
  url = url.replace("{{VIN}}", encodeURIComponent(opts.vin || ""));
  url = url.replace("{{REF}}", encodeURIComponent(opts.ref || window.location.pathname));
  url = url.replace("{{STATE}}", encodeURIComponent(opts.state || ""));
  return url;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

function fetchJSON(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .finally(() => clearTimeout(t));
}

function setLoading(on) {
  const el = qs("#loading");
  if (el) el.classList.toggle("hidden", !on);
}

function setError(msg) {
  const box = qs("#errorBox");
  const text = qs("#errorText");
  if (!box) return;
  if (!msg) { box.classList.add("hidden"); return; }
  if (text) text.textContent = msg;
  box.classList.remove("hidden");
}

// ==========================================
// VIN DECODER
// ==========================================
let vehicleContext = { vin: null, decoded: {}, recallCount: 0 };

async function runVIN() {
  const vinInput = qs("#vinInput");
  if (!vinInput) return;

  setError();
  const cards = ["#vehicleCard", "#recallCard", "#actionsCard"];
  cards.forEach((id) => { const el = qs(id); if (el) el.classList.add("hidden"); });

  const vin = (vinInput.value || "").trim().toUpperCase();
  if (vin.length !== 17) { setError("Please enter a valid 17-character VIN."); return; }
  if (/[IOQ]/.test(vin)) { setError("VINs cannot contain the letters I, O, or Q."); return; }

  setLoading(true);
  try {
    // Try serverless function first, fallback to direct NHTSA
    let decoded, recallCount = 0, recalls = [];

    try {
      const apiRes = await fetchJSON(`/api/vin-decode?vin=${vin}`);
      decoded = apiRes.vehicle || {};
      recalls = apiRes.recalls || [];
      recallCount = apiRes.recallCount || 0;
    } catch {
      // Fallback to direct NHTSA API
      const decodeUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`;
      const dRes = await fetchJSON(decodeUrl, 12000);
      decoded = (dRes.Results && dRes.Results[0]) || {};
      decoded.VIN = vin;

      try {
        const make = encodeURIComponent(decoded.Make || "");
        const model = encodeURIComponent(decoded.Model || "");
        const year = encodeURIComponent(decoded.ModelYear || "");
        if (make && model && year) {
          const rUrl = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`;
          const rRes = await fetchJSON(rUrl, 12000);
          if (rRes.results) {
            recalls = rRes.results;
            recallCount = rRes.results.length;
          }
        }
      } catch {}
    }

    renderVehicle(decoded);
    renderRecalls(recalls, recallCount);

    vehicleContext = { vin, decoded, recallCount };
    renderActions(vin, decoded, recallCount);

    // Notify AI chat
    const chat = qs("#chat");
    if (chat) {
      postBubble(chat, "ai", "Report ready. Ask me anything — insurance, warranty, repair risk, recalls, or resale value.");
    }
  } catch (e) {
    setError("Service is busy right now. Please try again shortly.");
  } finally {
    setLoading(false);
  }
}

function renderVehicle(data) {
  const card = qs("#vehicleCard");
  if (!card) return;

  const vin = data.VIN || data.vin || "";
  const fields = [
    ["Year", data.ModelYear],
    ["Make", data.Make],
    ["Model", data.Model],
    ["Trim", data.Trim],
    ["Engine", [data.DisplacementL ? data.DisplacementL + "L" : "", data.EngineConfiguration || "", data.FuelTypePrimary || ""].filter(Boolean).join(" ")],
    ["Body", data.BodyClass],
    ["Drive", data.DriveType],
    ["Transmission", data.TransmissionStyle || ""],
    ["Plant", [data.PlantCity, data.PlantCountry].filter(Boolean).join(", ")],
  ].filter(([, v]) => v && String(v).trim() !== "");

  card.innerHTML = `
    <div class="glass-card metallic-border rounded-2xl overflow-hidden glow-cyan-sm animate-in carbon-panel">
      <div class="steel-header px-6 py-4 flex items-center justify-between gap-4">
        <h3 class="text-lg font-bold text-white">Vehicle Specs</h3>
        <span class="text-xs px-3 py-1.5 rounded-lg bg-volt-600/10 border border-volt-500/20 text-volt-400 font-mono tracking-wide">VIN: ${vin}</span>
      </div>
      <div class="px-6 py-5">
        <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${fields.map(([k, v]) => `
            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">${k}</div>
              <div class="font-semibold text-white mt-0.5">${v}</div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
  card.classList.remove("hidden");
}

function renderRecalls(recalls, count) {
  const card = qs("#recallCard");
  if (!card) return;

  if (!recalls || !recalls.length) {
    card.innerHTML = `
      <div class="glass-card metallic-border rounded-2xl overflow-hidden animate-in carbon-panel">
        <div class="steel-header px-6 py-4"><h3 class="text-lg font-bold text-white">Recalls</h3></div>
        <div class="px-6 py-5">
          <div class="flex items-center gap-2 text-emerald-400 text-sm">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            No recalls found for the decoded make/model/year.
          </div>
        </div>
      </div>`;
    card.classList.remove("hidden");
    return;
  }

  const items = recalls.slice(0, 8).map((r) => {
    const component = r.Component || r.component || "Recall";
    const date = r.ReportReceivedDate || r.reportDate || "";
    const summary = r.Summary || r.summary || "—";
    const consequence = r.Conequence || r.Consequence || r.consequence || "—";
    const remedy = r.Remedy || r.remedy || "—";
    const campaign = r.NHTSACampaignNumber || r.campaignNumber || "—";
    return `
    <details class="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 group">
      <summary class="cursor-pointer font-semibold text-amber-300 flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
        ${component} — ${date}
      </summary>
      <div class="mt-3 text-sm text-silver-400 space-y-1.5 pl-6">
        <div><span class="font-semibold text-silver-300">Summary:</span> ${summary}</div>
        <div><span class="font-semibold text-silver-300">Consequence:</span> ${consequence}</div>
        <div><span class="font-semibold text-silver-300">Remedy:</span> ${remedy}</div>
        <div><span class="font-semibold text-silver-300">NHTSA #:</span> ${campaign}</div>
      </div>
    </details>`;
  }).join("");

  card.innerHTML = `
    <div class="glass-card metallic-border rounded-2xl overflow-hidden animate-in carbon-panel">
      <div class="steel-header px-6 py-4"><h3 class="text-lg font-bold text-white">Recalls <span class="text-amber-400 text-sm font-medium">(${count} found)</span></h3></div>
      <div class="px-6 py-5 space-y-3">${items}</div>
    </div>`;
  card.classList.remove("hidden");
}

function renderActions(vin, decoded, recallCount) {
  const card = qs("#actionsCard");
  if (!card) return;

  const actions = [
    { label: "Compare Insurance Rates", key: "insurance", desc: "See top carriers for this vehicle.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>' },
    { label: "Check Warranty Options", key: "warranty", desc: "Protection for costly repairs.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>' },
    { label: "Get Loan/Refi Offers", key: "loans", desc: "Lower payments or finance smart.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/>' },
    { label: "Sell or Get Instant Offer", key: "sell", desc: "See what you could get right now.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z"/>' },
    { label: "Find Repair Estimates", key: "repair", desc: "Fair prices from trusted mechanics.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17l-5.1-5.1m0 0l2.12-2.12M6.32 10.07L2.25 14.14M21.75 12a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0z"/>' },
    { label: "Lemon Law Help", key: "lemon-law", desc: "If repairs pile up, know your rights.", icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"/>' },
  ];

  card.innerHTML = `
    <div class="glass-card metallic-border rounded-2xl overflow-hidden animate-in carbon-panel">
      <div class="steel-header px-6 py-4"><h3 class="text-lg font-bold text-white">Recommended Next Steps</h3></div>
      <div class="px-6 py-5">
        <div class="grid sm:grid-cols-2 gap-3">
          ${actions.map((a) => `
            <a target="_blank" rel="nofollow sponsored noopener" href="${affiliateUrl(a.key, { vin })}"
               class="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-volt-500/30 hover:bg-volt-600/[0.04] transition-all group">
              <svg class="w-5 h-5 text-volt-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">${a.icon}</svg>
              <div>
                <div class="font-semibold text-white text-sm group-hover:text-volt-400 transition-colors">${a.label}</div>
                <div class="text-xs text-silver-500 mt-0.5">${a.desc}</div>
              </div>
            </a>`).join("")}
        </div>
        <p class="mt-4 text-[11px] text-silver-500/50">Affiliate disclosure: We may earn when you click a partner link — at no cost to you.</p>
      </div>
    </div>`;
  card.classList.remove("hidden");
}

// ==========================================
// AI CHAT
// ==========================================
let chatHistory = [];

function postBubble(container, role, html) {
  if (!container) return;
  const isAI = role === "ai";
  const wrap = document.createElement("div");
  wrap.className = "flex items-start gap-3 animate-in";
  wrap.innerHTML = isAI
    ? `<div class="shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-volt-500 to-volt-700 text-white grid place-items-center text-[10px] font-bold shadow-md shadow-volt-500/20">AI</div>
       <div class="p-3.5 rounded-2xl rounded-tl-md bg-white/[0.04] border border-white/[0.06] text-silver-300 leading-relaxed max-w-[85%]">${html}</div>`
    : `<div class="ml-auto p-3.5 rounded-2xl rounded-tr-md bg-volt-600/20 border border-volt-500/20 text-volt-200 leading-relaxed max-w-[85%]">${html}</div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function affiliateCTA(label, key, vin) {
  const href = affiliateUrl(key, { vin: vin || "" });
  return `<a target="_blank" rel="nofollow sponsored noopener" href="${href}" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-volt-600/15 border border-volt-500/25 hover:border-volt-400/40 hover:bg-volt-600/25 text-volt-300 text-xs font-medium mt-2 mr-1 transition-all">${label} <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></a>`;
}

async function handleAIChat(inputEl, chatContainer) {
  const text = typeof inputEl === "string" ? inputEl : (inputEl.value || "").trim();
  if (!text) return;

  postBubble(chatContainer, "user", text.replace(/</g, "&lt;"));
  if (typeof inputEl !== "string" && inputEl.value !== undefined) inputEl.value = "";

  // Show typing indicator
  const typing = document.createElement("div");
  typing.className = "flex items-start gap-3";
  typing.innerHTML = `<div class="shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-volt-500 to-volt-700 text-white grid place-items-center text-[10px] font-bold shadow-md shadow-volt-500/20">AI</div>
    <div class="p-3.5 rounded-2xl rounded-tl-md bg-white/[0.04] border border-white/[0.06] text-silver-400">
      <div class="flex gap-1"><span class="w-2 h-2 bg-volt-500/50 rounded-full animate-bounce" style="animation-delay:0ms"></span><span class="w-2 h-2 bg-volt-500/50 rounded-full animate-bounce" style="animation-delay:150ms"></span><span class="w-2 h-2 bg-volt-500/50 rounded-full animate-bounce" style="animation-delay:300ms"></span></div>
    </div>`;
  chatContainer.appendChild(typing);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-6),
        vehicleContext: vehicleContext.decoded.Make
          ? {
              vin: vehicleContext.vin,
              make: vehicleContext.decoded.Make,
              model: vehicleContext.decoded.Model,
              year: vehicleContext.decoded.ModelYear,
              engine: [vehicleContext.decoded.DisplacementL, vehicleContext.decoded.EngineConfiguration].filter(Boolean).join(" "),
              bodyClass: vehicleContext.decoded.BodyClass,
              driveType: vehicleContext.decoded.DriveType,
              fuelType: vehicleContext.decoded.FuelTypePrimary,
              recallCount: vehicleContext.recallCount,
            }
          : undefined,
      }),
    });

    typing.remove();

    if (res.ok) {
      const data = await res.json();
      let response = data.response || "I apologize, I could not process that request.";
      // Convert markdown-like formatting to HTML
      response = response
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>");

      // Add contextual CTAs
      const lower = text.toLowerCase();
      if (lower.includes("insurance")) response += "<br>" + affiliateCTA("Compare Insurance Rates", "insurance", vehicleContext.vin);
      else if (lower.includes("warranty")) response += "<br>" + affiliateCTA("Check Warranty Options", "warranty", vehicleContext.vin);
      else if (lower.includes("loan") || lower.includes("refi") || lower.includes("financ")) response += "<br>" + affiliateCTA("Get Loan/Refi Offers", "loans", vehicleContext.vin);
      else if (lower.includes("sell") || lower.includes("trade")) response += "<br>" + affiliateCTA("Get Instant Offer", "sell", vehicleContext.vin);
      else if (lower.includes("repair") || lower.includes("mechanic")) response += "<br>" + affiliateCTA("Find Repair Estimates", "repair", vehicleContext.vin);
      else if (lower.includes("lemon")) response += "<br>" + affiliateCTA("Lemon Law Help", "lemon-law", vehicleContext.vin);

      postBubble(chatContainer, "ai", response);
      chatHistory.push({ role: "user", content: text });
      chatHistory.push({ role: "assistant", content: data.response });
    } else {
      // Fallback to local answers
      postBubble(chatContainer, "ai", localAnswer(text));
    }
  } catch {
    typing.remove();
    // Fallback to local answers when API is unavailable
    postBubble(chatContainer, "ai", localAnswer(text));
  }
}

function localAnswer(q) {
  const query = (q || "").toLowerCase();
  const c = vehicleContext;
  const age = c.decoded?.ModelYear ? (new Date().getFullYear() - parseInt(c.decoded.ModelYear, 10)) : null;
  const make = c.decoded?.Make || "this vehicle";
  const isEV = (c.decoded?.FuelTypePrimary || "").toLowerCase().includes("electric");

  if (query.includes("recall"))
    return c.recallCount > 0
      ? `We found <strong>${c.recallCount}</strong> recall(s) for ${make}. Book the <strong>free dealer fix</strong> first. ${affiliateCTA("Find a dealer", "mechanics", c.vin)} ${affiliateCTA("Compare warranty options", "warranty", c.vin)}`
      : `No recalls were found for ${make}. Still, consider a quick inspection before purchase. ${affiliateCTA("Get mechanic estimates", "repair", c.vin)}`;
  if (query.includes("warranty"))
    return age !== null && age >= 7
      ? `At about <strong>${age} years</strong> old, an extended warranty can be cost-effective. ${affiliateCTA("See warranty plans", "warranty", c.vin)}`
      : `Warranty value depends on repair risk and mileage. ${affiliateCTA("Check warranty quotes", "warranty", c.vin)}`;
  if (query.includes("insurance"))
    return `${isEV ? "EVs sometimes qualify for lower rates. " : ""}Compare at least 3 carriers to save 10-30%. ${affiliateCTA("Compare insurance rates", "insurance", c.vin)}`;
  if (query.includes("loan") || query.includes("refi") || query.includes("financ"))
    return `Better credit and newer vehicles often qualify for lower APR. ${affiliateCTA("Get loan/refi offers", "loans", c.vin)}`;
  if (query.includes("mechanic") || query.includes("repair") || query.includes("estimate"))
    return `Get multiple quotes and check common issues for this model. ${affiliateCTA("Check repair estimates", "repair", c.vin)}`;
  if (query.includes("sell") || query.includes("trade"))
    return `Instant-offer marketplaces can beat dealer trade-ins. ${affiliateCTA("Get an instant offer", "sell", c.vin)}`;
  if (query.includes("lemon"))
    return `If repeated repairs affect safety or drivability, you may have remedies under state lemon laws. ${affiliateCTA("Check lemon-law options", "lemon-law", c.vin)}`;
  return `I can help with: <strong>recalls</strong>, <strong>insurance</strong>, <strong>warranty</strong>, <strong>loan/refi</strong>, <strong>repair estimates</strong>, <strong>selling</strong>, or <strong>lemon law</strong>. Run a VIN for tailored guidance.`;
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Year in footer
  const yearEl = qs("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // VIN form
  const runBtn = qs("#runBtn");
  const vinInput = qs("#vinInput");
  if (runBtn) runBtn.addEventListener("click", runVIN);
  if (vinInput) vinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runVIN(); });

  // AI Modal
  const aiOverlay = qs("#aiOverlay");
  const openAI = qs("#openAI");
  const closeAI = qs("#closeAI");
  const chat = qs("#chat");
  const chatInput = qs("#chatInput");
  const chatSend = qs("#chatSend");

  if (openAI && aiOverlay) {
    openAI.addEventListener("click", () => { aiOverlay.classList.add("active"); if (chatInput) chatInput.focus(); });
  }
  if (closeAI && aiOverlay) {
    closeAI.addEventListener("click", () => aiOverlay.classList.remove("active"));
  }
  if (aiOverlay) {
    aiOverlay.addEventListener("click", (e) => { if (e.target === aiOverlay) aiOverlay.classList.remove("active"); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") aiOverlay.classList.remove("active"); });
  }

  if (chatSend && chatInput && chat) {
    chatSend.addEventListener("click", () => handleAIChat(chatInput, chat));
    chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAIChat(chatInput, chat); });
  }

  // Quick action buttons
  qsa("[data-quick]").forEach((b) =>
    b.addEventListener("click", () => {
      if (chat) handleAIChat(b.textContent.trim(), chat);
    })
  );

  // Mobile menu toggle
  const menuBtn = qs("#menuToggle");
  const mobileMenu = qs("#mobileMenu");
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => mobileMenu.classList.toggle("hidden"));
  }

  // Smooth scroll for anchor links
  qsa('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});
