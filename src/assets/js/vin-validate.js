/* Car Alpha — shared VIN validation (ISO 3779 / 49 CFR 565 check digit) and history-report CTA */
(function () {
  var MAP = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  var W = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  function checkDigit(vin) {
    var sum = 0;
    for (var i = 0; i < 17; i++) { var c = vin[i]; sum += (/\d/.test(c) ? +c : MAP[c]) * W[i]; }
    var r = sum % 11; return r === 10 ? "X" : String(r);
  }
  // Returns {vin, error, warning}. Errors block the lookup; warnings do not (non-North American VINs may not use a check digit).
  function caVinCheck(raw) {
    var vin = String(raw || "").toUpperCase().replace(/[\s-]/g, "");
    if (!vin) return { vin: vin, error: "Please enter a VIN. It's 17 characters, found on the driver-side dashboard, door jamb, title or insurance card." };
    var bad = vin.match(/[IOQ]/g);
    if (bad) return { vin: vin, error: "VINs never use the letters I, O or Q (they look like 1 and 0). Check the " + bad.join(", ") + " in your VIN and try again." };
    if (/[^A-Z0-9]/.test(vin)) return { vin: vin, error: "VINs contain only letters and numbers. Please remove any other characters." };
    if (vin.length !== 17) return { vin: vin, error: "That VIN has " + vin.length + " characters, but VINs have exactly 17. Vehicles built before 1981 used shorter, non-standard numbers that can't be decoded." };
    if (checkDigit(vin) !== vin[8]) return { vin: vin, warning: "Heads up: this VIN's check digit (9th character) doesn't match, which often means a typo. Double-check it against the vehicle. We'll still try to decode it, since some non-North American VINs don't use a check digit." };
    return { vin: vin };
  }
  function showWarning(msg) {
    var input = document.getElementById("vinInput"); if (!input) return;
    var box = document.getElementById("vinWarn");
    if (!msg) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.id = "vinWarn"; box.setAttribute("role", "status");
      box.className = "mt-3 p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 text-amber-200 text-sm text-left";
      var host = input.closest("form") || input.parentNode; host.parentNode.insertBefore(box, host.nextSibling);
    }
    box.textContent = msg;
  }
  window.caVinCheck = caVinCheck; window.caVinCheckDigit = checkDigit; window.caVinShowWarning = showWarning;

  // Full vehicle history report call-to-action, shown under decoded results (plain links, official sources).
  function addCta() {
    var card = document.getElementById("vehicleCard");
    if (!card || card.classList.contains("hidden") || document.getElementById("historyCta")) return;
    var cta = document.createElement("div"); cta.id = "historyCta";
    cta.className = "glass-card metallic-border rounded-2xl p-6 mt-6 carbon-panel";
    cta.innerHTML = '<h3 class="text-lg font-bold text-white">Get a full vehicle history report</h3>' +
      '<p class="text-sm text-silver-400 mt-2 leading-relaxed">Free VIN data shows specs and recalls, not accidents, title brands (salvage, flood), odometer readings or past owners. Before you buy a used car, get a history report and a pre-purchase inspection.</p>' +
      '<div class="mt-4 flex flex-col sm:flex-row gap-3">' +
      '<a href="https://vehiclehistory.bja.ojp.gov/nmvtis_vehiclehistory" target="_blank" rel="noopener" class="inline-flex justify-center items-center px-5 py-3 rounded-xl bg-volt-600 hover:bg-volt-500 text-white font-semibold text-sm">Find an approved NMVTIS history report</a>' +
      '<a href="https://www.nicb.org/vincheck" target="_blank" rel="noopener" class="inline-flex justify-center items-center px-5 py-3 rounded-xl border border-white/15 hover:border-volt-500/50 text-silver-200 font-semibold text-sm">Free theft &amp; total-loss check (NICB)</a>' +
      '</div>';
    card.parentNode.insertBefore(cta, card.nextSibling);
  }
  function watch() {
    var card = document.getElementById("vehicleCard"); if (!card) return;
    new MutationObserver(addCta).observe(card, { attributes: true, attributeFilter: ["class"], childList: true });
    addCta();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
})();
