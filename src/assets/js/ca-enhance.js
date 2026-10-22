/* Car Alpha — site enhancements: classic-VIN routing, parts box, camera-scan button, PWA install prompt. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var scanned = false;

  function hideModernCards() { ['vehicleCard', 'recallCard', 'actionsCard', 'historyCta', 'partsBox', 'classicHint'].forEach(function (id) { var el = $(id); if (el) { if (/Cta|Box|Hint/.test(id)) el.remove(); else el.classList.add('hidden'); } }); var eb = $('errorBox'); if (eb) eb.classList.add('hidden'); var w = $('vinWarn'); if (w) w.remove(); }
  function classicHost() {
    var h = $('classicCard'); if (h) return h;
    h = document.createElement('div'); h.id = 'classicCard'; h.className = 'hidden'; h.setAttribute('aria-live', 'polite');
    var anchor = $('vehicleCard') || $('errorBox');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(h, anchor);
    else { var inp = $('vinInput'); var box = inp && (inp.closest('[role="search"]') || inp.closest('.glass-card') || inp.parentNode); box.parentNode.insertBefore(h, box.nextSibling); }
    return h;
  }
  function runClassic(val) {
    if (!window.caClassic) return;
    hideModernCards();
    var host = classicHost();
    window.caClassic.render(window.caClassic.decode(val), host);
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function shouldRouteClassic() {
    var inp = $('vinInput'); if (!inp) return false;
    var n = String(inp.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').length;
    return n >= 8 && n <= 16;
  }
  // Intercept before page handlers (capture phase) for 8–16 character inputs.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#runBtn');
    if (!b || !shouldRouteClassic()) { var c = $('classicCard'); if (b && c) c.classList.add('hidden'); return; }
    e.preventDefault(); e.stopImmediatePropagation(); runClassic($('vinInput').value);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || e.target.id !== 'vinInput') return;
    if (!shouldRouteClassic()) { var c = $('classicCard'); if (c) c.classList.add('hidden'); return; }
    e.preventDefault(); e.stopImmediatePropagation(); runClassic(e.target.value);
  }, true);

  // Read the rendered modern decode card (label/value pairs).
  function readCard(card) {
    var out = {};
    card.querySelectorAll('.grid > div').forEach(function (cell) {
      var kids = cell.children; if (kids.length < 2) return;
      out[kids[0].textContent.trim().toLowerCase()] = kids[1].textContent.trim();
    });
    return out;
  }
  function titleCase(s) { return String(s).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function onVehicleCard() {
    var card = $('vehicleCard'); if (!card || card.classList.contains('hidden') || !card.innerHTML.trim()) return;
    var old = $('partsBox'); if (old) old.remove(); var oh = $('classicHint'); if (oh) oh.remove();
    var d = readCard(card);
    if (!d.year || !d.make) {
      var hint = document.createElement('div'); hint.id = 'classicHint';
      hint.className = 'glass-card metallic-border rounded-2xl p-5 mt-5 carbon-panel';
      hint.innerHTML = '<h3 class="text-base font-bold text-white">Couldn’t decode this as a modern VIN</h3><p class="text-sm text-silver-400 mt-1">Standard 17-character VINs began with 1981 models. If this is an older car, its serial number is usually 11–13 characters.</p><button type="button" class="mt-3 inline-flex items-center px-4 py-2 rounded-xl border border-volt-500/40 text-volt-300 text-sm font-semibold">Try the classic decoder</button>';
      hint.querySelector('button').addEventListener('click', function () { runClassic(($('vinInput') || {}).value || ''); });
      card.parentNode.insertBefore(hint, card.nextSibling);
      return;
    }
    if (d.model && window.caClassic) {
      var wrap = document.createElement('div');
      wrap.innerHTML = window.caClassic.partsLinks({ year: d.year, make: titleCase(d.make), model: d.model });
      var box = wrap.firstChild; if (!box) return;
      var after = $('actionsCard') && !$('actionsCard').classList.contains('hidden') ? $('actionsCard') : card;
      after.parentNode.insertBefore(box, after.nextSibling);
    }
    if (scanned) { scanned = false; setTimeout(showInstall, 1200); }
  }
  function watchCards() {
    var card = $('vehicleCard'); if (!card) return;
    var t; var cb = function () { clearTimeout(t); t = setTimeout(onVehicleCard, 150); };
    new MutationObserver(cb).observe(card, { attributes: true, attributeFilter: ['class'], childList: true });
    var ac = $('actionsCard'); if (ac) new MutationObserver(cb).observe(ac, { attributes: true, attributeFilter: ['class'] });
  }

  // Prominent "Scan with camera" button under every VIN field that has a scanner.
  function hasCamera() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function addScanButtons() {
    document.querySelectorAll('[data-vin-scan]').forEach(function (icon) {
      var input = $(icon.getAttribute('data-vin-scan')); if (!input || input.dataset.caScanBtn) return;
      input.dataset.caScanBtn = '1';
      var card = input.closest('.vin-card, [role="search"], .glass-card');
      var row = (card && card.querySelector('.flex.flex-col')) || input.parentNode;
      if (!row.contains(input)) row = input.parentNode;
      var btn = document.createElement('button'); btn.type = 'button';
      btn.className = 'ca-scan-btn mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl border border-volt-500/40 bg-volt-500/[0.08] hover:bg-volt-500/[0.15] text-volt-300 font-bold text-sm tracking-wide';
      btn.innerHTML = '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10"/></svg>' + (hasCamera() ? 'Scan VIN with camera' : 'Read VIN from a photo');
      btn.addEventListener('click', function () { icon.click(); });
      row.parentNode.insertBefore(btn, row.nextSibling);
    });
  }
  // After the user confirms a scanned VIN, run the check automatically.
  document.addEventListener('vinscan:confirmed', function (e) {
    if (!e.target || e.target.id !== 'vinInput') return;
    scanned = true;
    setTimeout(function () { var rb = $('runBtn'); if (rb && String(e.target.value).length === 17) rb.click(); }, 300);
  }, true);

  // ---- PWA ----
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function showInstall() {
    try { if (isStandalone() || +localStorage.getItem('caA2hsDismissed') > Date.now() - 30 * 864e5) return; } catch (e) { return; }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (!deferred && !ios) return;
    if ($('caInstall')) return;
    var bar = document.createElement('div'); bar.id = 'caInstall'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Add Car Alpha to your home screen');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:150;max-width:520px;margin:0 auto;';
    bar.innerHTML = '<div class="glass-card metallic-border rounded-2xl p-4 carbon-panel shadow-2xl flex items-start gap-3"><div class="flex-1"><div class="font-bold text-white text-sm">Keep Car Alpha on your phone</div><div class="text-xs text-silver-400 mt-1">' + (deferred ? 'Install it for one-tap VIN scans at lots, auctions and car meets.' : 'Tap the Share button, then “Add to Home Screen” for one-tap VIN scans.') + '</div></div>' + (deferred ? '<button type="button" id="caInstallYes" class="px-4 py-2 rounded-xl bg-volt-600 hover:bg-volt-500 text-white text-sm font-semibold">Install</button>' : '') + '<button type="button" id="caInstallNo" aria-label="Dismiss" class="px-2 py-1 text-silver-400 hover:text-white text-lg leading-none">&times;</button></div>';
    document.body.appendChild(bar);
    function dismiss() { try { localStorage.setItem('caA2hsDismissed', String(Date.now())); } catch (e) {} bar.remove(); }
    $('caInstallNo').addEventListener('click', dismiss);
    var yes = $('caInstallYes');
    if (yes) yes.addEventListener('click', function () { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; bar.remove(); }); });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  function init() {
    watchCards(); addScanButtons();
    // Deep link: /?scan=1 opens the scanner (manifest shortcut); /?vin=XXXX prefills.
    var p = new URLSearchParams(location.search), inp = $('vinInput');
    if (inp && p.get('vin')) { inp.value = p.get('vin').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (inp && p.get('vin') && p.get('go') === '1') setTimeout(function () { var rb = $('runBtn'); if (rb) rb.click(); }, 300);
    if (p.get('scan') === '1') setTimeout(function () { var b = document.querySelector('[data-vin-scan]'); if (b) b.click(); else if (inp) inp.focus(); }, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
