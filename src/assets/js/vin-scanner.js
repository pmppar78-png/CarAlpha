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
          '<div style="color:rgba(160,170,184,0.7);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Detected VIN</div>' +
          '<div id="vinScannerResultText" style="color:#fff;font-size:18px;font-weight:800;font-family:ui-monospace,monospace;letter-spacing:0.12em;"></div>' +
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
  function preprocessFrame(video, canvas, guideRect) {
    var ctx = canvas.getContext('2d');
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;

    // Calculate bounding box region from guide overlay
    var sx = vw * guideRect.left;
    var sy = vh * guideRect.top;
    var sw = vw * guideRect.width;
    var sh = vh * guideRect.height;

    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

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
    for (var h = 0; h < d.length; h += 4) histogram[d[h]]++;
    var total = sw * sh;
    var sumAll = 0;
    for (var t = 0; t < 256; t++) sumAll += t * histogram[t];
    var sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (var tt = 0; tt < 256; tt++) {
      wB += histogram[tt];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += tt * histogram[tt];
      var mB = sumB / wB;
      var mF = (sumAll - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = tt; }
    }
    for (var b = 0; b < d.length; b += 4) {
      var bv = d[b] > threshold ? 255 : 0;
      d[b] = d[b + 1] = d[b + 2] = bv;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /* ── OCR Processing ── */
  function recognizeFrame(canvas) {
    if (!window.Tesseract) return Promise.resolve({ text: '', confidence: 0 });
    return window.Tesseract.recognize(canvas, 'eng', {
      tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: '7'
    }).then(function (result) {
      var raw = (result.data.text || '').replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
      return { text: raw, confidence: result.data.confidence || 0 };
    }).catch(function () {
      return { text: '', confidence: 0 };
    });
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
    if (self.overlay) { self._show(); return; }

    self.overlay = createModal();
    self._show();

    var closeBtn = document.getElementById('vinScannerClose');
    var retryBtn = document.getElementById('vinScannerRetry');
    var video = document.getElementById('vinScannerVideo');
    var status = document.getElementById('vinScannerStatus');

    closeBtn.addEventListener('click', function () { self.close(); });
    retryBtn.addEventListener('click', function () { self._retry(); });

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
      status.textContent = 'Camera access denied or unavailable. Please enter VIN manually.';
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

    loadTesseract(function (err) {
      if (err) {
        status.textContent = 'OCR engine failed to load. Please enter VIN manually.';
        self._announce('OCR engine could not load. Please enter your VIN manually.');
        return;
      }

      function captureAndRecognize() {
        if (!self.scanning || frameCount >= self.maxFrames) {
          self._evaluateResults();
          return;
        }
        var processed = preprocessFrame(video, canvas, guideRect);
        if (!processed) {
          setTimeout(captureAndRecognize, 500);
          return;
        }

        status.textContent = 'Scanning frame ' + (frameCount + 1) + ' of ' + self.maxFrames + '...';
        confDiv.style.display = 'block';

        recognizeFrame(canvas).then(function (result) {
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

      // Small delay so camera can focus
      setTimeout(captureAndRecognize, 1200);
    });
  };

  VINScanner.prototype._evaluateResults = function () {
    var self = this;
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
      var isValid = isValidVIN(consensus.text);
      var pct = Math.round(consensus.confidence);
      confBar.style.width = pct + '%';
      confPct.textContent = pct + '%';
      confDiv.style.display = 'block';

      if (isValid) {
        status.textContent = 'Valid VIN detected!';
        resultDiv.style.display = 'block';
        resultText.textContent = consensus.text;
        resultDiv.style.borderColor = 'rgba(52,211,153,0.4)';
        resultDiv.style.background = 'rgba(52,211,153,0.08)';
        self._announce('Valid VIN detected: ' + consensus.text.split('').join(' '));

        // Auto-populate and close after 1.5s
        setTimeout(function () {
          self.targetInput.value = consensus.text;
          self.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          self.close();
        }, 1500);
      } else {
        status.textContent = 'VIN detected but check digit invalid. Try again or enter manually.';
        resultDiv.style.display = 'block';
        resultText.textContent = consensus.text;
        resultDiv.style.borderColor = 'rgba(251,191,36,0.4)';
        resultDiv.style.background = 'rgba(251,191,36,0.08)';
        retryBtn.style.display = 'inline-block';
        self._announce('VIN detected but could not be validated. You may retry or enter the VIN manually.');
      }
    } else {
      status.textContent = 'Could not read VIN. Please try again or enter manually.';
      retryBtn.style.display = 'inline-block';
      confDiv.style.display = 'none';
      self._announce('Could not read VIN. Please try again or enter your VIN manually.');
    }
  };

  VINScanner.prototype._retry = function () {
    var resultDiv = document.getElementById('vinScannerResult');
    var retryBtn = document.getElementById('vinScannerRetry');
    var confDiv = document.getElementById('vinScannerConfidence');
    var confBar = document.getElementById('vinScannerConfBar');
    if (resultDiv) resultDiv.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'none';
    if (confDiv) confDiv.style.display = 'none';
    if (confBar) confBar.style.width = '0%';
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
    if (!hasCamera()) return;

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
