/**
 * VIN Scanner — Camera-based OCR for VIN input fields
 * Uses Tesseract.js (WASM) for client-side OCR.
 * Progressive enhancement: only activates when camera is available.
 */
(function () {
  'use strict';

  var VIN_LENGTH = 17;
  var VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
  var TRANSLITERATION = { 0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  var WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  var tesseractLoaded = false;
  var tesseractWorker = null;

  function validateCheckDigit(vin) {
    var sum = 0;
    for (var i = 0; i < 17; i++) {
      var val = TRANSLITERATION[vin[i]];
      if (val === undefined) return false;
      sum += val * WEIGHTS[i];
    }
    var remainder = sum % 11;
    var expected = remainder === 10 ? 'X' : String(remainder);
    return vin[8] === expected;
  }

  function isValidVIN(vin) {
    if (!vin || vin.length !== VIN_LENGTH) return false;
    if (!VIN_REGEX.test(vin)) return false;
    return validateCheckDigit(vin);
  }

  function hasCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ── Modal HTML ── */
  function createModal() {
    var overlay = document.createElement('div');
    overlay.id = 'vinScannerOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'VIN Camera Scanner');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;flex-direction:column;';

    overlay.innerHTML =
      '<div id="vinScannerModal" style="width:100%;max-width:480px;margin:0 auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:400px;">' +
          '<h2 style="color:#fff;font-size:16px;font-weight:700;margin:0;">Scan VIN with Camera</h2>' +
          '<button id="vinScannerClose" aria-label="Close scanner" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;width:36px;height:36px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:background 0.2s;">&times;</button>' +
        '</div>' +
        '<div id="vinScannerVideoWrap" style="position:relative;width:100%;max-width:400px;aspect-ratio:4/3;border-radius:12px;overflow:hidden;border:2px solid rgba(6,182,212,0.4);background:#000;">' +
          '<video id="vinScannerVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>' +
          '<div id="vinScannerGuide" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85%;height:22%;border:2px solid rgba(6,182,212,0.7);border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,0.45);pointer-events:none;"></div>' +
          '<div id="vinScannerScanline" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85%;height:2px;background:linear-gradient(90deg,transparent,rgba(6,182,212,0.8),transparent);pointer-events:none;opacity:0;"></div>' +
        '</div>' +
        '<p id="vinScannerTip" style="margin:0;color:#cbd5e1;font-size:12px;text-align:center;max-width:400px;">Tip: aim at the <strong style="color:#fff;">barcode on the driver\u2019s door-jamb sticker</strong>. It reads more reliably than the printed VIN.</p>' +
        '<canvas id="vinScannerCanvas" style="display:none;"></canvas>' +
        '<div id="vinScannerStatus" style="color:rgba(160,170,184,1);font-size:13px;text-align:center;min-height:20px;">Initializing camera...</div>' +
        '<div id="vinScannerConfidence" style="display:none;width:100%;max-width:400px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<span style="color:rgba(160,170,184,0.8);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Confidence</span>' +
            '<span id="vinScannerConfPct" style="color:#22d3ee;font-size:11px;font-weight:700;">0%</span>' +
          '</div>' +
          '<div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">' +
            '<div id="vinScannerConfBar" style="height:100%;width:0%;background:linear-gradient(90deg,#06b6d4,#22d3ee);border-radius:2px;transition:width 0.3s;"></div>' +
          '</div>' +
        '</div>' +
        '<div id="vinScannerResult" style="display:none;width:100%;max-width:400px;padding:12px 16px;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:10px;text-align:center;">' +
          '<label for="vinScannerResultText" style="display:block;color:rgba(160,170,184,0.8);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Check the scanned VIN, fix any character, then confirm</label>' +
          '<input id="vinScannerResultText" maxlength="17" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.18);border-radius:8px;color:#fff;font-size:17px;font-weight:800;font-family:ui-monospace,monospace;letter-spacing:0.1em;text-align:center;padding:8px 4px;">' +
          '<div id="vinScannerCheck" style="font-size:12px;margin-top:6px;min-height:16px;"></div>' +
          '<div id="vinScannerSuggest" style="display:none;margin-top:6px;"></div>' +
          '<button id="vinScannerConfirm" type="button" style="margin-top:10px;width:100%;padding:11px 16px;background:linear-gradient(90deg,#06b6d4,#22d3ee);border:0;color:#04121a;border-radius:10px;cursor:pointer;font-size:14px;font-weight:800;">Use this VIN</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">' +
          '<label id="vinScannerUploadLbl" style="padding:10px 18px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">Upload a photo instead<input id="vinScannerFile" type="file" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;"></label>' +
        '</div>' +
        '<button id="vinScannerRetry" style="display:none;padding:10px 24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.2s;">Try Again</button>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  /* ── Tesseract Lazy Loader ── */
  function loadTesseract(callback) {
    if (tesseractLoaded && window.Tesseract) { callback(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = function () { tesseractLoaded = true; callback(); };
    script.onerror = function () { callback(new Error('Failed to load OCR engine.')); };
    document.head.appendChild(script);
  }

  /* ── Image Preprocessing ── */
  // mode: 'gray' (grayscale + contrast stretch, lets Tesseract binarize) or 'bin' (adds Otsu threshold).
  function preprocessFrame(video, canvas, guideRect, mode, targetH) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var vw = video.videoWidth || video.naturalWidth || video.width, vh = video.videoHeight || video.naturalHeight || video.height;
    if (!vw || !vh) return null;

    // Calculate bounding box region from guide overlay
    var sx = vw * guideRect.left;
    var sy = vh * guideRect.top;
    var sw = vw * guideRect.width;
    var sh = vh * guideRect.height;
    // Upscale small crops: Tesseract reads best with characters roughly 30-60px tall.
    var scale = Math.min(6, Math.max(1, (targetH || 160) / sh));
    if (sw * scale > 2400) scale = Math.max(1, 2400 / sw);
    var cw = Math.round(sw * scale), ch = Math.round(sh * scale);

    canvas.width = cw;
    canvas.height = ch;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    sw = cw; sh = ch;

    // Grayscale
    var imgData = ctx.getImageData(0, 0, sw, sh);
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) {
      var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }

    // Contrast stretch
    var min = 255, max = 0;
    for (var j = 0; j < d.length; j += 4) {
      if (d[j] < min) min = d[j];
      if (d[j] > max) max = d[j];
    }
    var range = max - min || 1;
    for (var k = 0; k < d.length; k += 4) {
      var v = ((d[k] - min) / range) * 255;
      d[k] = d[k + 1] = d[k + 2] = v;
    }
    // Otsu threshold
    var histogram = new Array(256).fill(0);
    for (var h = 0; h < d.length; h += 4) histogram[Math.round(d[h])]++;
    var total = sw * sh;
    var sumAll = 0;
    for (var t = 0; t < 256; t++) sumAll += t * histogram[t];
    var sumB = 0, wB = 0, maxVar = 0, threshold = 128, darkCount = 0;
    for (var tt = 0; tt < 256; tt++) {
      wB += histogram[tt];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += tt * histogram[tt];
      var mB = sumB / wB;
      var mF = (sumAll - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = tt; darkCount = wB; }
    }
    // Text is the minority class. If most pixels are dark, the plate is light-on-dark
    // (stamped plates, black labels), so invert to dark text on light for Tesseract.
    var invert = darkCount / total > 0.55;
    for (var b = 0; b < d.length; b += 4) {
      var g = invert ? 255 - d[b] : d[b];
      var bv = mode === 'gray' ? g : ((invert ? d[b] <= threshold : d[b] > threshold) ? 255 : 0);
      d[b] = d[b + 1] = d[b + 2] = bv;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /* ── OCR Processing ── */
  var ocrWorkerPromise = null;
  var currentPSM = '6';
  function getWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    if (!window.Tesseract || !window.Tesseract.createWorker) return Promise.resolve(null);
    ocrWorkerPromise = window.Tesseract.createWorker('eng').then(function (w) {
      return w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789IOQ', tessedit_pageseg_mode: '6' }).then(function () { currentPSM = '6'; return w; });
    }).catch(function () { ocrWorkerPromise = null; return null; });
    return ocrWorkerPromise;
  }
  // VINs never contain I, O or Q, so OCR reads of those letters are almost always 1 or 0.
  // Common OCR confusions between VIN-legal characters.
  var CONFUSABLE = { '0':'D8','1':'7LT','2':'Z','3':'8','4':'A','5':'S6','6':'G5','7':'1T','8':'B3','9':'G','A':'4','B':'8','D':'0','G':'6C','L':'1','S':'5','T':'17','U':'V','V':'UY','Z':'24','Y':'V','C':'G' };
  var LETTER_TO_DIGIT = { 'B':'8','D':'0','G':'6','L':'1','S':'5','T':'7','Z':'2','A':'4' };
  // VIN grammar used to rank candidates: position 9 is 0-9/X, position 10 (model year) is never
  // U, Z or 0, and the last five characters are digits for nearly all post-1981 light vehicles.
  function grammarScore(v) {
    var sc = 0;
    if (/[0-9X]/.test(v[8])) sc++;
    if (!/[UZ0]/.test(v[9])) sc++;
    if (/^[0-9]{5}$/.test(v.slice(12))) sc++;
    return sc;
  }
  // Snap letters that cannot appear in the numeric tail (and check digit) back to digits.
  function positionalFix(v) {
    if (!v || v.length !== VIN_LENGTH) return v;
    var a = v.split('');
    if (LETTER_TO_DIGIT[a[8]]) a[8] = LETTER_TO_DIGIT[a[8]];
    for (var i = 12; i < 17; i++) if (LETTER_TO_DIGIT[a[i]]) a[i] = LETTER_TO_DIGIT[a[i]];
    var f = a.join('');
    return isValidVIN(f) || !isValidVIN(v) ? f : v;
  }
  // If a 17-char read fails the check digit, try every single-character swap from the
  // confusion table. Accept only when exactly one grammar-plausible swap produces a valid VIN.
  // The result is always shown for confirmation, never trusted silently.
  function repairVIN(v) {
    if (!v || v.length !== VIN_LENGTH) return v;
    v = positionalFix(v);
    if (isValidVIN(v)) return v;
    var cheap = [];
    for (var i = 0; i < VIN_LENGTH; i++) {
      var alts = CONFUSABLE[v[i]] || '';
      for (var a = 0; a < alts.length; a++) {
        var c = v.slice(0, i) + alts[a] + v.slice(i + 1);
        if (swapCost(v[i], alts[a]) === 0 && isValidVIN(c) && grammarScore(c) >= 3) cheap.push(c);
      }
    }
    return cheap.length === 1 ? cheap[0] : v;
  }
  // Shape-alike pairs Tesseract confuses most (B/8, S/5, G/6, D/0, Z/2, A/4) cost less than rarer swaps.
  var COMMON_PAIRS = 'B8 8B S5 5S G6 6G D0 0D Z2 2Z A4 4A';
  function swapCost(from, to) { return COMMON_PAIRS.indexOf(from + to) >= 0 ? 0 : 1; }
  // Check-digit-valid candidates within maxEdits confusable swaps, best grammar first.
  function vinSuggestions(v, maxEdits) {
    if (!v || v.length !== VIN_LENGTH) return [];
    var out = {}, i, j, a, b, c, ai, bj;
    for (i = 0; i < VIN_LENGTH; i++) {
      ai = CONFUSABLE[v[i]] || '';
      for (a = 0; a < ai.length; a++) {
        c = v.slice(0, i) + ai[a] + v.slice(i + 1);
        var ca = swapCost(v[i], ai[a]);
        if (isValidVIN(c)) out[c] = 1 + 2 * ca;
        if (maxEdits < 2) continue;
        for (j = i + 1; j < VIN_LENGTH; j++) {
          bj = CONFUSABLE[v[j]] || '';
          for (b = 0; b < bj.length; b++) {
            var c2 = c.slice(0, j) + bj[b] + c.slice(j + 1);
            if (isValidVIN(c2) && !out[c2]) out[c2] = 1.5 + 2 * (ca + swapCost(v[j], bj[b]));
          }
        }
      }
    }
    var list = Object.keys(out).filter(function (k) { return grammarScore(k) >= 3; });
    list.sort(function (x, y) { return out[x] - out[y]; });
    return list;
  }
  function cleanTok(t) { return t.replace(/O|Q/g, '0').replace(/I/g, '1').replace(/[^A-HJ-NPR-Z0-9]/g, ''); }
  // Best 17-char window of a token: check-digit-valid first, then grammar-plausible.
  function bestWindow(tk) {
    if (tk.length < VIN_LENGTH) return '';
    var best = '', bs = -1;
    for (var i = 0; i + VIN_LENGTH <= tk.length; i++) {
      var w = repairVIN(tk.substr(i, VIN_LENGTH));
      var g = grammarScore(w), sc = isValidVIN(w) && g >= 3 ? 10 : g;
      if (sc > bs) { bs = sc; best = w; }
    }
    return best;
  }
  function normalizeOCR(text) {
    var tokens = String(text || '').toUpperCase().split(/\s+/).map(cleanTok).filter(Boolean);
    var raw = tokens.join('');
    // 1) A check-digit-valid VIN inside one token, or across two tokens that together are
    //    17-19 chars (a VIN broken by a stray space). Never across unrelated text.
    var runs = tokens.slice();
    for (var p = 0; p + 1 < tokens.length; p++) { var j2 = tokens[p] + tokens[p + 1]; if (j2.length >= VIN_LENGTH && j2.length <= VIN_LENGTH + 2) runs.push(j2); }
    for (var r = 0; r < runs.length; r++) {
      for (var i = 0; i + VIN_LENGTH <= runs[r].length; i++) { var w = runs[r].substr(i, VIN_LENGTH); if (isValidVIN(w) && grammarScore(w) >= 3) return w; }
    }
    // 2) A single 17-19 char token (VINs print as one unbroken run) that fits VIN grammar; trim stray edge characters.
    var cand = '', cs = -1;
    runs.forEach(function (tk) {
      if (tk.length < VIN_LENGTH || tk.length > VIN_LENGTH + 2) return;
      var bw = bestWindow(tk), g = grammarScore(bw), sc = isValidVIN(bw) && g >= 3 ? 10 : g;
      if (sc >= 3 && sc > cs) { cs = sc; cand = bw; }
    });
    if (cand) return cand;
    // 3) Short reads are kept as-is (they never pass as a VIN); long junk is dropped.
    return raw.length < VIN_LENGTH ? raw : '';
  }

  function recognizeFrame(canvas, psm) {
    if (!window.Tesseract) return Promise.resolve({ text: '', confidence: 0 });
    psm = psm || '6';
    return getWorker().then(function (w) {
      if (!w) return window.Tesseract.recognize(canvas, 'eng');
      var ready = psm === currentPSM ? Promise.resolve() : w.setParameters({ tessedit_pageseg_mode: psm }).then(function () { currentPSM = psm; });
      return ready.then(function () { return w.recognize(canvas); });
    }).then(function (result) {
      return { text: normalizeOCR(result.data.text), raw: result.data.text, confidence: result.data.confidence || 0 };
    }).catch(function () {
      return { text: '', confidence: 0 };
    });
  }

  // Read a still photo (upload fallback). The VIN can be anywhere, so try the whole image as sparse
  // text, then overlapping horizontal bands as single lines, stopping at the first check-digit-valid read.
  function recognizeImage(img, canvas) {
    canvas = canvas || document.createElement('canvas');
    var plans = [{ r: { left: 0, top: 0, width: 1, height: 1 }, m: 'gray', psm: '11' }];
    [0.25, 0.15].forEach(function (h) {
      for (var top = 0; top + h <= 1.0001; top += h / 2) plans.push({ r: { left: 0.02, top: top, width: 0.96, height: h }, m: 'gray', psm: '6' });
    });
    plans.push({ r: { left: 0, top: 0, width: 1, height: 1 }, m: 'bin', psm: '11' });
    var results = [], i = 0;
    function next() {
      if (i >= plans.length) return Promise.resolve(results);
      var p = plans[i++];
      if (!preprocessFrame(img, canvas, p.r, p.m)) return next();
      return recognizeFrame(canvas, p.psm).then(function (res) {
        if (res.text) results.push(res);
        if (isValidVIN(res.text)) return results;
        return next();
      });
    }
    return next().then(function (rs) { return findConsensusVIN(rs) || bestPartial(rs); });
  }
  function bestPartial(rs) { return null; }


  /* ── Barcode (primary mode) ── */
  // Door-jamb stickers, many windshield VIN labels and registrations carry the VIN as a barcode
  // (Code 39, Code 128, Data Matrix, QR or PDF417). Decoding it is exact, so we try it before OCR.
  var ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  var BC_FORMATS = ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'];
  var bcEnginePromise = null;
  // Some Code 39 VIN barcodes on imported vehicles prefix an 'I' (18 chars); strip to 17.
  function vinFromBarcode(text) {
    var t = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.length === 18 && t[0] === 'I') t = t.slice(1);
    if (t.length === VIN_LENGTH) return /^[A-HJ-NPR-Z0-9]{17}$/.test(t) ? t : '';
    // Longer payloads (QR/PDF417 on registrations) may embed the VIN among other fields.
    var parts = String(text || '').toUpperCase().split(/[^A-Z0-9]+/);
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i]; if (q.length === 18 && q[0] === 'I') q = q.slice(1);
      if (q.length === VIN_LENGTH && isValidVIN(q)) return q;
    }
    for (var j = 0; j + VIN_LENGTH <= t.length; j++) { var w = t.substr(j, VIN_LENGTH); if (isValidVIN(w)) return w; }
    return '';
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var sc = document.createElement('script'); sc.src = src; sc.async = true;
      sc.onload = res; sc.onerror = function () { rej(new Error('load failed')); };
      document.head.appendChild(sc);
    });
  }
  function zxingEngine() {
    return (window.ZXing ? Promise.resolve() : loadScript(ZXING_URL)).then(function () {
      var Z = window.ZXing, hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.PDF_417]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      var reader = new Z.MultiFormatReader(); reader.setHints(hints);
      var cv = document.createElement('canvas');
      function tryDecode(lum) {
        try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(lum)), hints).getText(); } catch (e) { return null; }
      }
      // Attempts: straight, sideways, small tilts (1D codes need near-horizontal scan lines),
      // and a half-size pass that helps with blur. Live camera cycles one attempt per frame;
      // still photos try them all.
      var ATTEMPTS = [[0, 1], [90, 1], [8, 1], [-8, 1], [0, 0.5], [16, 1], [-16, 1], [4, 0.6], [-4, 0.6]];
      var tick = 0;
      function attempt(source, w, h, ang, k) {
        var sc = Math.min(1, 1600 / Math.max(w, h)) * k;
        var dw = Math.round(w * sc), dh = Math.round(h * sc);
        var rad = ang * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
        cv.width = Math.round(dw * cos + dh * sin); cv.height = Math.round(dw * sin + dh * cos);
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(rad); ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh); ctx.restore();
        return tryDecode(new Z.HTMLCanvasElementLuminanceSource(cv));
      }
      return {
        kind: 'zxing',
        detect: function (source, all) {
          var w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
          if (!w || !h) return Promise.resolve([]);
          var list = all ? ATTEMPTS : [ATTEMPTS[0], ATTEMPTS[1 + (tick++ % (ATTEMPTS.length - 1))]];
          for (var i = 0; i < list.length; i++) { var txt = attempt(source, w, h, list[i][0], list[i][1]); if (txt) return Promise.resolve([txt]); }
          return Promise.resolve([]);
        }
      };
    });
  }
  function getBarcodeEngine() {
    if (bcEnginePromise) return bcEnginePromise;
    var native = ('BarcodeDetector' in window) && window.BarcodeDetector.getSupportedFormats
      ? window.BarcodeDetector.getSupportedFormats().then(function (fs) {
          var use = BC_FORMATS.filter(function (f) { return fs.indexOf(f) >= 0; });
          // Code 39 is the common VIN sticker format; without it, ZXing is the better engine.
          if (use.indexOf('code_39') < 0) return null;
          var det = new window.BarcodeDetector({ formats: use });
          return { kind: 'native', detect: function (src) { return det.detect(src).then(function (r) { return r.map(function (x) { return x.rawValue; }); }).catch(function () { return []; }); } };
        }).catch(function () { return null; })
      : Promise.resolve(null);
    bcEnginePromise = native.then(function (n) { return n || zxingEngine(); }).catch(function () { bcEnginePromise = null; return null; });
    return bcEnginePromise;
  }
  function scanBarcode(source, all) {
    return getBarcodeEngine().then(function (eng) {
      if (!eng) return '';
      return eng.detect(source, all).then(function (texts) {
        for (var i = 0; i < texts.length; i++) { var v = vinFromBarcode(texts[i]); if (v) return v; }
        return '';
      });
    }).catch(function () { return ''; });
  }

  /* ── Consensus Engine ── */
  function findConsensusVIN(results) {
    var validResults = results.filter(function (r) { return r.text.length === VIN_LENGTH; });
    if (!validResults.length) return null;

    // Check digit validation first
    var checkDigitValid = validResults.filter(function (r) { return isValidVIN(r.text); });
    if (checkDigitValid.length) {
      // Return highest confidence among check-digit valid results
      checkDigitValid.sort(function (a, b) { return b.confidence - a.confidence; });
      return checkDigitValid[0];
    }

    // Character-by-character consensus for 17-char results
    if (validResults.length >= 2) {
      var consensus = '';
      for (var pos = 0; pos < VIN_LENGTH; pos++) {
        var freq = {};
        validResults.forEach(function (r) {
          var ch = r.text[pos];
          freq[ch] = (freq[ch] || 0) + 1;
        });
        var best = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })[0];
        consensus += best;
      }
      if (isValidVIN(consensus)) {
        var avgConf = validResults.reduce(function (s, r) { return s + r.confidence; }, 0) / validResults.length;
        return { text: consensus, confidence: avgConf };
      }
    }

    // Fallback: best confidence 17-char result
    validResults.sort(function (a, b) { return b.confidence - a.confidence; });
    return validResults[0];
  }

  window.caVinOCR = { preprocessFrame: preprocessFrame, recognizeFrame: recognizeFrame, recognizeImage: recognizeImage, normalizeOCR: normalizeOCR, repairVIN: repairVIN, vinSuggestions: vinSuggestions, FRAME_PLANS: null, findConsensusVIN: findConsensusVIN, isValidVIN: isValidVIN, loadTesseract: loadTesseract, vinFromBarcode: vinFromBarcode, scanBarcode: scanBarcode, getBarcodeEngine: getBarcodeEngine };

  // Per-frame preprocessing/page-segmentation plan. In tests on real plate photos, PSM 7
  // (single line) failed whenever the guide box caught a second line; PSM 6/11 held up.
  var FRAME_PLANS = [['gray', '6'], ['gray', '11'], ['bin', '11'], ['gray', '6'], ['bin', '6']];

  window.caVinOCR.FRAME_PLANS = FRAME_PLANS;

  /* ── Scanner Controller ── */
  function VINScanner(targetInput) {
    this.targetInput = targetInput;
    this.stream = null;
    this.scanning = false;
    this.overlay = null;
    this.animFrame = null;
    this.results = [];
    this.maxFrames = 5;
  }

  VINScanner.prototype.open = function () {
    var self = this;
    if (self.overlay && self.overlay.parentNode) {
      self._show();
      var st = document.getElementById('vinScannerStatus');
      ['vinScannerResult', 'vinScannerRetry', 'vinScannerConfidence'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
      if (st) st.textContent = 'Initializing camera...';
      document.addEventListener('keydown', self._escHandler);
      document.addEventListener('keydown', self._focusTrapHandler);
      self._startCamera(document.getElementById('vinScannerVideo'), st);
      return;
    }

    self.overlay = createModal();
    self._show();

    var closeBtn = document.getElementById('vinScannerClose');
    var retryBtn = document.getElementById('vinScannerRetry');
    var video = document.getElementById('vinScannerVideo');
    var status = document.getElementById('vinScannerStatus');

    closeBtn.addEventListener('click', function () { self.close(); });
    retryBtn.addEventListener('click', function () { self._retry(); });
    var fileIn = document.getElementById('vinScannerFile');
    if (fileIn) fileIn.addEventListener('change', function () { var f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) self._handleFile(f); });

    // ESC to close
    self._escHandler = function (e) {
      if (e.key === 'Escape') self.close();
    };
    document.addEventListener('keydown', self._escHandler);

    // Focus trap
    self._trapFocus();

    // Start camera
    self._startCamera(video, status);
  };

  VINScanner.prototype._show = function () {
    this.overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // Screen reader announcement
    this._announce('VIN camera scanner opened. Position your VIN within the guide box.');
  };

  VINScanner.prototype._announce = function (msg) {
    var live = document.getElementById('vinScannerLive');
    if (!live) {
      live = document.createElement('div');
      live.id = 'vinScannerLive';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
      document.body.appendChild(live);
    }
    live.textContent = msg;
  };

  VINScanner.prototype._trapFocus = function () {
    var self = this;
    self._focusTrapHandler = function (e) {
      if (e.key !== 'Tab') return;
      var modal = document.getElementById('vinScannerModal');
      if (!modal) return;
      var focusable = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', self._focusTrapHandler);
    setTimeout(function () {
      var closeBtn = document.getElementById('vinScannerClose');
      if (closeBtn) closeBtn.focus();
    }, 100);
  };

  VINScanner.prototype._startCamera = function (video, status) {
    var self = this;
    self._uploadMode = false;
    if (!hasCamera()) {
      status.textContent = window.isSecureContext === false ? 'The camera needs a secure (https) page. Upload a photo of the VIN or type it.' : 'This browser can\u2019t open the camera here. Upload a photo of the VIN or type it.';
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function (stream) {
      self.stream = stream;
      video.srcObject = stream;
      video.onloadedmetadata = function () {
        status.textContent = 'Position VIN inside the guide box. Scanning...';
        // Activate scanline animation
        if (!prefersReducedMotion()) {
          var scanline = document.getElementById('vinScannerScanline');
          if (scanline) {
            scanline.style.opacity = '1';
            scanline.style.animation = 'vinScanPulse 2s ease-in-out infinite';
          }
        }
        self._beginScan();
      };
    }).catch(function (err) {
      status.textContent = (err && err.name === 'NotAllowedError') ? 'Camera permission was blocked. Allow camera access for this site in your browser settings, upload a photo, or type the VIN.' : 'No camera is available right now. Upload a photo of the VIN or type it instead.';
      self._announce('Camera is not available. Please enter your VIN manually.');
    });
  };

  VINScanner.prototype._beginScan = function () {
    var self = this;
    self.scanning = true;
    self.results = [];
    var frameCount = 0;

    var video = document.getElementById('vinScannerVideo');
    var canvas = document.getElementById('vinScannerCanvas');
    var status = document.getElementById('vinScannerStatus');
    var confDiv = document.getElementById('vinScannerConfidence');
    var confBar = document.getElementById('vinScannerConfBar');
    var confPct = document.getElementById('vinScannerConfPct');

    // Guide box proportions (relative to video)
    var guideRect = { left: 0.075, top: 0.39, width: 0.85, height: 0.22 };

    // 1) Barcode first: keep looking for a VIN barcode the whole time the camera is open.
    self._barcodeHit = false;
    status.textContent = 'Looking for the VIN barcode\u2026 The barcode on the driver\u2019s door-jamb sticker works best.';
    function barcodeTick() {
      if (!self.scanning || self._barcodeHit || !self.stream) return;
      scanBarcode(video).then(function (vin) {
        if (vin && self.scanning && !self._barcodeHit) {
          self._barcodeHit = true; self.scanning = false;
          self._showConfirm(vin, 'barcode');
          document.getElementById('vinScannerRetry').style.display = 'inline-block';
          return;
        }
        setTimeout(barcodeTick, 250);
      });
    }
    barcodeTick();

    // 2) OCR fallback starts after a few seconds without a barcode.
    setTimeout(function () { if (self.scanning && !self._barcodeHit) startOCR(); }, 3500);
    function startOCR() {
    status.textContent = 'No barcode yet. Reading the VIN text too \u2014 fit it inside the box.';
    loadTesseract(function (err) {
      if (err) {
        status.textContent = 'OCR engine failed to load. Please enter VIN manually.';
        self._announce('OCR engine could not load. Please enter your VIN manually.');
        return;
      }

      function captureAndRecognize() {
        if (self._barcodeHit) return;
        if (!self.scanning || frameCount >= self.maxFrames) {
          self._evaluateResults();
          return;
        }
        var cfg = FRAME_PLANS[frameCount % FRAME_PLANS.length];
        var processed = preprocessFrame(video, canvas, guideRect, cfg[0]);
        if (!processed) {
          setTimeout(captureAndRecognize, 500);
          return;
        }

        status.textContent = 'Scanning frame ' + (frameCount + 1) + ' of ' + self.maxFrames + '...';
        confDiv.style.display = 'block';

        recognizeFrame(canvas, cfg[1]).then(function (result) {
          frameCount++;
          if (result.text) {
            self.results.push(result);
            var pct = Math.round(result.confidence);
            confBar.style.width = pct + '%';
            confPct.textContent = pct + '%';
          }

          if (frameCount < self.maxFrames) {
            // Delay between frames for better variety
            setTimeout(captureAndRecognize, 600);
          } else {
            self._evaluateResults();
          }
        });
      }

      captureAndRecognize();
    });
    }
  };

  VINScanner.prototype._evaluateResults = function () {
    var self = this;
    if (self._uploadMode || self._barcodeHit) return;
    self.scanning = false;
    var status = document.getElementById('vinScannerStatus');
    var resultDiv = document.getElementById('vinScannerResult');
    var resultText = document.getElementById('vinScannerResultText');
    var retryBtn = document.getElementById('vinScannerRetry');
    var confDiv = document.getElementById('vinScannerConfidence');
    var confBar = document.getElementById('vinScannerConfBar');
    var confPct = document.getElementById('vinScannerConfPct');

    var consensus = findConsensusVIN(self.results);

    if (consensus && consensus.text.length === VIN_LENGTH) {
      var pct = Math.round(consensus.confidence);
      confBar.style.width = pct + '%';
      confPct.textContent = pct + '%';
      confDiv.style.display = 'block';
      retryBtn.style.display = 'inline-block';
      self._showConfirm(consensus.text);
    } else {
      status.textContent = 'Could not read VIN. Please try again or enter manually.';
      retryBtn.style.display = 'inline-block';
      confDiv.style.display = 'none';
      self._announce('Could not read VIN. Please try again or enter your VIN manually.');
    }
  };

  // Confirm-or-edit step: the scan is never written to the form until the user accepts it.
  VINScanner.prototype._showConfirm = function (text, source) {
    var self = this;
    var status = document.getElementById('vinScannerStatus');
    var resultDiv = document.getElementById('vinScannerResult');
    var input = document.getElementById('vinScannerResultText');
    var check = document.getElementById('vinScannerCheck');
    var sug = document.getElementById('vinScannerSuggest');
    var confirmBtn = document.getElementById('vinScannerConfirm');
    function refresh() {
      var v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O|Q/g, '0').replace(/I/g, '1').slice(0, 17);
      if (v !== input.value) input.value = v;
      var ok = isValidVIN(v);
      resultDiv.style.borderColor = ok ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.45)';
      resultDiv.style.background = ok ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)';
      if (v.length !== 17) { check.style.color = '#fbbf24'; check.textContent = v.length + ' of 17 characters'; }
      else if (ok) { check.style.color = '#34d399'; check.textContent = 'Check digit matches. Compare it with the plate, then confirm.'; }
      else { check.style.color = '#fbbf24'; check.textContent = 'Check digit doesn\u2019t match: a character is probably misread (US/Canada VINs). Compare with the plate.'; }
      var list = (v.length === 17 && !ok) ? vinSuggestions(v, 2).slice(0, 3) : [];
      sug.innerHTML = '';
      if (list.length) {
        var lab = document.createElement('div'); lab.textContent = 'Did you mean:'; lab.style.cssText = 'color:rgba(160,170,184,0.85);font-size:11px;margin-bottom:4px;'; sug.appendChild(lab);
        list.forEach(function (c) {
          var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = c;
          bt.style.cssText = 'display:block;width:100%;margin:3px 0;padding:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-family:ui-monospace,monospace;font-size:14px;letter-spacing:0.08em;cursor:pointer;';
          bt.onclick = function () { input.value = c; refresh(); };
          sug.appendChild(bt);
        });
      }
      sug.style.display = list.length ? 'block' : 'none';
      confirmBtn.disabled = v.length !== 17; confirmBtn.style.opacity = v.length === 17 ? '1' : '0.5';
    }
    input.value = text;
    input.oninput = refresh;
    confirmBtn.onclick = function () {
      var v = input.value;
      if (v.length !== 17) return;
      self.close();
      self.targetInput.value = v;
      self.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      self.targetInput.dispatchEvent(new CustomEvent('vinscan:confirmed', { bubbles: true, detail: { vin: v } }));
    };
    resultDiv.style.display = 'block';
    refresh();
    var fromBc = source === 'barcode';
    status.textContent = fromBc ? (isValidVIN(input.value) ? 'VIN read from the barcode. Confirm it matches your sticker.' : 'Barcode read. Its check digit doesn\u2019t match (normal for some non-US vehicles), so compare it with the sticker.') : (isValidVIN(input.value) ? 'VIN read from the text. Please confirm it matches your plate.' : 'We read something. Check it against the plate and fix any wrong character.');
    self._announce((fromBc ? 'Barcode VIN ' : 'Scanned VIN ') + text.split('').join(' ') + '. Confirm or edit it.');
    setTimeout(function () { confirmBtn.focus(); }, 50);
  };

  VINScanner.prototype._handleFile = function (file) {
    var self = this;
    var status = document.getElementById('vinScannerStatus');
    var retryBtn = document.getElementById('vinScannerRetry');
    if (!file || !/^image\//.test(file.type || 'image/')) { status.textContent = 'That file isn\u2019t a photo. Choose a JPG or PNG of the VIN.'; return; }
    self.scanning = false;
    self._uploadMode = true;
    if (self.stream) { self.stream.getTracks().forEach(function (t) { t.stop(); }); self.stream = null; }
    status.textContent = 'Reading your photo\u2026 this can take a few seconds.';
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      loadTesseract(function (err) {
        if (err) { status.textContent = 'OCR engine failed to load. Please type the VIN.'; return; }
        scanBarcode(img, true).then(function (bcVin) {
          if (bcVin) { URL.revokeObjectURL(url); self._showConfirm(bcVin, 'barcode'); retryBtn.style.display = 'inline-block'; return null; }
          status.textContent = 'No barcode found in the photo. Reading the VIN text\u2026';
          return recognizeImage(img);
        }).then(function (res) {
          if (res === null) return;
          URL.revokeObjectURL(url);
          if (res && res.text && res.text.length === VIN_LENGTH) { self._showConfirm(res.text); }
          else { status.textContent = 'Couldn\u2019t find a 17-character VIN in that photo. Try a closer, straight-on shot, or type it.'; }
          retryBtn.style.display = 'inline-block';
        });
      });
    };
    img.onerror = function () { status.textContent = 'Couldn\u2019t open that photo. Try another one, or type the VIN.'; };
    img.src = url;
  };

  VINScanner.prototype._retry = function () {
    var resultDiv = document.getElementById('vinScannerResult');
    var retryBtn = document.getElementById('vinScannerRetry');
    var confDiv = document.getElementById('vinScannerConfidence');
    var confBar = document.getElementById('vinScannerConfBar');
    if (resultDiv) resultDiv.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'none';
    var useB = document.getElementById('vinScannerUse'); if (useB) useB.style.display = 'none';
    if (confDiv) confDiv.style.display = 'none';
    if (confBar) confBar.style.width = '0%';
    if (!this.stream) { this._startCamera(document.getElementById('vinScannerVideo'), document.getElementById('vinScannerStatus')); return; }
    this._beginScan();
  };

  VINScanner.prototype.close = function () {
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
      this.stream = null;
    }
    this.scanning = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    document.body.style.overflow = '';
    if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
    if (this._focusTrapHandler) document.removeEventListener('keydown', this._focusTrapHandler);
    this._announce('VIN scanner closed.');
    // Return focus to the scanner trigger button
    var triggerBtn = document.querySelector('[data-vin-scan]');
    if (triggerBtn) triggerBtn.focus();
  };

  VINScanner.prototype.destroy = function () {
    this.close();
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    var live = document.getElementById('vinScannerLive');
    if (live && live.parentNode) live.parentNode.removeChild(live);
  };

  /* ── Initialization ── */
  function initScannerButtons() {

    // Inject scanline keyframe into page
    if (!document.getElementById('vinScannerStyles')) {
      var style = document.createElement('style');
      style.id = 'vinScannerStyles';
      style.textContent =
        '@keyframes vinScanPulse{0%,100%{opacity:0.3;transform:translate(-50%,-50%) scaleX(0.8);}50%{opacity:1;transform:translate(-50%,-50%) scaleX(1);}}' +
        '@media(prefers-reduced-motion:reduce){#vinScannerScanline{animation:none!important;opacity:0!important;}}';
      document.head.appendChild(style);
    }

    // Find all scan buttons
    var scanBtns = document.querySelectorAll('[data-vin-scan]');
    scanBtns.forEach(function (btn) {
      btn.style.display = '';
      var inputId = btn.getAttribute('data-vin-scan');
      var input = document.getElementById(inputId);
      if (!input) return;

      var scanner = new VINScanner(input);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        scanner.open();
      });
    });

    // Mobile menu scanner item
    var mobileItem = document.getElementById('vinScannerMobileNav');
    if (mobileItem) {
      mobileItem.style.display = '';
      mobileItem.addEventListener('click', function (e) {
        e.preventDefault();
        // Close mobile menu
        var menu = document.getElementById('mobileMenu');
        var iconOpen = document.getElementById('menuIconOpen');
        var iconClose = document.getElementById('menuIconClose');
        if (menu) menu.classList.add('hidden');
        if (iconOpen) iconOpen.classList.remove('hidden');
        if (iconClose) iconClose.classList.add('hidden');

        // Scroll to nearest VIN input
        var vinInput = document.getElementById('vinInput');
        if (vinInput) {
          vinInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Trigger scanner after scroll
          setTimeout(function () {
            var btn = document.querySelector('[data-vin-scan]');
            if (btn) btn.click();
          }, 500);
        }
      });
    }
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScannerButtons);
  } else {
    initScannerButtons();
  }
})();
