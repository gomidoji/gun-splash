/* ガン・スプラッシュ 復刻版 — ROM core
 * Plain classic script. Registers everything on window.GS.
 * Layers: bg1 / bg2 / obj / hud (256x224 each) -> composite (fx) -> #rom canvas (integer scale by shell).
 */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const W = 256, H = 224;
  const R = Math.round, F = Math.floor;

  // =====================================================================
  // constants
  // =====================================================================
  const PAL = {
    ink: '#101828', night: '#081828', band: '#182848', win: '#183040', frameHi: '#A8D0C8', frameLo: '#486878',
    white: '#F8F8F0', gray: '#8898A8', grayDk: '#586878', dim: '#384858',
    blue: '#6898F8', blueDk: '#284898', blueHi: '#B0D0F8',
    orange: '#F89048', orangeDk: '#A84828', orangeHi: '#F8C898',
    gold: '#F8D860', goldDk: '#A07020', goldHi: '#F8F0C0',
    danger: '#F85078', dangerDk: '#702030', dangerHi: '#F8C0C8',
    water: '#50D0C0', waterDk: '#287880', waterHi: '#B8F8E8',
    self: '#D0F090', neutral: '#E0D8A0', neutralDk: '#787860',
    waterShallow: '#88D8C0', waterDeep: '#185060', foam: '#E0F0D8',
    g1a: '#507068', g1b: '#98A878', g2a: '#406878', g2b: '#A0B8A0',
    g3a: '#706870', g3b: '#C0A080', g4a: '#485878', g4b: '#88A098',
    outside: '#183030', wallTop: '#809078', wallSide: '#404850', wallEdge: '#C0C8B0', wallShadow: '#304848',
    sand: '#B8B880', dry: '#485850', dry2: '#586858',
    pumpMetal: '#A8B0B8', pumpDk: '#586878', lever: '#F8D088', footOn: '#F8D860', footOff: '#485868',
    sky1: '#182850', sky2: '#303860', sky3: '#505078', sky4: '#907090', sky5: '#D89890', sun: '#F8C890',
    win1: '#3870C0', win2: '#A8E0F8', lose1: '#304048', lose2: '#687880', rain: '#98A8B8',
    // the title logo's face colour (a light gold, between gold and goldHi)
    cream: '#F8E8A0',
  };
  // HUD 3-colour sets [body, edge, light]
  const HUD = {
    H0: ['#F8F8F0', '#101828', '#8898A8'], H1: ['#6898F8', '#101828', '#B0D0F8'],
    H2: ['#F89048', '#101828', '#F8C898'], H3: ['#F8D860', '#101828', '#A07020'],
    H4: ['#F85078', '#101828', '#F8C0C8'], H5: ['#50D0C0', '#101828', '#B8F8E8'],
    H6: ['#183040', '#486878', '#A8D0C8'], H7: ['#D0F090', '#101828', '#E0D8A0'],
    HL: ['#8898A8', '#101828', '#586878'],   // light-gray text (©, defeated rows)
    HK: ['#101828', '#101828', '#384858'],   // ink text (e.g. "×2" on a danger plate; use style:'plain')
  };
  // Band colours for B16 / B32 / D16 (top=hi, middle=body, bottom=lo).
  const HUDBAND = {
    H0: [PAL.white, PAL.white, PAL.gray], H1: [PAL.blueHi, PAL.blue, PAL.blueDk],
    H2: [PAL.orangeHi, PAL.orange, PAL.orangeDk], H3: [PAL.goldHi, PAL.gold, PAL.goldDk],
    H4: [PAL.dangerHi, PAL.danger, PAL.dangerDk], H5: [PAL.waterHi, PAL.water, PAL.waterDk],
    H6: [PAL.frameHi, PAL.frameLo, PAL.win], H7: [PAL.white, PAL.self, PAL.neutralDk],
    HL: [PAL.gray, PAL.gray, PAL.grayDk], HK: [PAL.dim, PAL.ink, PAL.ink],
  };

  const OBJ_BLUE = [null, '#102040', '#4880E0', '#88B8F8', '#2850A0', '#283048', '#D8F8F8', '#F8D088', '#F8E8B0',
    '#C8D8D8', '#485868', '#50D0C0', '#B8F8E8', '#E8E8E0', '#8898A8', '#101828'];
  const OBJPAL = {};
  function palIndex(k) { return /^[a-f]$/i.test(k) ? parseInt(k, 16) : +k; }
  function makePal(base, over) {
    const b = Array.isArray(base) ? base.slice() : (OBJPAL[base] || OBJ_BLUE).slice();
    if (over) for (const k in over) b[palIndex(k)] = col(over[k]);
    return b;
  }
  OBJPAL.blue = OBJ_BLUE.slice();
  OBJPAL.orange = makePal('blue', { 2: '#E87048', 3: '#F8B888', 4: '#A84030' });
  OBJPAL.blueGold = makePal('blue', { 1: '#F8D860' });
  OBJPAL.orangeGold = makePal('orange', { 1: '#F8D860' });
  OBJPAL.flash = OBJ_BLUE.map((c, i) => (i ? '#F8F8F0' : null));
  const GRAY_RAMP = ['#101828', '#384858', '#586878', '#8898A8', '#A8B0B8', '#C8D8D8'];
  OBJPAL.gray = OBJ_BLUE.map((c, i) => {
    if (!i) return null;
    const [r, g, b] = rgb(c); const y = 0.299 * r + 0.587 * g + 0.114 * b;
    return GRAY_RAMP[Math.min(5, F(y / 256 * 6))];
  });
  // UI tints: slots 1 outline / 2 body / 3 highlight / 4 shade (rest = blue palette).
  const tint = (c2, c3, c4, c1) => makePal('blue', { 1: c1 || PAL.ink, 2: c2, 3: c3, 4: c4 });
  OBJPAL.gold = tint(PAL.gold, PAL.goldHi, PAL.goldDk);
  OBJPAL.white = tint(PAL.white, PAL.waterHi, PAL.gray);
  OBJPAL.cursor = OBJPAL.white;
  OBJPAL.water = tint(PAL.water, PAL.waterHi, PAL.waterDk, PAL.waterDeep);
  OBJPAL.danger = tint(PAL.danger, PAL.dangerHi, PAL.dangerDk);
  OBJPAL.neutral = tint(PAL.neutral, PAL.goldHi, PAL.neutralDk);
  OBJPAL.self = tint(PAL.self, PAL.white, PAL.neutralDk);
  OBJPAL.blueUI = tint(PAL.blue, PAL.blueHi, PAL.blueDk);
  OBJPAL.orangeUI = tint(PAL.orange, PAL.orangeHi, PAL.orangeDk);
  OBJPAL.grayUI = tint(PAL.gray, PAL.white, PAL.grayDk);
  OBJPAL.dimUI = tint(PAL.grayDk, PAL.gray, PAL.dim);
  OBJPAL.pump = makePal('blue', { 1: PAL.ink, 2: PAL.pumpMetal, 3: PAL.white, 4: PAL.pumpDk, 7: PAL.lever });
  OBJPAL.footOn = tint(PAL.footOn, PAL.goldHi, PAL.goldDk);
  OBJPAL.footOff = tint(PAL.footOff, PAL.grayDk, PAL.dim);

  const KANJI = '雨水中央陣地確保秒庭辺斜路貯区道左右大小半上下交代立北南東西枯体力通常弾発選択決着一戦先';
  // action-safe / title-safe areas (drawn by the MOCK panel's grid overlay, see composite())
  const SAFE = { action: { x: 8, y: 8, w: 240, h: 208 }, title: { x: 16, y: 16, w: 224, h: 192 } };

  Object.assign(GS, {
    W, H,
    PAL, HUD, KANJI,
    NAME8: ['YOU', 'AO', 'MIO', 'KAI', 'REN', 'NAGI'],
    NAME16: ['YOU', 'アオ', 'ミオ', 'カイ', 'レン', 'ナギ'],
    DEBUG: /[?&]debug=1/.test(location.search),
    makePal,
  });
  GS.state = Object.assign({
    frame: 0, reduced: false, sound: 0, bgm: true, warnSound: true, stereo: true, display: 'dot', scaleMode: 'auto',
    layout: 'pc', touch: false, freeze: false, fontFallback: false,
    grid: false, manualOpen: false, settingsOpen: false, subtitles: false,
  }, GS.state || {});

  // Saved viewer settings (localStorage, JSON) for shell.js and manual.js. Only the keys of `defaults` are read, and a
  // saved value is kept only when it fits: for a boolean default a boolean; for a key in `choices` one of its values
  // (an array) or a string its RegExp matches; otherwise a value of the default's type. Anything else (an old,
  // hand-edited or foreign entry: under file:// all local pages share one localStorage) falls back to the default,
  // so a bad entry can never stop a page from starting.
  GS.loadPrefs = function (key, defaults, choices) {
    const out = Object.assign({}, defaults);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { /* storage unavailable or not JSON */ }
    if (!saved || typeof saved !== 'object') return out;
    Object.keys(defaults).forEach(k => {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) return;
      const v = saved[k], d = defaults[k], c = choices && choices[k];
      const ok = typeof d === 'boolean' ? typeof v === 'boolean'
        : Array.isArray(c) ? c.indexOf(v) >= 0
        : c instanceof RegExp ? typeof v === 'string' && c.test(v)
        : typeof v === typeof d;
      if (ok) out[k] = v;
    });
    return out;
  };
  // ... and the write (JSON). Where storage is unavailable the values last while the page is open.
  GS.savePrefs = function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  };

  // ---------------------------------------------------------------------
  // Boot gate. Every page that loads this script brings the game rules (index.html and manual.html, both marked
  // <html data-live>): the ES-module bridge app.mjs (or manual.html's own module; deferred, so after every classic
  // script) calls GS.installApp(app). Until then the ROM loop (GS.boot), the launcher's power-on and the hash
  // routes wait. Classic scripts that need the real rules (e.g. stage data from game.mjs) register
  // GS.whenReady(fn): fn(app) runs once, in registration order, inside installApp — before GS.boot resolves and
  // before the first ROM frame. A fn registered after installApp runs at once.
  // ---------------------------------------------------------------------
  let appReady = false, appResolve = null;
  const appReadyP = new Promise(r => { appResolve = r; });
  const readyQueue = [];
  GS.isReady = () => appReady;
  GS.appReady = appReadyP;   // resolves with GS.app once installed (for scripts / automation that must wait)
  GS.whenReady = function (fn) {
    if (appReady) fn(GS.app);
    else readyQueue.push(fn);
  };
  GS.installApp = function (app) {
    if (appReady && GS.app) { console.warn('[GS] installApp called twice; replacing GS.app'); GS.app = app; return app; }
    GS.app = app; appReady = true;
    while (readyQueue.length) { const fn = readyQueue.shift(); try { fn(app); } catch (e) { console.error('[GS] whenReady', e); } }
    if (appResolve) { appResolve(app); appResolve = null; }
    GS.dirty = true;
    return app;
  };

  // =====================================================================
  // colour helpers
  // =====================================================================
  function col(c) { return (c && PAL[c]) || c; }
  function rgb(hex) {
    const h = String(col(hex)).replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(r, g, b) { return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase(); }
  function q8(v) { return Math.max(0, Math.min(248, R(v / 8) * 8)); }
  function quant(c) { const [r, g, b] = rgb(c); return hex(q8(r), q8(g), q8(b)); }
  GS.rgb = rgb;

  const ALLOWED = new Set();
  function collectAllowed() {
    ALLOWED.clear();
    Object.values(PAL).forEach(c => ALLOWED.add(c.toUpperCase()));
    Object.values(HUD).forEach(a => a.forEach(c => ALLOWED.add(c.toUpperCase())));
    Object.values(OBJPAL).forEach(a => a.forEach(c => c && ALLOWED.add(c.toUpperCase())));
  }
  collectAllowed();
  const warned = new Set();
  function warnOnce(key, ...msg) { if (warned.has(key)) return; warned.add(key); console.warn('[GS]', ...msg); }
  GS.warnOnce = warnOnce;
  function chk(c) {
    if (!GS.DEBUG || typeof c !== 'string') return;
    if (!ALLOWED.has(c.toUpperCase())) warnOnce('pal:' + c, 'colour outside PAL / HUD / OBJPAL (core.js):', c);
  }

  // =====================================================================
  // canvases
  // =====================================================================
  function mk(w, h) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c;
  }
  function ctx2d(c, read) {
    const x = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
    x.imageSmoothingEnabled = false; return x;
  }
  GS.makeCanvas = mk;

  const layerCanvas = {};
  const L = {};
  ['bg1', 'bg2', 'obj', 'hud'].forEach(k => { layerCanvas[k] = mk(W, H); L[k] = ctx2d(layerCanvas[k]); });
  GS.layers = L;
  GS.layerCanvas = layerCanvas;
  const bgBuf = mk(W, H), bgx = ctx2d(bgBuf);
  const tmpBuf = mk(W, H), tmpx = ctx2d(tmpBuf);
  const frameBuf = mk(W, H), framex = ctx2d(frameBuf);
  GS.frameCanvas = frameBuf;

  function clearLayers() {
    for (const k in L) { L[k].setTransform(1, 0, 0, 1, 0, 0); L[k].globalAlpha = 1; L[k].globalCompositeOperation = 'source-over'; L[k].clearRect(0, 0, W, H); L[k].imageSmoothingEnabled = false; }
    L.bg1.fillStyle = PAL.ink; L.bg1.fillRect(0, 0, W, H);
  }

  // =====================================================================
  // effects and time helpers
  // =====================================================================
  function defaultFx() { return { bright: 15, mosaic: 1, iris: null, wave: null, dim: false, dimTarget: 'bgobj', flash: 0, shake: [0, 0] }; }
  GS.fx = defaultFx();
  function resetFx() { Object.assign(GS.fx, defaultFx()); shakeT = 0; }

  GS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  GS.step = (t, start, dur) => (dur <= 0 ? (t >= start ? 1 : 0) : GS.clamp((t - start) / dur, 0, 1));
  GS.ease = { out: x => 1 - (1 - x) * (1 - x) };
  // Blinking (on/off phases >= 10f). Reduced motion: always "on".
  GS.blink = function (t, on, off, phase) {
    if (GS.DEBUG && (on < 10 || off < 10)) warnOnce('blink' + on + '/' + off, 'blink phase < 10f:', on, off);
    if (GS.state.reduced) return true;
    const p = on + off; return ((((t + (phase || 0)) % p) + p) % p) < on;
  };
  // Alternation between two states every `period` frames (contest colours etc.). Not disabled by reduced motion.
  GS.alt = (t, period, phase) => (F((t + (phase || 0)) / period) & 1) === 0;

  // --- transitions --------------------------------------------------------
  let trs = [];
  function maxRadius(x, y) { return Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y))) + 1; }
  // kinds: fadeOut / fadeIn / pageOut / pageIn (brightness), mosaicOut (mosaic + fade to black), irisClose (circle
  // closing on opts.x / opts.y, default 128 / 112, from radius opts.r0, default the farthest corner).
  // opts.frames overrides the length. Reduced motion: mosaicOut and irisClose become a 16f fadeOut.
  GS.transition = function (kind, opts) {
    opts = Object.assign({}, opts || {});
    let k = kind;
    if (GS.state.reduced && (k === 'mosaicOut' || k === 'irisClose')) { k = 'fadeOut'; opts.frames = 16; }
    const fx = GS.fx;
    const defs = { fadeOut: 32, fadeIn: 32, mosaicOut: 32, irisClose: 32, pageOut: 8, pageIn: 8 };
    if (!(k in defs)) { console.warn('[GS] unknown transition', kind); return Promise.resolve(); }
    const frames = Math.max(1, opts.frames || defs[k]);
    const ix = opts.x == null ? 128 : opts.x, iy = opts.y == null ? 112 : opts.y;
    // initial state (applied synchronously so no wrong frame is shown)
    if (k === 'fadeIn' || k === 'pageIn') fx.bright = 0;
    return new Promise(resolve => {
      const tr = { t: 0, frames, resolve, tick() {
        this.t++;
        const p = Math.min(1, this.t / frames), s = F(15 * p + 1e-6);
        switch (k) {
          case 'fadeOut': case 'pageOut': fx.bright = 15 - s; break;
          case 'fadeIn': case 'pageIn': fx.bright = s; break;
          case 'mosaicOut': fx.mosaic = 1 + s; fx.bright = 15 - s; break;
          case 'irisClose': { const r0 = opts.r0 == null ? maxRadius(ix, iy) : opts.r0; fx.iris = { x: ix, y: iy, r: R(r0 * (1 - p)) }; break; }
        }
        return p >= 1;
      } };
      trs.push(tr);
    });
  };
  // Screen shake for bg + obj. Skipped with reduced motion.
  let shakeT = 0, shakeA = 2;
  GS.shake = function (px, frames) { if (GS.state.reduced) return; shakeA = px || 2; shakeT = frames || 4; };
  function tickFx() {
    if (trs.length) {
      const list = trs; trs = [];
      for (const tr of list) { if (tr.tick()) tr.resolve(); else trs.push(tr); }
    }
    if (shakeT > 0) { shakeT--; GS.fx.shake = shakeT > 0 ? [(shakeT & 1) ? shakeA : -shakeA, 0] : [0, 0]; }
  }

  // =====================================================================
  // primitives (integer coordinates)
  // =====================================================================
  GS.rect = function (c, x, y, w, h, cl) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    if (!w || !h) return; const cc = col(cl); chk(cc); c.fillStyle = cc; c.fillRect(x, y, w, h);
  };
  GS.px = function (c, x, y, cl) { const cc = col(cl); chk(cc); c.fillStyle = cc; c.fillRect(R(x), R(y), 1, 1); };
  GS.half = function (c, x, y, w, h, cl) {
    const a = c.globalAlpha; c.globalAlpha = a * 0.5; GS.rect(c, x, y, w, h, cl || 'ink'); c.globalAlpha = a;
  };
  function dashOf(d) { if (!d) return null; return Array.isArray(d) ? [d[0], d[1] == null ? d[0] : d[1]] : [d, d]; }
  GS.line = function (c, x0, y0, x1, y1, cl, opts) {
    opts = opts || {};
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
    const dash = dashOf(opts.dash), off = opts.dashOffset || 0, w = Math.max(1, opts.w | 0 || 1), h0 = (w - 1) >> 1;
    const cc = col(cl); chk(cc); c.fillStyle = cc;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, i = 0;
    for (let guard = 0; guard < 4096; guard++) {
      if (!dash || (((i + off) % (dash[0] + dash[1])) + (dash[0] + dash[1])) % (dash[0] + dash[1]) < dash[0]) c.fillRect(x0 - h0, y0 - h0, w, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      i++;
    }
  };
  // Half widths per row (dy = -ry..ry) of a midpoint-style ellipse.
  function spans(rx, ry) {
    const out = [];
    for (let dy = -ry; dy <= ry; dy++) {
      const v = 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5));
      out.push(F((rx + 0.5) * Math.sqrt(Math.max(0, v))));
    }
    return out;
  }
  function shapeE(c, cx, cy, rx, ry, cl, opts) {
    opts = opts || {};
    cx = R(cx); cy = R(cy); rx = Math.max(0, R(rx)); ry = Math.max(0, R(ry));
    const cc = col(cl); chk(cc); c.fillStyle = cc;
    const a0 = c.globalAlpha; if (opts.half) c.globalAlpha = a0 * 0.5;
    const s = spans(rx, ry);
    if (opts.fill) {
      for (let j = 0; j < s.length; j++) c.fillRect(cx - s[j], cy - ry + j, s[j] * 2 + 1, 1);
    } else {
      const dash = dashOf(opts.dash), per = dash ? dash[0] + dash[1] : 0, off = opts.dashOffset || 0, rm = (rx + ry) / 2 || 1;
      for (let j = 0; j < s.length; j++) {
        const hw = s[j], prev = j > 0 ? s[j - 1] : -1, next = j < s.length - 1 ? s[j + 1] : -1;
        const m = Math.min(hw, Math.min(prev, next) + 1), dy = j - ry;
        for (let x = Math.max(0, m); x <= hw; x++) {
          for (const sgn of x === 0 ? [1] : [1, -1]) {
            if (dash) {
              let a = Math.atan2(dy, sgn * x); if (a < 0) a += Math.PI * 2;
              if (((F(a * rm + off) % per) + per) % per >= dash[0]) continue;
            }
            c.fillRect(cx + sgn * x, cy + dy, 1, 1);
          }
        }
      }
    }
    c.globalAlpha = a0;
  }
  GS.circle = (c, cx, cy, r, cl, opts) => shapeE(c, cx, cy, r, r, cl, opts);
  GS.ellipse = (c, cx, cy, rx, ry, cl, opts) => shapeE(c, cx, cy, rx, ry, cl, opts);

  function lerpCol(a, b, t) { const A = rgb(a), B = rgb(b); return hex(R(A[0] + (B[0] - A[0]) * t), R(A[1] + (B[1] - A[1]) * t), R(A[2] + (B[2] - A[2]) * t)); }
  function stopsAt(stops, p) {
    const st = stops.map((s, i) => (Array.isArray(s) ? [s[0], col(s[1])] : [stops.length === 1 ? 0 : i / (stops.length - 1), col(s)]));
    if (p <= st[0][0]) return st[0][1];
    for (let i = 1; i < st.length; i++) if (p <= st[i][0]) { const a = st[i - 1], b = st[i]; return lerpCol(a[1], b[1], (p - a[0]) / ((b[0] - a[0]) || 1)); }
    return st[st.length - 1][1];
  }
  // Vertical gradient in 8-line bands, rows y0..y1 INCLUSIVE, each band colour quantised to 15-bit.
  GS.gradRows = function (c, y0, y1, stops, opts) {
    opts = opts || {}; const x = opts.x || 0, w = opts.w == null ? W : opts.w, band = opts.band || 8;
    y0 = R(y0); y1 = R(y1); const total = y1 - y0 + 1; const nb = Math.ceil(total / band);
    for (let i = 0; i < nb; i++) {
      const y = y0 + i * band, h = Math.min(band, y1 - y + 1);
      c.fillStyle = quant(stopsAt(stops, nb > 1 ? i / (nb - 1) : 0)); c.fillRect(x, y, w, h);
    }
  };
  // Pixelate a region in place (block origin = region top-left; top-left sampling).
  function mosaicInto(srcCanvas, sctx, x, y, w, h, m) {
    m = Math.max(1, m | 0); if (m <= 1) return;
    tmpx.clearRect(0, 0, W, H);
    for (let bx = 0; bx < w; bx += m) tmpx.drawImage(srcCanvas, x + bx, y, 1, h, bx, 0, Math.min(m, w - bx), h);
    sctx.clearRect(x, y, w, h);
    for (let by = 0; by < h; by += m) sctx.drawImage(tmpBuf, 0, by, w, 1, x, y + by, w, Math.min(m, h - by));
  }
  GS.mosaicRegion = function (c, x, y, w, h, m) { x = R(x); y = R(y); w = Math.min(W, R(w)); h = Math.min(H, R(h)); mosaicInto(c.canvas, c, x, y, w, h, m); };

  // =====================================================================
  // fonts
  // =====================================================================
  // ---- F8: hand-made 8x8 bitmap (glyph 7x7, right/bottom column empty) ----
  const F8SRC = {
    ' ': ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
    A: ['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##'],
    B: ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '######.'],
    C: ['.#####.', '##...##', '##.....', '##.....', '##.....', '##...##', '.#####.'],
    D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##..##.', '#####..'],
    E: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
    F: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '##.....'],
    G: ['.#####.', '##...##', '##.....', '##.####', '##...##', '##...##', '.######'],
    H: ['##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
    I: ['######.', '..##...', '..##...', '..##...', '..##...', '..##...', '######.'],
    J: ['..#####', '....##.', '....##.', '....##.', '##..##.', '##..##.', '.####..'],
    K: ['##...##', '##..##.', '##.##..', '####...', '##.##..', '##..##.', '##...##'],
    L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######'],
    M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
    N: ['##...##', '###..##', '####.##', '##.####', '##..###', '##...##', '##...##'],
    O: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
    P: ['######.', '##...##', '##...##', '######.', '##.....', '##.....', '##.....'],
    Q: ['.#####.', '##...##', '##...##', '##...##', '##.#.##', '##..##.', '.###.##'],
    R: ['######.', '##...##', '##...##', '######.', '##.##..', '##..##.', '##...##'],
    S: ['.#####.', '##...##', '##.....', '.#####.', '.....##', '##...##', '.#####.'],
    T: ['######.', '..##...', '..##...', '..##...', '..##...', '..##...', '..##...'],
    U: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
    V: ['##...##', '##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'],
    W: ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
    X: ['##...##', '.##.##.', '..###..', '...#...', '..###..', '.##.##.', '##...##'],
    Y: ['##...##', '##...##', '.##.##.', '..###..', '..###..', '..###..', '..###..'],
    Z: ['#######', '....##.', '...##..', '..##...', '.##....', '##.....', '#######'],
    0: ['.#####.', '##...##', '##..###', '##.#.##', '###..##', '##...##', '.#####.'],
    1: ['..##...', '.###...', '..##...', '..##...', '..##...', '..##...', '.####..'],
    2: ['.#####.', '##...##', '.....##', '..####.', '.##....', '##.....', '#######'],
    3: ['.#####.', '##...##', '.....##', '..####.', '.....##', '##...##', '.#####.'],
    4: ['...###.', '..####.', '.##.##.', '##..##.', '#######', '....##.', '....##.'],
    5: ['#######', '##.....', '######.', '.....##', '.....##', '##...##', '.#####.'],
    6: ['.#####.', '##.....', '##.....', '######.', '##...##', '##...##', '.#####.'],
    7: ['#######', '##...##', '....##.', '...##..', '..##...', '..##...', '..##...'],
    8: ['.#####.', '##...##', '##...##', '.#####.', '##...##', '##...##', '.#####.'],
    9: ['.#####.', '##...##', '##...##', '.######', '.....##', '.....##', '.#####.'],
    '!': ['..##...', '..##...', '..##...', '..##...', '..##...', '.......', '..##...'],
    '?': ['.#####.', '##...##', '....##.', '...##..', '...##..', '.......', '...##..'],
    '.': ['.......', '.......', '.......', '.......', '.......', '..##...', '..##...'],
    ',': ['.......', '.......', '.......', '.......', '..##...', '..##...', '.##....'],
    ':': ['.......', '..##...', '..##...', '.......', '..##...', '..##...', '.......'],
    ';': ['.......', '..##...', '..##...', '.......', '..##...', '..##...', '.##....'],
    '/': ['.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '#......'],
    '-': ['.......', '.......', '.......', '.#####.', '.......', '.......', '.......'],
    '+': ['.......', '..##...', '..##...', '######.', '..##...', '..##...', '.......'],
    '×': ['.......', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '.......'],
    "'": ['..##...', '..##...', '.##....', '.......', '.......', '.......', '.......'],
    '"': ['##.##..', '##.##..', '#..#...', '.......', '.......', '.......', '.......'],
    '(': ['...##..', '..##...', '.##....', '.##....', '.##....', '..##...', '...##..'],
    ')': ['.##....', '..##...', '...##..', '...##..', '...##..', '..##...', '.##....'],
    '[': ['.####..', '.##....', '.##....', '.##....', '.##....', '.##....', '.####..'],
    ']': ['.####..', '...##..', '...##..', '...##..', '...##..', '...##..', '.####..'],
    '%': ['##....#', '##...##', '....##.', '...##..', '..##...', '.##..##', '##...##'],
    '©': ['.#####.', '#.....#', '#.###.#', '#.#...#', '#.###.#', '#.....#', '.#####.'],
    '★': ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
    '☆': ['...#...', '..#.#..', '##...##', '.#...#.', '..###..', '.##.##.', '##...##'],
    '●': ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
    '○': ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
    '△': ['...#...', '..#.#..', '..#.#..', '.#...#.', '.#...#.', '#.....#', '#######'],
    '▲': ['...#...', '..###..', '..###..', '.#####.', '.#####.', '#######', '#######'],
    '▼': ['#######', '#######', '.#####.', '.#####.', '..###..', '..###..', '...#...'],
    '▶': ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
    '◀': ['.....##', '...####', '.######', '#######', '.######', '...####', '.....##'],
    '…': ['.......', '.......', '.......', '.......', '.......', '#..#..#', '#..#..#'],
    '─': ['........', '........', '........', '########', '........', '........', '........'],
    '・': ['.......', '.......', '.......', '..##...', '..##...', '.......', '.......'],
    '=': ['.......', '.......', '.#####.', '.......', '.#####.', '.......', '.......'],
    '<': ['....##.', '...##..', '..##...', '.##....', '..##...', '...##..', '....##.'],
    '>': ['.##....', '..##...', '...##..', '....##.', '...##..', '..##...', '.##....'],
    '#': ['.##.##.', '#######', '.##.##.', '.##.##.', '.##.##.', '#######', '.##.##.'],
    '_': ['.......', '.......', '.......', '.......', '.......', '.......', '#######'],
    '*': ['.......', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '.......'],
    '›': ['.......', '.##....', '..##...', '...##..', '..##...', '.##....', '.......'],
    '□': ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'], // □ (unknown glyph)
  };
  const F8 = {};
  for (const k in F8SRC) {
    const rows = F8SRC[k].map(r => (r + '........').slice(0, 8)); rows.push('........');
    F8[k] = rows.map(r => Array.from(r, ch => ch === '#'));
  }
  function f8glyph(ch) {
    let g = F8[ch];
    if (!g) { const u = ch.toUpperCase(); g = F8[u]; }
    if (!g) { warnOnce('f8:' + ch, 'F8 has no glyph for', JSON.stringify(ch)); g = F8['□']; }
    return g;
  }

  function resolveSet(set) {
    if (Array.isArray(set)) return { body: col(set[0]), edge: col(set[1] || PAL.ink), light: col(set[2] || set[0]), band: [col(set[3] || set[2] || set[0]), col(set[0]), col(set[4] || set[1] || set[0])], key: set.join(',') };
    const k = set || 'H0';
    if (HUD[k]) return { body: HUD[k][0], edge: HUD[k][1], light: HUD[k][2], band: HUDBAND[k], key: k };
    const c = col(k);
    return { body: c, edge: PAL.ink, light: c, band: [c, c, c], key: c };
  }

  const glyphCache = new Map();
  // Paint a boolean bitmap (w x h, rows of booleans or a fn) with style into a new canvas with 1px (or m px) margin.
  // outsideOnly: the shadow / outline is only drawn on pixels 4-connected to the glyph's outside, never inside a
  // closed counter (used for thin glyphs such as ©, whose 1px counters would otherwise fill up with ink).
  function paintBitmap(w, h, on, colorAt, edge, style, margin, outsideOnly) {
    const m = margin == null ? 1 : margin;
    const CW = w + m * 2, CH = h + m * 2;
    const c = mk(CW, CH), x = c.getContext('2d');
    let edgeOk = () => true;
    if (edge && outsideOnly) {
      const out = new Uint8Array(CW * CH), isOn = (X, Y) => X >= m && Y >= m && X < w + m && Y < h + m && on(X - m, Y - m);
      const stack = [];
      for (let X = 0; X < CW; X++) stack.push([X, 0], [X, CH - 1]);
      for (let Y = 0; Y < CH; Y++) stack.push([0, Y], [CW - 1, Y]);
      while (stack.length) {
        const [X, Y] = stack.pop();
        if (X < 0 || Y < 0 || X >= CW || Y >= CH || out[Y * CW + X] || isOn(X, Y)) continue;
        out[Y * CW + X] = 1; stack.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]);
      }
      edgeOk = (X, Y) => X >= 0 && Y >= 0 && X < CW && Y < CH && out[Y * CW + X] === 1;
    }
    const dot = (X, Y) => { if (edgeOk(X, Y)) x.fillRect(X, Y, 1, 1); };
    if (edge && style === 'shadow') { x.fillStyle = edge; for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (on(i, y)) dot(i + m + 1, y + m + 1); }
    if (edge && style === 'outline') {
      x.fillStyle = edge;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (on(i, y)) { dot(i + m - 1, y + m); dot(i + m + 1, y + m); dot(i + m, y + m - 1); dot(i + m, y + m + 1); }
    }
    if (edge && style === 'outline2') {
      x.fillStyle = edge;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (on(i, y)) x.fillRect(i + m - 2, y + m - 2, 5, 5);
    }
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (on(i, y)) { x.fillStyle = colorAt(i, y); x.fillRect(i + m, y + m, 1, 1); }
    return c;
  }
  const F8THIN = new Set(['©']); // 1px strokes with 1px counters: edge only on the outside
  function textAlignX(x, w, align) { return align === 'center' ? x - (w >> 1) : align === 'right' ? x - w : x; }

  GS.text8 = function (c, str, x, y, opts) {
    opts = opts || {};
    const s = Array.from(String(str)), st = resolveSet(opts.set), style = opts.style || 'shadow';
    const w = s.length * 8; let dx = R(textAlignX(x, w, opts.align)); y = R(y);
    for (const ch of s) {
      if (ch !== ' ') {
        const key = 'f8|' + ch + '|' + st.key + '|' + style;
        let g = glyphCache.get(key);
        if (!g) { const bm = f8glyph(ch); g = paintBitmap(8, 8, (i, j) => bm[j][i], () => st.body, style === 'plain' ? null : st.edge, style, 1, F8THIN.has(ch)); glyphCache.set(key, g); }
        c.drawImage(g, dx - 1, y - 1);
      }
      dx += 8;
    }
    return w;
  };

  // D16: 8x16 digits (F8 doubled vertically; top half hi colour, bottom half body, 1px shadow).
  // Punctuation is not stretched: '.' / ':' / ',' keep 2x2 dots (on the digit baseline / at 1/3 and 2/3) in the body colour,
  // so "30.0" never reads as "30,0" or "30!0".
  const D16PUNCT = {
    '.': [[12, 2], [13, 2]],
    ',': [[11, 2], [12, 2], [13, 1]],
    ':': [[4, 2], [5, 2], [10, 2], [11, 2]],
  };
  function d16on(ch) {
    const p = D16PUNCT[ch];
    if (p) { const rows = new Map(p.map(([r, x0]) => [r, x0])); return (i, j) => rows.has(j) && i >= rows.get(j) && i < rows.get(j) + 2; }
    const bm = f8glyph(ch); return (i, j) => bm[j >> 1][i];
  }
  GS.digits16 = function (c, str, x, y, set, opts) {
    opts = opts || {};
    const s = Array.from(String(str)), st = resolveSet(set);
    const w = s.length * 8; let dx = R(textAlignX(x, w, opts.align)); y = R(y);
    for (const ch of s) {
      if (ch !== ' ') {
        const key = 'd16|' + ch + '|' + st.key;
        let g = glyphCache.get(key);
        if (!g) { const punct = !!D16PUNCT[ch]; g = paintBitmap(8, 16, d16on(ch), (i, j) => (punct || j >= 7 ? st.band[1] : st.band[0]), st.edge, 'shadow', 1); glyphCache.set(key, g); }
        c.drawImage(g, dx - 1, y - 1);
      }
      dx += 8;
    }
    return w;
  };
  // B16 (size 16) / B32 (size 32) banner letters.
  GS.banner = function (c, str, x, y, opts) {
    opts = opts || {};
    const size = opts.size === 32 ? 32 : 16, k = size / 8, st = resolveSet(opts.set);
    const s = Array.from(String(str)); const w = s.length * size;
    let dx = R(textAlignX(x, w, opts.align)); y = R(y);
    for (const ch of s) {
      if (ch !== ' ') {
        const key = 'b' + size + '|' + ch + '|' + st.key;
        let g = glyphCache.get(key);
        if (!g) {
          const bm = f8glyph(ch), band = j => { const r = F(j / k); return r <= 1 ? st.band[0] : r <= 4 ? st.band[1] : st.band[2]; };
          if (size === 16) g = paintBitmap(16, 16, (i, j) => bm[F(j / 2)][F(i / 2)], (i, j) => band(j), st.edge, 'shadow', 1);
          else g = paintBitmap(32, 32, (i, j) => { const a = i - 2, b = j - 2; return a >= 0 && b >= 0 && a < 28 && b < 28 && bm[F(b / 4)][F(a / 4)]; }, (i, j) => band(j - 2), st.edge, 'outline2', 1);
          glyphCache.set(key, g);
        }
        c.drawImage(g, dx - 1, y - 1);
      }
      dx += size;
    }
    return w;
  };

  // ---- J16: DotGothic16 as 1-bit glyphs (js/j16-atlas.js, else binarised from the font at run time) ----
  const J16 = { family: '"DotGothic16"', masks: new Map(), ready: false, dy: 0 };
  const jScratch = mk(32, 32), jctx = ctx2d(jScratch, true);
  // the characters the web font is asked for up front (loadDot): kana, the kanji whitelist, punctuation, ASCII
  let REP = '';
  (function () {
    for (let c = 0x3041; c <= 0x3096; c++) REP += String.fromCharCode(c);
    for (let c = 0x30A1; c <= 0x30FC; c++) REP += String.fromCharCode(c);
    REP += KANJI + '、。…！？「」×';
    for (let c = 0x21; c < 0x7F; c++) REP += String.fromCharCode(c);
  })();
  function jAdv(ch) { const cp = ch.codePointAt(0); return cp < 0x80 || (cp >= 0xFF61 && cp <= 0xFF9F) ? 8 : 16; }
  // Step 1: draw at 16px with y offsets 0/.25/.5/.75, keep the offset with the fewest
  // alpha 64..191 pixels. If that result is not crisp (mid > J16.crisp) — e.g. Windows DirectWrite adds
  // a half-pixel fringe to every dot — Step 2: draw at 4x (64px) and sample 4x4 blocks on the dot grid
  // (global y phase calibrated once, x phase per glyph), threshold 50% coverage. Both give a 1-bit mask.
  const SS = 4, SN = 24 * SS;
  const ssCanvas = mk(SN, SN), ssctx = ctx2d(ssCanvas, true);
  J16.crisp = 2; J16.py = null; J16.method = '';
  function ssRender(ch) {
    ssctx.clearRect(0, 0, SN, SN); ssctx.font = 16 * SS + 'px ' + J16.family; ssctx.textBaseline = 'top'; ssctx.fillStyle = '#ffffff';
    ssctx.fillText(ch, 4 * SS, 4 * SS);
    return ssctx.getImageData(0, 0, SN, SN).data;
  }
  function ssSample(d, w, px, py, out) {
    let amb = 0;
    for (let by = 0; by < 16; by++) for (let bx = 0; bx < w; bx++) {
      let s = 0; const X0 = 4 * SS + bx * SS + px, Y0 = 4 * SS + by * SS + py;
      for (let j = 0; j < SS; j++) { const row = (Y0 + j) * SN; for (let i = 0; i < SS; i++) s += d[(row + X0 + i) * 4 + 3]; }
      const a = s / (SS * SS * 255); amb += Math.min(a, 1 - a);
      if (out) out[by * w + bx] = a >= 0.5 ? 1 : 0;
    }
    return amb;
  }
  function bestPx(d, w, py) { let b = null; for (let px = -SS + 1; px <= 0; px++) { const a = ssSample(d, w, px, py); if (!b || a < b.a) b = { a, px }; } return b; }
  function calibrate() {
    const sample = 'あいかさなまらアイカサナマラ水中央陣地確保秒';
    let best = null;
    const imgs = Array.from(sample, ch => ssRender(ch).slice());
    for (let py = -SS + 1; py <= 0; py++) {
      let tot = 0; imgs.forEach(d => { tot += bestPx(d, 16, py).a; });
      if (!best || tot < best.tot) best = { tot, py };
    }
    J16.py = best.py;
  }
  // The prebuilt glyphs (js/j16-atlas.js, made by fonts.mjs from DotGothic16's outlines): the same dots on every
  // browser, with no canvas read back (Safari 26 adds anti-fingerprinting noise to canvas readback, which broke the
  // rendering below). Characters it does not have fall back to that rendering.
  let atlas = null;   // char -> { w, bits, method }, decoded on first use
  function atlasMask(ch) {
    if (!atlas) {
      atlas = new Map();
      const A = GS.J16_ATLAS;
      if (A && typeof A.chars === 'string' && typeof A.data === 'string') {
        const raw = atob(A.data);
        let p = 0;
        for (const c of A.chars) {
          const w = jAdv(c), bits = new Uint8Array(w * 16);
          for (let i = 0; i < w * 16; i += 8) {
            const byte = raw.charCodeAt(p++);
            for (let k = 0; k < 8; k++) bits[i + k] = (byte >> (7 - k)) & 1;
          }
          atlas.set(c, { w, bits, method: 'atlas' });
        }
        if (p !== raw.length) { console.error('[GS] js/j16-atlas.js: the data does not match its characters'); atlas.clear(); }
      }
    }
    return atlas.get(ch);
  }
  function jMask(ch) {
    let m = J16.masks.get(ch) || atlasMask(ch);
    if (m) { J16.masks.set(ch, m); return m; }
    const cw = jAdv(ch);
    jctx.font = '16px ' + J16.family; jctx.textBaseline = 'top'; jctx.fillStyle = '#ffffff';
    let best = null;
    for (const oy of [0, 0.25, 0.5, 0.75]) {
      jctx.clearRect(0, 0, 32, 32); jctx.fillText(ch, 8, 8 + oy + J16.dy);
      const d = jctx.getImageData(0, 0, 32, 32).data;
      let mid = 0; for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a >= 64 && a <= 191) mid++; }
      if (!best || mid < best.mid) best = { mid, d: new Uint8ClampedArray(d), oy };
    }
    const bits = new Uint8Array(cw * 16);
    if (best.mid <= J16.crisp) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < cw; x++) bits[y * cw + x] = best.d[((8 + y) * 32 + 8 + x) * 4 + 3] >= 128 ? 1 : 0;
      m = { w: cw, bits, method: '16px', oy: best.oy, mid: best.mid };
    } else {
      if (J16.py == null) calibrate();
      const d = ssRender(ch), b = bestPx(d, cw, J16.py);
      ssSample(d, cw, b.px, J16.py, bits);
      m = { w: cw, bits, method: '4x', px: b.px, py: J16.py, mid: best.mid };
    }
    J16.method = m.method;
    J16.masks.set(ch, m); return m;
  }
  GS.measure16 = function (str) { let w = 0; for (const ch of String(str)) w += jAdv(ch); return w; };
  const CJK = /[㐀-鿿豈-﫿]/;
  GS.text16 = function (c, str, x, y, opts) {
    opts = opts || {};
    const s = String(str), st = resolveSet(opts.set), style = opts.style || 'shadow', maxW = opts.maxW == null ? 224 : opts.maxW;
    const lines = s.split('\n'); let wmax = 0;
    lines.forEach((line, li) => {
      for (const ch of line) if (CJK.test(ch) && KANJI.indexOf(ch) < 0) warnOnce('kanji:' + ch, 'kanji not in the 44-character whitelist:', ch, 'in', JSON.stringify(line));
      const w = GS.measure16(line); wmax = Math.max(wmax, w);
      if (w > maxW) warnOnce('w16:' + line, 'J16 line wider than ' + maxW + 'px (' + w + 'px):', line);
      if (!J16.ready) return;
      let dx = R(textAlignX(x, w, opts.align)); const yy = R(y) + li * 16;
      for (const ch of line) {
        const adv = jAdv(ch);
        if (ch !== ' ' && ch !== '　') {
          const key = 'j|' + ch + '|' + st.key + '|' + style;
          let g = glyphCache.get(key);
          if (!g) { const m = jMask(ch); g = paintBitmap(m.w, 16, (i, j) => m.bits[j * m.w + i], () => st.body, style === 'plain' ? null : st.edge, style, 1); glyphCache.set(key, g); }
          c.drawImage(g, dx - 1, yy - 1);
        }
        dx += adv;
      }
    });
    return wmax;
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function clearJ16() { J16.masks.clear(); J16.py = null; for (const k of Array.from(glyphCache.keys())) if (k.startsWith('j|')) glyphCache.delete(k); }
  async function loadDot() {
    if (!document.fonts || !document.fonts.load) return false;
    const faces = await document.fonts.load('16px "DotGothic16"', REP);
    return !!(faces && faces.length) && document.fonts.check('16px "DotGothic16"', 'あ');
  }
  // With the prebuilt glyphs (js/j16-atlas.js, loaded before this file) the ROM text does not need the web font, so
  // nothing waits for it and no fallback is announced: the font keeps loading in the background, and the few glyphs
  // that come from it (characters the atlas lacks) are drawn again once it is there. Without the atlas: wait up to
  // 3 s, else a system font, upgraded when the web font arrives late.
  const hasAtlas = !!(GS.J16_ATLAS && GS.J16_ATLAS.chars);
  const fontReady = (async function () {
    let ok = false;
    const p = loadDot().catch(() => false);
    if (hasAtlas) {
      p.then(loaded => { if (loaded === true) { clearJ16(); GS.dirty = true; } });
      J16.ready = true; GS.dirty = true;
      return 'DotGothic16';
    }
    try { ok = await Promise.race([p, sleep(3000).then(() => 'timeout')]); } catch (e) { ok = false; }
    if (ok !== true) {
      J16.family = '"MS Gothic","Osaka-Mono",monospace'; GS.state.fontFallback = true;
      if (ok === 'timeout') p.then(late => { // upgrade when the web font arrives late
        if (late === true) { J16.family = '"DotGothic16"'; GS.state.fontFallback = false; clearJ16(); GS.dirty = true; if (GS.shell.onFontChange) GS.shell.onFontChange(); }
      });
    }
    J16.ready = true; GS.dirty = true;
    return GS.state.fontFallback ? 'fallback' : 'DotGothic16';
  })();
  GS.fontReady = fontReady;   // resolves with the ROM font in use ('DotGothic16' | 'fallback')

  // =====================================================================
  // windows, cursor, menu
  // =====================================================================
  function ring(c, x, y, w, h, cl, cut) {
    c.fillStyle = cl; const k = cut ? 1 : 0;
    if (w <= 0 || h <= 0) return;
    c.fillRect(x + k, y, w - 2 * k, 1);
    if (h > 1) c.fillRect(x + k, y + h - 1, w - 2 * k, 1);
    if (h > 2) { c.fillRect(x, y + 1, 1, h - 2); c.fillRect(x + w - 1, y + 1, 1, h - 2); }
  }
  // Windows deliberately placed off the 8px grid (the stage description and the pause window).
  // They are exempt from the DEBUG grid check.
  const WIN_SPEC_OFFGRID = new Set(['8,116,240,60', '8,36,240,172']);
  GS.win = function (c, x, y, w, h, opts) {
    opts = opts || {};
    const fill = opts.fill || 'solid', tone = opts.tone || 'std', open = opts.open == null ? 1 : opts.open;
    if (open <= 0) return;
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (GS.DEBUG && (x % 8 || y % 8 || w % 8 || h % 8) && !WIN_SPEC_OFFGRID.has([x, y, w, h].join(','))) warnOnce('win' + [x, y, w, h], 'GS.win not on the 8px grid:', x, y, w, h);
    let hh = h, yy = y;
    if (open < 1) { hh = Math.max(2, R((h * open) / 2) * 2); yy = y + ((h - hh) >> 1); }
    const hi = tone === 'std' ? PAL.frameHi : PAL[tone] || PAL.frameHi;
    if (hh > 6) {
      if (fill === 'solid') { c.fillStyle = PAL.win; c.fillRect(x + 3, yy + 3, w - 6, hh - 6); }
      else if (fill === 'half') GS.half(c, x + 3, yy + 3, w - 6, hh - 6, 'ink');
    }
    ring(c, x, yy, w, hh, PAL.ink, true);
    if (hh > 2) ring(c, x + 1, yy + 1, w - 2, hh - 2, hi);
    if (hh > 4) ring(c, x + 2, yy + 2, w - 4, hh - 4, PAL.frameLo);
    if (hh >= 16 && w >= 16) {
      c.fillStyle = hi;
      c.fillRect(x + 3, yy + 3, 2, 2); c.fillRect(x + w - 5, yy + 3, 2, 2);
      c.fillRect(x + 3, yy + hh - 5, 2, 2); c.fillRect(x + w - 5, yy + hh - 5, 2, 2);
    }
  };
  function cursor(c, x, y, t) {
    const dx = GS.state.reduced ? 0 : (F((t || 0) / 8) & 1);
    GS.spr(c, 'cursor', R(x) + dx, R(y), { pal: 'cursor' });
  }

  GS.activeMenu = null;
  let menuEpoch = 0;
  let drawingStill = false;   // true while GS.still draws: menus drawn into a still never announce
  GS.invalidateMenus = () => { menuEpoch++; };   // shell calls this when the deck changes; next m.update() re-syncs
  function menuSig(m) { return m.items.map(i => i.id + ':' + (i.deckLabel || i.label || '')).join('|') + '#' + m.index; }
  function syncDeck(m) {
    const sig = menuSig(m); if (sig === m._sig && m._ep === menuEpoch) return; m._sig = sig; m._ep = menuEpoch;
    GS.shell.setDeck({ type: 'menu', fromMenu: true, index: m.index, items: m.items.map(i => ({ id: i.id, label: i.deckLabel || i.label || String(i.id), disabled: !!i.disabled })) });
  }
  GS.menu = function (opts) {
    opts = opts || {};
    const m = { items: opts.items || [], index: opts.index || 0, cols: opts.cols || 1, sound: opts.sound !== false, _pick: null, _sig: '' };
    const cx = it => (it.cx == null ? it.x - 16 : it.cx);
    m.rect = function (k) {
      const it = m.items[k], x0 = cx(it);
      return { x: x0, y: it.y, w: it.w != null ? it.w : it.x - x0 + (it.label ? GS.measure16(it.label) : 64), h: it.h != null ? it.h : 16 };
    };
    function ok(i) { return i >= 0 && i < m.items.length && !m.items[i].disabled; }
    function move(i, d) { const n = m.items.length; for (let s = 0; s < n; s++) { i = (i + d + n) % n; if (ok(i)) return i; } return m.index; }
    // opts.spatial: arrows move to the nearest enabled item in that direction by (x, y) — for grids with unequal
    // column lengths (e.g. [A, C] / [B]). Wraps to the far side when nothing lies in that direction.
    function moveSpatial(i, ax, ay) {
      const a = m.items[i]; let best = -1, bd = Infinity;
      for (let pass = 0; pass < 2 && best < 0; pass++) {
        m.items.forEach((b, k) => {
          if (k === i || !ok(k)) return;
          const dx = b.x - a.x, dy = b.y - a.y, along = ax ? dx * ax : dy * ay, across = ax ? Math.abs(dy) : Math.abs(dx);
          if (pass === 0 ? along <= 0 : along >= 0) return;
          const d = along + across * 2; // pass 0: nearest ahead; pass 1 (wrap): farthest behind
          if (d < bd) { bd = d; best = k; }
        });
      }
      return best < 0 ? i : best;
    }
    // Screen-reader announcement of the selected item.
    // Uses item.say, else the deck label (which carries option values), else the label. No subtitle is shown.
    function announce() {
      const it = m.items[m.index]; if (!it || drawingStill) return;
      const text = it.say || it.deckLabel || it.label || String(it.id);
      if (text !== m._said) { m._said = text; if (GS.shell.say) GS.shell.say(text, { sub: false }); }
    }
    m.announce = announce;
    m.setIndex = function (i) { if (ok(i)) { m.index = i; syncDeck(m); if (GS.activeMenu === m) announce(); } };
    m.update = function (input) {
      if (GS.activeMenu !== m) { GS.activeMenu = m; m._said = null; announce(); }
      if (m._pick != null) { const i = m._pick; m._pick = null; if (ok(i)) { m.index = i; syncDeck(m); return m.items[i].id; } }
      syncDeck(m); announce();
      input = input || GS.input;
      const n = m.items.length, cols = m.cols; if (!n) return null;
      let i = m.index;
      if (opts.spatial) {
        if (input.pressed('up')) i = moveSpatial(i, 0, -1);
        else if (input.pressed('down')) i = moveSpatial(i, 0, 1);
        else if (input.pressed('left')) i = moveSpatial(i, -1, 0);
        else if (input.pressed('right')) i = moveSpatial(i, 1, 0);
      } else if (input.pressed('up')) i = move(i, -cols);
      else if (input.pressed('down')) i = move(i, cols);
      else if (cols > 1 && input.pressed('left')) i = move(i, -1);
      else if (cols > 1 && input.pressed('right')) i = move(i, 1);
      for (let k = 0; k < n; k++) {
        if (!ok(k)) continue;
        const r = m.rect(k), h = input.hit(r.x, r.y, r.w, r.h);
        if (h === 'tap') {
          if (input.pointer.type === 'mouse' || k === m.index) { m.index = k; syncDeck(m); return m.items[k].id; }
          i = k; break;
        }
        if (h === 'hover' && input.pointer.moved) { i = k; break; }
      }
      if (i !== m.index) { m.index = i; if (m.sound) GS.sfx('cursor'); syncDeck(m); announce(); }
      if (input.pressed('ok')) return m.items[m.index].id;
      return null;
    };
    m.draw = function (c, t) {
      m.items.forEach((it, k) => {
        const sel = k === m.index;
        if (it.draw) it.draw(c, sel, t);
        else if (it.label != null) GS.text16(c, it.label, it.x, it.y, { set: it.disabled ? 'HL' : sel ? 'H3' : 'H0' });
        if (sel) cursor(c, cx(it), it.y + 4, t);
      });
    };
    return m;
  };
  GS.menuPick = function (i) { if (GS.activeMenu) GS.activeMenu._pick = i; };

  // =====================================================================
  // sprites
  // =====================================================================
  const SPR = new Map();
  const sprCache = new Map();
  let sprVer = 0;
  GS.defSprite = function (name, rows, opts) {
    opts = opts || {};
    const h = opts.h || rows.length, w = opts.w || Math.max(...rows.map(r => r.length));
    rows.forEach((r, i) => { if (r.length !== w) warnOnce('sprw:' + name + i, 'sprite', name, 'row', i, 'has', r.length, 'px (expected ' + w + ')'); });
    if (rows.length !== h) warnOnce('sprh:' + name, 'sprite', name, 'has', rows.length, 'rows (expected ' + h + ')');
    SPR.set(name, { w, h, rows: rows.map(r => (r + '.'.repeat(w)).slice(0, w)), ver: ++sprVer });
  };
  GS.hasSprite = name => SPR.has(name);
  GS.sprSize = name => { const s = SPR.get(name); return s ? { w: s.w, h: s.h } : null; };
  function palArr(pal) { if (Array.isArray(pal)) return pal; return OBJPAL[pal || 'blue'] || (warnOnce('pal:' + pal, 'unknown OBJPAL', pal), OBJPAL.blue); }
  function sprCanvas(name, pal, fx, fy) {
    const s = SPR.get(name); if (!s) return null;
    const pa = palArr(pal), pk = Array.isArray(pal) ? pal.join(',') : (pal || 'blue');
    const key = name + '|' + s.ver + '|' + pk + '|' + (fx ? 1 : 0) + (fy ? 1 : 0);
    let c = sprCache.get(key);
    if (c) return c;
    c = mk(s.w, s.h); const x = c.getContext('2d');
    for (let j = 0; j < s.h; j++) {
      const row = s.rows[j];
      for (let i = 0; i < s.w; i++) {
        const ch = row[i]; if (ch === '.' || ch === ' ') continue;
        const idx = parseInt(ch, 16); if (!(idx > 0)) continue;
        const cc = pa[idx]; if (!cc) continue;
        x.fillStyle = cc; x.fillRect(fx ? s.w - 1 - i : i, fy ? s.h - 1 - j : j, 1, 1);
      }
    }
    sprCache.set(key, c); return c;
  }
  GS.spr = function (c, name, x, y, opts) {
    opts = opts || {};
    const cv = sprCanvas(name, opts.pal, opts.flipX, opts.flipY);
    if (!cv) { warnOnce('spr:' + name, 'sprite not defined:', name); return false; }
    c.drawImage(cv, R(x), R(y)); return true;
  };
  GS.spriteCanvas = function (name, opts) {
    opts = opts || {};
    const cv = sprCanvas(name, opts.pal, opts.flipX, opts.flipY); const k = Math.max(1, opts.scale | 0 || 1);
    if (!cv) return mk(1, 1);
    const o = mk(cv.width * k, cv.height * k), x = ctx2d(o); x.drawImage(cv, 0, 0, o.width, o.height); return o;
  };

  // ---- actor composition (offsets fit the sprites in sprites-field.js) ----
  GS.ACTOR_LAYOUT = {
    body: [-8, -8],             // body sprite top-left relative to (sx,sy) = actor centre
    tankBack: [-10, -3],        // tank (4x8) top-left when facing right, at torso height (mirrored when facing left)
    gunR: 7, gunDy: 3,          // gun centre = (sx + cos*gunR, sy + gunDy + sin*gunR)
    orbR: 13,                   // charge orb centre distance
    marker: [-4, -19],          // marker_self top-left
    hpY: 9,                     // hp bar y offset
    corners: 12,                // corner brackets: top-left at (sx-12, sy-12) etc.
    recoil: { dy: 8, rx: 10, ry: 3 },
    ripple: [-4, 4],
  };
  GS.tankLevel = water => (water <= 0 ? 0 : GS.clamp(Math.ceil((water / 100) * 7), 1, 7));
  GS.poolLevel = (water, capacity) => { const r = water / capacity; return r <= 0 ? 0 : Math.min(5, Math.ceil(r * 5 - 1e-9)); };
  GS.pumpLevel = water => (water <= 0 ? 0 : Math.min(4, Math.ceil(water / 25 - 1e-9)));
  GS.dir16 = (dx, dy) => ((R(Math.atan2(dy, dx) / (Math.PI / 8)) % 16) + 16) % 16;

  function drawTank(c, x, y, level, pal) {
    const p = palArr(pal); x = R(x); y = R(y); level = GS.clamp(level | 0, 0, 7);
    c.fillStyle = p[10]; c.fillRect(x, y, 4, 8);            // frame
    c.fillStyle = p[9]; c.fillRect(x + 1, y + 1, 2, 7);     // glass
    if (level > 0) {
      c.fillStyle = p[11]; c.fillRect(x + 1, y + 8 - level, 2, level);
      c.fillStyle = p[12]; c.fillRect(x + 1, y + 8 - level, 2, 1);
    }
  }
  // gun_0..gun_4 point from 0deg (right) toward 90deg (screen-down). (x,y) = centre of the 8x8 gun.
  function drawGun(c, x, y, dir16, pal, dim) {
    const d = ((dir16 | 0) % 16 + 16) % 16;
    let k, fx = false, fy = false;
    if (d <= 4) k = d; else if (d <= 8) { k = 8 - d; fx = true; } else if (d <= 12) { k = d - 8; fx = true; fy = true; } else { k = 16 - d; fy = true; }
    GS.spr(c, 'gun_' + k, R(x) - 4, R(y) - 4, { pal: dim ? 'gray' : pal, flipX: fx, flipY: fy });
  }
  function drawRecoil(c, cx, cy, amount) {
    const Lo = GS.ACTOR_LAYOUT.recoil, rx = Lo.rx, ry = Lo.ry, lit = Math.ceil(GS.clamp(amount, 0, 5));
    const s = spans(rx, ry);
    c.fillStyle = PAL.orange;
    for (let j = 0; j < s.length; j++) {
      const dy = j - ry, hw = s[j], prev = j ? s[j - 1] : -1, next = j < s.length - 1 ? s[j + 1] : -1;
      for (let x = Math.max(0, Math.min(hw, Math.min(prev, next) + 1)); x <= hw; x++) for (const sg of x ? [1, -1] : [1]) {
        let a = Math.atan2(dy, sg * x) + Math.PI / 2; if (a < 0) a += Math.PI * 2; // sector 0 starts at top
        const sec = F(a / (Math.PI * 2) * 5) % 5;
        if (sec >= lit) continue;
        const jag = ((x + j) & 1) ? 0 : (dy <= 0 ? -1 : 1);  // jagged edge
        c.fillRect(cx + sg * x, cy + dy + jag, 1, 1);
      }
    }
  }
  GS.actor = function (c, sx, sy, a) {
    a = a || {};
    const Lo = GS.ACTOR_LAYOUT; sx = R(sx); sy = R(sy);
    const team = a.team === 1 || a.team === 'orange' ? 'orange' : 'blue';
    const down = a.pose === 'down';
    const pal = a.flash ? 'flash' : down ? 'gray' : team + (a.gold ? 'Gold' : '');
    const faceLeft = !!a.faceLeft;
    if (a.slow) GS.spr(c, 'ripple', sx + Lo.ripple[0], sy + Lo.ripple[1], { pal: 'water' });
    if (a.recoil > 0 && !down) drawRecoil(c, sx, sy + Lo.recoil.dy, a.recoil);
    if (down) {
      GS.spr(c, 'body_down', sx + Lo.body[0], sy + Lo.body[1], { pal, flipX: faceLeft });
      return;
    }
    const pump = a.pose === 'pump';
    const dir = a.aimDir16 != null ? a.aimDir16 : faceLeft ? 8 : 0;
    const ang = (dir * Math.PI) / 8;
    const gx = sx + R(Math.cos(ang) * Lo.gunR), gy = sy + Lo.gunDy + R(Math.sin(ang) * Lo.gunR);
    const gunBehind = dir >= 9 && dir <= 15;
    const tx = faceLeft ? sx - Lo.tankBack[0] - 4 : sx + Lo.tankBack[0], ty = sy + Lo.tankBack[1];
    if (!pump && gunBehind) drawGun(c, gx, gy, dir, pal, a.gunDim);
    const body = pump ? 'body_pump_' + ((a.frame | 0) & 1) : 'body_field';
    GS.spr(c, body, sx + Lo.body[0], sy + Lo.body[1], { pal, flipX: faceLeft });
    drawTank(c, tx, ty, a.tank == null ? 4 : a.tank, pal);
    if (!pump && !gunBehind) drawGun(c, gx, gy, dir, pal, a.gunDim);
    if (a.charge > 0 && !pump) {
      const k = GS.clamp(a.charge | 0, 1, 4), s = GS.sprSize('orb_' + k) || { w: 8, h: 8 };
      const ox = sx + R(Math.cos(ang) * Lo.orbR), oy = sy + Lo.gunDy + R(Math.sin(ang) * Lo.orbR);
      GS.spr(c, 'orb_' + k, ox - (s.w >> 1), oy - (s.h >> 1), { pal: a.charge >= 4 && a.lockGold ? 'gold' : 'water' });
    }
    if (a.corners) {
      const d = Lo.corners;
      GS.spr(c, 'corner', sx - d, sy - d, { pal: 'danger' });
      GS.spr(c, 'corner', sx + d - 8, sy - d, { pal: 'danger', flipX: true });
      GS.spr(c, 'corner', sx - d, sy + d - 8, { pal: 'danger', flipY: true });
      GS.spr(c, 'corner', sx + d - 8, sy + d - 8, { pal: 'danger', flipX: true, flipY: true });
    }
    if (a.hpBar != null) {
      const w = a.self ? 14 : 12, x0 = sx - (w >> 1), y0 = sy + Lo.hpY, f = R(w * GS.clamp(a.hpBar, 0, 1));
      c.fillStyle = PAL.ink; c.fillRect(x0 - 1, y0 - 1, w + 2, 4);
      c.fillStyle = a.self ? PAL.danger : team === 'blue' ? PAL.blue : PAL.orange; c.fillRect(x0, y0, f, 2);
    }
    if (a.self) GS.spr(c, 'marker_self', sx + Lo.marker[0], sy + Lo.marker[1], { pal: 'self' });
  };

  // ---- map ----------------------------------------------------------------
  GS.stage = function (id) {
    const S = GS.STAGES || [];
    return S.find(s => s.id === id || s.no === id) || S[0] || null;
  };
  const mapCache = new Map();
  const TILE16 = [
    'b...b...b...b...', '................', '................', '...........b....',
    'b...............', '....b...........', '................', '................',
    'b...b...b...b...', '................', '................', '..b.............',
    '........b.......', '..............b.', '................', '................'];
  GS.mapCanvas = function (stageId, scale) {
    const st = GS.stage(stageId); if (!st) return mk(1, 1);
    const key = st.id + '@' + scale; let cv = mapCache.get(key); if (cv) return cv;
    const w = R(1200 * scale), h = R(720 * scale);
    cv = mk(w, h); const c = ctx2d(cv);
    const radar = scale <= 1 / 29;
    const big = scale >= 1 / 4;
    if (radar) {
      c.fillStyle = PAL.night; c.fillRect(0, 0, w, h);
      c.fillStyle = PAL.wallSide;
      for (const o of st.obstacles) c.fillRect(F(o.x * scale), F(o.y * scale), Math.max(1, R(o.w * scale)), Math.max(1, R(o.h * scale)));
    } else {
      const ga = col(st.ground[0]), gb = col(st.ground[1]);
      c.fillStyle = ga; c.fillRect(0, 0, w, h);
      c.fillStyle = gb;
      if (big) {
        for (let ty = 0; ty < h; ty += 16) for (let tx = 0; tx < w; tx += 16)
          for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (TILE16[j][i] === 'b') c.fillRect(tx + i, ty + j, 1, 1);
      } else {
        for (let y = 0; y < h; y += 4) for (let x = (y & 4) ? 2 : 0; x < w; x += 4) c.fillRect(x, y, 1, 1);
      }
      for (const o of st.obstacles) {
        const x = R(o.x * scale), y = R(o.y * scale), ow = Math.max(1, R(o.w * scale)), oh = Math.max(1, R(o.h * scale));
        if (big) {
          const side = Math.min(5, Math.max(2, F(oh / 4)));
          c.fillStyle = PAL.wallShadow; c.fillRect(x + 2, y + 3, ow, oh);
          c.fillStyle = PAL.ink; c.fillRect(x - 1, y - 1, ow + 2, oh + 2);
          c.fillStyle = PAL.wallTop; c.fillRect(x, y, ow, oh - side);
          c.fillStyle = PAL.wallSide; c.fillRect(x, y + oh - side, ow, side);
          c.fillStyle = PAL.wallEdge; c.fillRect(x, y, ow, 1); c.fillRect(x, y, 1, oh - side);
          c.fillStyle = PAL.wallShadow;
          for (let i = 3; i < ow - 1; i += 6) c.fillRect(x + i, y + oh - side + 1, 1, side - 2 > 0 ? side - 2 : 1);
        } else {
          c.fillStyle = PAL.wallShadow; c.fillRect(x + 1, y + 1, ow, oh);
          c.fillStyle = PAL.wallTop; c.fillRect(x, y, ow, oh);
          c.fillStyle = PAL.wallEdge; c.fillRect(x, y, ow, 1);
          if (oh > 2) { c.fillStyle = PAL.wallSide; c.fillRect(x, y + oh - 1, ow, 1); }
        }
      }
    }
    mapCache.set(key, cv); return cv;
  };

  // puddle outline: same formula as game.mjs (64 points, rotated by angle)
  function poolPoints(p) {
    if (p._pts) return p._pts;
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    p._pts = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      const e = 1 + 0.17 * Math.sin(a * 3 + p.phase) + 0.12 * Math.cos(a * 5 - p.phase) + 0.065 * Math.sin(a * 8 + p.phase);
      const x = Math.cos(a) * p.rx * e, y = Math.sin(a) * p.ry * e;
      return [x * cos - y * sin, x * sin + y * cos];
    });
    return p._pts;
  }
  function poolOutline(p, f, scale) { return poolPoints(p).map(v => [(p.x + v[0] * f) * scale, (p.y + v[1] * f) * scale]); }
  // Rasterise polygon (map-pixel coords) onto a grid of cell size g aligned to the map origin.
  function rasterPoly(poly, x0, y0, w, h, g) {
    const M = new Uint8Array(w * h);
    for (let cy = F(y0 / g) * g; cy < y0 + h; cy += g) {
      const sy = cy + g / 2, xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > sy) !== (b[1] > sy)) xs.push(a[0] + ((sy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let cx = Math.ceil((xs[k] - g / 2) / g) * g; cx + g / 2 <= xs[k + 1]; cx += g) {
          for (let dy = 0; dy < g; dy++) for (let dx = 0; dx < g; dx++) {
            const px = cx + dx - x0, py = cy + dy - y0;
            if (px >= 0 && py >= 0 && px < w && py < h) M[py * w + px] = 1;
          }
        }
      }
    }
    return M;
  }
  function erode(M, w, h) {
    const O = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; O[i] = M[i] && M[i - 1] && M[i + 1] && M[i - w] && M[i + w] ? 1 : 0; }
    return O;
  }
  const puddleCache = new Map();
  // farthest outline point from the centre at full size (game.mjs puddleShape().radius), cached like p._pts
  function poolRadius(p) {
    if (p._rmax == null) p._rmax = poolPoints(p).reduce((m, v) => Math.max(m, Math.hypot(v[0], v[1])), 0);
    return p._rmax;
  }
  // px > 0: a live shore drawn at that ROM-pixel radius instead of the step size sqrt(level / 5) (see drawPuddles)
  function puddleImage(st, i, level, scale, px) {
    const key = st.id + '|' + i + '|' + level + '|' + scale + (px ? '|r' + px : '');
    let im = puddleCache.get(key); if (im) return im;
    const p = st.pools[i], big = scale >= 1 / 4, g = big ? 2 : 1;
    const f = px ? px / (poolRadius(p) * scale) : level <= 0 ? 0.6 : Math.sqrt(level / 5);
    const poly = poolOutline(p, f, scale);
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    poly.forEach(([x, y]) => { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); });
    const x0 = F(mnx / g) * g - 4, y0 = F(mny / g) * g - 4, w = Math.ceil(mxx) - x0 + 6, h = Math.ceil(mxy) - y0 + 6;
    const M = rasterPoly(poly, x0, y0, w, h, g);
    const cv = mk(w, h), c = cv.getContext('2d'), img = c.createImageData(w, h), d = img.data;
    const put = (idx, hexc) => { const [r, gg, b] = rgb(hexc); d[idx * 4] = r; d[idx * 4 + 1] = gg; d[idx * 4 + 2] = b; d[idx * 4 + 3] = 255; };
    const stripes = [];
    if (level <= 0) {
      const E = erode(M, w, h);
      for (let k = 0; k < w * h; k++) if (M[k]) put(k, E[k] && ((k % w) + F(k / w)) % 7 ? PAL.dry : PAL.dry2);
    } else {
      const E1 = erode(M, w, h), E2 = big ? erode(E1, w, h) : E1;
      const D = rasterPoly(poolOutline(p, f * 0.5, scale), x0, y0, w, h, g);
      const pcx = p.x * scale - x0, pcy = p.y * scale - y0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!M[k]) {
          if ((x > 0 && M[k - 1]) || (x < w - 1 && M[k + 1]) || (y > 0 && M[k - w]) || (y < h - 1 && M[k + w])) put(k, PAL.sand);
          continue;
        }
        let cc = E2[k] ? (D[k] ? PAL.waterDk : PAL.water) : PAL.waterShallow;
        const edge = !E1[k];
        if (edge && ((x > 0 && !M[k - 1]) || (y > 0 && !M[k - w])) && (x - pcx) + (y - pcy) < 0) cc = PAL.foam;
        put(k, cc);
      }
      if (big) { // palette-cycle stripes on the open water (2-4px wide), deterministic positions
        let seed = (i + 1) * 9301 + level * 49297 + (px || 0) * 7919;
        const rnd = () => ((seed = (seed * 233280 + 49297) % 2147483647) / 2147483647);
        for (let y = 2; y < h - 2; y += 4) {
          for (let x = 2 + F(rnd() * 6); x < w - 6; x += 9 + F(rnd() * 8)) {
            const len = 2 + F(rnd() * 3); let okk = true;
            for (let q = 0; q < len; q++) { const k = y * w + x + q; if (!E2[k] || D[k]) { okk = false; break; } }
            if (okk) stripes.push({ x: x + x0, y: y + y0, len, ph: F(rnd() * 4) });
          }
        }
      }
    }
    c.putImageData(img, 0, 0);
    im = { cv, x0, y0, stripes };
    puddleCache.set(key, im);
    // live shore images come and go with the water: keep the newest FINE_MAX (a dropped one is ~1 ms to redraw)
    if (px) { fineKeys.push(key); if (fineKeys.length > FINE_MAX) puddleCache.delete(fineKeys.shift()); }
    return im;
  }
  const fineKeys = [], FINE_MAX = 96;
  // New stage data (data.js GS.setGameData called again): drop the map and puddle images built from the old data.
  // (The puddle outline cache p._pts lives on the pool objects, which setGameData creates afresh.)
  GS.clearMapCaches = function () { mapCache.clear(); puddleCache.clear(); fineKeys.length = 0; GS.dirty = true; };
  const CYCLE = ['waterShallow', 'water', 'waterDk', 'waterHi'];
  // Live match (the play screen entered with params.live, on the stage GS.app.game is playing): game.mjs refills and
  // slows an actor whose centre is within the body reach (CONFIG.radius) of the real shoreline, which shrinks with
  // sqrt(water / capacity). The 6-step image (sqrt(level / 5), never smaller than the real shore) is kept while its
  // shore stays inside that reach; past it (a big pool low in its step) the image follows the real water down in
  // whole ROM pixels, so no one stands in drawn water without refilling. Mock screens and stills keep the 6 steps.
  function liveWater(stageId) {
    const app = GS.app, g = app && app.live ? app.game : null;
    if (!g || !g.stage || g.stage.id !== stageId || !Array.isArray(g.puddles)) return null;
    const c = GS.current;
    return c.id === 'play' && c.params && c.params.live ? g.puddles : null;
  }
  function shorePx(p, q, level, scale) {
    const reach = GS.RULES && Number.isFinite(GS.RULES.radius) ? GS.RULES.radius : 0;
    const rmax = poolRadius(p);
    const cap = (Math.sqrt(Math.max(0, q.water / q.capacity)) * rmax + reach) * scale; // ROM px
    return Math.sqrt(level / 5) * rmax * scale <= cap ? 0 : Math.max(1, F(cap));
  }
  GS.drawPuddles =function (c, stageId, levels, ox, oy, scale, frame) {
    const st = GS.stage(stageId); if (!st) return;
    ox = R(ox); oy = R(oy); frame = frame || 0;
    const live = liveWater(stageId);
    st.pools.forEach((p, i) => {
      const lv = levels && levels[i] != null ? GS.clamp(levels[i] | 0, 0, 5) : 5;
      const q = live && live[i];
      const px = q && q.id === p.id && lv > 0 && lv === GS.poolLevel(q.water, q.capacity) ? shorePx(p, q, lv, scale) : 0;
      const im = puddleImage(st, i, lv, scale, px);
      c.drawImage(im.cv, ox + im.x0, oy + im.y0);
      for (const s of im.stripes) { c.fillStyle = PAL[CYCLE[(s.ph + F(frame / 8)) % 4]]; c.fillRect(ox + s.x, oy + s.y, s.len, 1); }
    });
  };
  // Pump art around the tap point (sprites 'pump' / 'lever_*' / 'foot' in sprites-field.js): the spout is on the
  // left (dropFrom), the gauge left of the body, the lever and the footprints on the right. stand = where the
  // operator stands, facing left toward the lever; any screen drawing an operator uses tap + stand.
  GS.PUMP_LAYOUT = { body: [-8, -12], lever: [2, -11], foot: [12, 2], gauge: [-12, -10], dropFrom: [-5, -5], stand: [16, -4] };
  GS.drawPumps = function (c, stageId, pumps, ox, oy, scale, frame) {
    const st = GS.stage(stageId); if (!st) return;
    ox = R(ox); oy = R(oy); frame = frame || 0;
    const Lo = GS.PUMP_LAYOUT;
    st.taps.forEach((tp, i) => {
      const x = R(ox + tp.x * scale), y = R(oy + tp.y * scale);
      if (scale >= 1 / 4) {
        const pm = (pumps && pumps[i]) || { level: 4 };
        GS.spr(c, 'foot', x + Lo.foot[0], y + Lo.foot[1], { pal: pm.footOn ? 'footOn' : 'footOff' });
        GS.spr(c, 'pump', x + Lo.body[0], y + Lo.body[1], { pal: 'pump' });
        GS.spr(c, 'lever_' + (pm.operating ? F(frame / 8) & 1 : 0), x + Lo.lever[0], y + Lo.lever[1], { pal: 'pump' });
        const gx = x + Lo.gauge[0], gy = y + Lo.gauge[1], lv = GS.clamp(pm.level | 0, 0, 4);
        c.fillStyle = PAL.ink; c.fillRect(gx - 1, gy - 1, 4, 10);
        c.fillStyle = PAL.dim; c.fillRect(gx, gy, 2, 8);
        if (lv) { c.fillStyle = PAL.water; c.fillRect(gx, gy + 8 - lv * 2, 2, lv * 2); }
        if (pm.operating && lv > 0) {
          const pool = st.pools[tp.pool];
          const px = ox + pool.x * scale, py = oy + pool.y * scale, sx0 = x + Lo.dropFrom[0], sy0 = y + Lo.dropFrom[1];
          for (let k = 0; k < 4; k++) {
            const s = (((frame + k * 8) % 32) + 1) / 33;
            GS.spr(c, 'drop', R(sx0 + (px - sx0) * s) - 4, R(sy0 + (py - sy0) * s) - 4, { pal: 'water' });
          }
        }
      } else if (!pumps) {
        c.fillStyle = PAL.pumpMetal; c.fillRect(x - 1, y - 1, 2, 2);
      } else {
        const lv = GS.clamp((pumps[i] && pumps[i].level) | 0, 0, 4);
        c.fillStyle = PAL.ink; c.fillRect(x - 1, y - 3, 3, 6);
        c.fillStyle = PAL.pumpMetal; c.fillRect(x - 1, y - 3, 3, 1);
        if (lv) { c.fillStyle = PAL.lever; c.fillRect(x, y + 2 - lv, 1, lv); }
      }
    });
  };
  const ZONE_COLOR = { neutral: 'neutral', blue: 'blue', orange: 'orange' };
  GS.drawZone = function (c, ox, oy, scale, state, frame) {
    // GS.ZONE comes from game.mjs (data.js GS.setGameData, before the first frame); no hand-copied fallback
    const Z = GS.ZONE;
    if (!Z) { warnOnce('zone', 'GS.ZONE is not set (GS.setGameData has not run): the zone is not drawn'); return; }
    const cx = R(ox + Z.x * scale), cy = R(oy + Z.y * scale), r = R(Z.r * scale);
    const cl = state === 'contest' ? (GS.alt(frame || 0, 20) ? 'gold' : 'white') : ZONE_COLOR[state] || 'neutral';
    if (state === 'blue' || state === 'orange') GS.circle(c, cx, cy, r >= 12 ? r - 3 : r - 1, state, { fill: true, half: true });
    if (r >= 12) { GS.circle(c, cx, cy, r, cl, { dash: [4, 4] }); GS.circle(c, cx, cy, r - 1, cl, { dash: [4, 4] }); }
    else GS.circle(c, cx, cy, r, cl);
  };
  // 40x24 radar. snap = {stage, pools:[{ratio|water+capacity|level, dryBlink}], pumps:[{level, operating}],
  //   zone, actors:[{x,y,team,self,alive,charging}], cam:{x,y} (1/3-scale camera)}
  GS.radar = function (c, x, y, snap, frame) {
    snap = snap || {}; frame = frame || 0; x = R(x); y = R(y);
    const st = GS.stage(snap.stage || 'tutorial'); if (!st) return;
    c.save(); c.beginPath(); c.rect(x, y, 40, 24); c.clip();
    c.drawImage(GS.mapCanvas(st.id, 1 / 30), x, y);
    st.pools.forEach((p, i) => {
      const s = snap.pools ? snap.pools[i] : null;
      let ratio = 1;
      if (typeof s === 'number') ratio = s;
      else if (s) ratio = s.ratio != null ? s.ratio : s.water != null ? s.water / (s.capacity || p.capacity) : s.level != null ? s.level / 5 : 1;
      const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
      const ex = Math.sqrt((p.rx * ca) ** 2 + (p.ry * sa) ** 2) / 30, ey = Math.sqrt((p.rx * sa) ** 2 + (p.ry * ca) ** 2) / 30;
      const px = x + R(p.x / 30), py = y + R(p.y / 30);
      if (ratio <= 0) GS.ellipse(c, px, py, Math.max(1, R(ex)), Math.max(1, R(ey)), 'dry2');
      else { const k = Math.sqrt(ratio); GS.ellipse(c, px, py, Math.max(1, R(ex * k)), Math.max(0, R(ey * k)), ratio >= 0.5 ? 'water' : 'waterDk', { fill: true }); }
      if (s && s.dryBlink != null && s.dryBlink < 120 && GS.blink(s.dryBlink, 10, 10)) GS.ellipse(c, px, py, Math.max(1, R(ex)), Math.max(1, R(ey)), 'white');
    });
    const zc = snap.zone === 'contest' ? (GS.alt(frame, 20) ? 'blue' : 'orange') : ZONE_COLOR[snap.zone] || 'neutral';
    const zx = x + 18, zy = y + 10; c.fillStyle = col(zc);
    c.fillRect(zx + 1, zy, 3, 1); c.fillRect(zx + 1, zy + 4, 3, 1); c.fillRect(zx, zy + 1, 1, 3); c.fillRect(zx + 4, zy + 1, 1, 3);
    st.taps.forEach((tp, i) => {
      const pm = snap.pumps ? snap.pumps[i] || {} : { level: 4 };
      if (pm.operating && !GS.blink(frame, 10, 10)) return;
      c.fillStyle = (pm.level == null ? 4 : pm.level) > 0 ? PAL.lever : PAL.footOff;
      c.fillRect(x + R(tp.x / 30) - 1, y + R(tp.y / 30) - 1, 2, 2);
    });
    (snap.actors || []).forEach(a => {
      if (a.alive === false) return;
      const team = a.team === 1 || a.team === 'orange' ? 'orange' : 'blue';
      let cc = PAL[team];
      if (a.self) cc = GS.blink(frame, 16, 16) ? PAL.white : PAL.blue;
      else if (a.charging && team === 'orange') cc = GS.alt(frame, 10) ? PAL.white : PAL.orange;
      c.fillStyle = cc; c.fillRect(x + R(a.x / 30) - 1, y + R(a.y / 30) - 1, 2, 2);
    });
    if (snap.cam) {
      const vx = x + R(snap.cam.x / 10), vy = y + R(snap.cam.y / 10), vw = 26, vh = 16; c.fillStyle = PAL.gray;
      [[vx, vy, 1, 1], [vx + vw - 1, vy, -1, 1], [vx, vy + vh - 1, 1, -1], [vx + vw - 1, vy + vh - 1, -1, -1]].forEach(([qx, qy, sx, sy]) => {
        c.fillRect(qx, qy, 1, 1); c.fillRect(qx + sx, qy, 1, 1); c.fillRect(qx, qy + sy, 1, 1);
      });
    }
    c.restore();
  };
  // ROM water tile (32x32) used by the shell wallpaper "すいめん".
  GS.waterTile = function () {
    const cv = mk(32, 32), c = ctx2d(cv);
    c.fillStyle = PAL.waterDk; c.fillRect(0, 0, 32, 32);
    const rows = [[2, 3, 6, 'water'], [7, 18, 8, 'waterShallow'], [12, 6, 5, 'water'], [17, 22, 6, 'water'], [21, 2, 7, 'waterShallow'], [26, 14, 5, 'water'], [29, 26, 4, 'waterHi'], [9, 28, 3, 'waterHi'], [23, 11, 2, 'waterHi']];
    rows.forEach(([yy, xx, len, cl]) => { c.fillStyle = PAL[cl]; c.fillRect(xx, yy, len, 1); c.fillRect((xx + len + 30) % 32, yy + 1, 2, 1); });
    return cv;
  };

  // =====================================================================
  // input
  // =====================================================================
  const KEYMAP = {
    ArrowUp: ['up'], KeyW: ['up'], ArrowDown: ['down'], KeyS: ['down'], ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
    Enter: ['ok'], NumpadEnter: ['ok'], Space: ['ok'], Escape: ['back', 'pause'], Backspace: ['back'],
    KeyE: ['weapon'], KeyR: ['restart'], KeyP: ['pause'],
  };
  const inp = {
    keys: new Set(), virt: new Set(), pend: new Set(), now: new Set(),
    pend2: { justDown: false, justUp: false, moved: false },
    stickT: { x: 0, y: 0 }, lastDir: { x: 1, y: 0 }, mouseFire: false,
  };
  const pointer = { x: -1, y: -1, inside: false, down: false, justDown: false, justUp: false, moved: false, type: 'mouse' };
  let display = null, dctx = null, headless = false;
  function heldBtn(btn) {
    if (inp.virt.has(btn)) return true;
    if (btn === 'fire') return inp.mouseFire;
    for (const code of inp.keys) { const m = KEYMAP[code]; if (m && m.indexOf(btn) >= 0) return true; }
    return false;
  }
  function keyStick() {
    let x = (heldBtn('right') ? 1 : 0) - (heldBtn('left') ? 1 : 0), y = (heldBtn('down') ? 1 : 0) - (heldBtn('up') ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
  GS.input = {
    pressed: btn => inp.now.has(btn),
    pointer,
    hit(x, y, w, h) {
      const p = pointer; if (!p.inside || p.x < x || p.y < y || p.x >= x + w || p.y >= y + h) return null;
      if (p.justDown) return 'tap';
      return p.type === 'mouse' ? 'hover' : null;
    },
    get stick() { const t = inp.stickT; if (t.x || t.y) return { x: t.x, y: t.y }; return keyStick(); },
    get fire() { return heldBtn('fire'); },
    aimOrigin: { x: 128, y: 111 },
    get aim() {
      if (pointer.type === 'mouse' && pointer.x >= 0) return { x: pointer.x, y: pointer.y, mode: 'mouse' };
      const o = GS.input.aimOrigin; return { x: R(o.x + inp.lastDir.x * 48), y: R(o.y + inp.lastDir.y * 48), mode: 'stick' };
    },
    virtual(btn, down) {
      if (down) { if (!inp.virt.has(btn)) { inp.pend.add(btn); inp.pend.add('any'); } inp.virt.add(btn); }
      else inp.virt.delete(btn);
    },
    press(btn) { inp.pend.add(btn); inp.pend.add('any'); },
    setStick(x, y) { inp.stickT.x = x || 0; inp.stickT.y = y || 0; const m = Math.hypot(x, y); if (m > 0.2) { inp.lastDir.x = x / m; inp.lastDir.y = y / m; } },
    clear() { inp.keys.clear(); inp.virt.clear(); inp.pend.clear(); inp.mouseFire = false; pointer.down = false; inp.stickT.x = inp.stickT.y = 0; },
  };
  function inputBegin() {
    inp.now = inp.pend; inp.pend = new Set();
    pointer.justDown = inp.pend2.justDown; pointer.justUp = inp.pend2.justUp; pointer.moved = inp.pend2.moved;
    inp.pend2.justDown = inp.pend2.justUp = inp.pend2.moved = false;
    const k = keyStick(); if (k.x || k.y) { const m = Math.hypot(k.x, k.y); inp.lastDir.x = k.x / m; inp.lastDir.y = k.y / m; }
  }
  function inputEnd() { inp.now = new Set(); pointer.justDown = pointer.justUp = pointer.moved = false; }
  function inputBlocked() { return GS.state.manualOpen || GS.state.settingsOpen; }
  function attachInput(cv) {
    window.addEventListener('keydown', e => {
      if (inputBlocked()) return;
      const t = e.target;
      if (t && t !== document.body && t !== cv && t.closest && t.closest('input,select,textarea,button,a,[contenteditable],dialog,.panel')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+R, Alt+←, ...) stay the browser's
      const map = KEYMAP[e.code];
      if (map) e.preventDefault();
      if (e.repeat) return;
      inp.keys.add(e.code);
      if (map) map.forEach(b => inp.pend.add(b));
      if (!/^(Shift|Control|Alt|Meta|Tab|CapsLock|F\d+|Unidentified)/.test(e.key)) inp.pend.add('any');
    });
    window.addEventListener('keyup', e => { inp.keys.delete(e.code); });
    window.addEventListener('blur', () => { inp.keys.clear(); inp.mouseFire = false; pointer.down = false; });
    const mapP = e => {
      const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
      const fx = ((e.clientX - r.left) * W) / r.width, fy = ((e.clientY - r.top) * H) / r.height;
      const nx = F(fx), ny = F(fy);
      if (nx !== pointer.x || ny !== pointer.y) inp.pend2.moved = true;
      pointer.x = nx; pointer.y = ny; pointer.inside = fx >= 0 && fy >= 0 && fx < W && fy < H;
      pointer.type = e.pointerType || 'mouse';
    };
    window.addEventListener('pointermove', mapP, { passive: true });
    window.addEventListener('pointerdown', e => {
      mapP(e);
      if (inputBlocked() || e.target !== cv || !pointer.inside) return;
      if (e.button === 2) { inp.pend.add('weapon'); inp.pend.add('any'); return; }
      if (e.button !== 0) return;
      pointer.down = true; inp.pend2.justDown = true; inp.pend.add('any');
      if (pointer.type === 'mouse') inp.mouseFire = true;
    });
    const up = e => { mapP(e); if (e.type === 'pointercancel' || e.button === 0 || e.pointerType !== 'mouse') { if (pointer.down) inp.pend2.justUp = true; pointer.down = false; inp.mouseFire = false; } };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }

  // =====================================================================
  // sound
  // =====================================================================
  const AU = { ctx: null, master: null, noise: null, voices: [] };
  const NT = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.51, G6: 1567.98, G4: 392, D4: 293.66, G3: 196 };
  const SFX = {
    cursor: [{ w: 'sq', f: 1600, d: 2 }],
    ok: [{ w: 'sq', f: 880, d: 6 }, { w: 'sq', f: 1320, d: 6, at: 6 }],
    back: [{ w: 'sq', f: 660, d: 5 }, { w: 'sq', f: 440, d: 5, at: 5 }],
    buzz: [{ w: 'sq', f: 110, d: 8 }],
    start: [{ w: 'sq', f: NT.C6, d: 4 }, { w: 'sq', f: NT.E6, d: 4, at: 4 }, { w: 'sq', f: NT.G6, d: 4, at: 8 }, { w: 'noise', d: 12, at: 12, lp: 3000 }],
    drop: [{ w: 'tri', f: 1200, f1: 400, d: 10 }],
    splash: [{ w: 'noise', d: 16, lp: 1800 }, { w: 'tri', f: 300, f1: 900, d: 16 }],
    count: [{ w: 'sq', f: 440, d: 8 }],
    go: [{ w: 'sq', f: 850, d: 16 }],
    capture: [{ w: 'sq', f: 660, d: 6 }, { w: 'sq', f: 990, d: 6, at: 6 }],
    captureEnemy: [{ w: 'sq', f: 990, d: 6 }, { w: 'sq', f: 660, d: 6, at: 6 }],
    msg: [{ w: 'sq', f: 1000, d: 2, g: 0.6 }],
    shotN: [{ w: 'sq', f: 1200, f1: 600, d: 3 }],
    shotS: [{ w: 'noise', d: 8, lp: 5000 }],
    shotL: [{ w: 'tri', f: 220, f1: 110, d: 18 }, { w: 'noise', d: 18, lp: 1200 }],
    shotW: [{ w: 'sq', f: 1800, d: 2, g: 0.35 }],
    hit: [{ w: 'noise', d: 3 }],
    ko: [{ w: 'noise', d: 6 }, { w: 'sq', f: 400, f1: 1200, d: 8, at: 6 }],
    dry: [{ w: 'tri', f: 523, d: 6 }, { w: 'tri', f: 392, d: 6, at: 6 }, { w: 'tri', f: 262, d: 6, at: 12 }],
    pause: [{ w: 'sq', f: 988, d: 6 }, { w: 'sq', f: 659, d: 6, at: 6 }],
    heart: [{ w: 'tri', f: 55, d: 4, g: 1.5 }, { w: 'tri', f: 55, d: 4, at: 8, g: 1.5 }],
    tick10: [{ w: 'sq', f: 1000, d: 3 }],
    tally: [{ w: 'sq', f: 1800, d: 2, g: 0.5 }],
    line: [{ w: 'tri', f: 1568, d: 12 }],
    total: [{ w: 'sq', f: NT.C5, d: 30, g: 0.5 }, { w: 'sq', f: NT.E5, d: 30, g: 0.5 }, { w: 'sq', f: NT.G5, d: 30, g: 0.5 }],
    stamp: [{ w: 'noise', d: 10, lp: 800 }, { w: 'tri', f: 80, d: 10, g: 1.5 }],
    win: [{ w: 'sq', f: NT.C5, d: 10 }, { w: 'sq', f: NT.E5, d: 10, at: 10 }, { w: 'sq', f: NT.G5, d: 10, at: 20 }, { w: 'sq', f: NT.C6, d: 30, at: 30 }],
    lose: [{ w: 'sq', f: NT.G4, d: 14 }, { w: 'sq', f: NT.D4, d: 14, at: 14 }, { w: 'sq', f: NT.G3, d: 14, at: 36 }],
    draw: [{ w: 'sq', f: NT.G4, d: 12 }, { w: 'sq', f: NT.G4, d: 12, at: 16 }],
  };
  GS.SFX_LIST = Object.keys(SFX);
  // Start / restart the context. 'suspended' (autoplay policy, a browser pause) and iOS 'interrupted' (another app,
  // a call) both need resume(); it only works from a user gesture on some browsers, so the listeners below retry on
  // every tap / key and when the page is shown again. A rejected resume is not an error (the next gesture retries).
  function audioResume() {
    const a = AU.ctx;
    if (!a || a.state === 'running' || a.state === 'closed') return;
    try { const p = a.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* retried on the next gesture */ }
  }
  GS.audioInit = function () {
    try {
      if (AU.ctx && AU.ctx.state === 'closed') AU.ctx = null; // closed by the browser: build a new one
      if (!AU.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        AU.ctx = new AC(); AU.master = AU.ctx.createGain(); AU.master.gain.value = GS.state.sound; AU.master.connect(AU.ctx.destination);
        const n = AU.ctx.sampleRate, b = AU.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        AU.noise = b;
      }
      audioResume();
    } catch (e) { console.warn('[GS] audio unavailable', e); }
    return AU.ctx;
  };
  // With sound on, any user gesture brings a stopped context back.
  const resumeOnGesture = () => { if (GS.state.sound > 0) audioResume(); };
  ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'].forEach(t => window.addEventListener(t, resumeOnGesture, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeOnGesture(); });
  let lastSfxResume = 0;
  // js/bgm.js plays through the same context and master volume
  GS.audioNodes = () => (AU.ctx && AU.master ? { ctx: AU.ctx, master: AU.master } : null);
  GS.setSound = function (level) {
    GS.state.sound = Math.max(0, +level || 0);
    if (GS.state.sound > 0) GS.audioInit();
    // a short glide, not a step: the music is sounding when 音 changes, and a step clicks
    if (AU.master) {
      const g = AU.master.gain, now = AU.ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.setTargetAtTime(GS.state.sound, now, 0.015);
    }
    if (GS.bgm && GS.bgm.sync) GS.bgm.sync();
    if (GS.shell.refresh) GS.shell.refresh();
  };
  // Generic option setter (ROM OPTION <-> shell settings stay in sync).
  GS.setOption = function (key, value) {
    if (key === 'sound') return GS.setSound(value);
    GS.state[key] = value;
    if (key === 'bgm' && GS.bgm && GS.bgm.sync) GS.bgm.sync();
    if (GS.shell.refresh) GS.shell.refresh(key);
  };
  GS.sfx = function (name, opts) {
    if (!AU.ctx || GS.state.sound <= 0) return;
    if (AU.ctx.state !== 'running') { // stopped outside a gesture: try again (allowed once the page had a gesture), 1/s at most
      const now = Date.now(); if (now - lastSfxResume > 1000) { lastSfxResume = now; audioResume(); }
    }
    if (name === 'heart' && !GS.state.warnSound) return;
    const def = SFX[name]; if (!def) { warnOnce('sfx:' + name, 'unknown sfx', name); return; }
    const a = AU.ctx, t0 = a.currentTime + 0.005, fr = 1 / 60, nodes = [];
    let out = AU.master;
    if (opts && opts.pan != null && GS.state.stereo && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = GS.clamp(opts.pan, -1, 1); p.connect(AU.master); out = p; nodes.push(p); }
    let end = t0;
    for (const n of def) {
      const s = t0 + (n.at || 0) * fr, d = n.d * fr, e = s + d; end = Math.max(end, e);
      const g = a.createGain(), base = n.w === 'sq' ? 0.16 : n.w === 'tri' ? 0.34 : 0.28, gv = base * (n.g || 1);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(gv, s + 0.002);
      g.gain.setValueAtTime(gv, Math.max(s + 0.002, e - 0.006)); g.gain.linearRampToValueAtTime(0, e);
      g.connect(out); nodes.push(g);
      let src;
      if (n.w === 'noise') {
        src = a.createBufferSource(); src.buffer = AU.noise; src.loop = true;
        if (n.lp) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = n.lp; src.connect(fl); fl.connect(g); nodes.push(fl); } else src.connect(g);
      } else {
        src = a.createOscillator(); src.type = n.w === 'sq' ? 'square' : 'triangle';
        src.frequency.setValueAtTime(n.f, s); if (n.f1) src.frequency.linearRampToValueAtTime(n.f1, e);
        src.connect(g);
      }
      src.start(s); src.stop(e + 0.01); nodes.push(src);
    }
    const v = { nodes, end };
    AU.voices = AU.voices.filter(x => x.end > a.currentTime);
    AU.voices.push(v);
    while (AU.voices.length > 8) { const old = AU.voices.shift(); old.nodes.forEach(nd => { try { if (nd.stop) nd.stop(); nd.disconnect(); } catch (e) { /* already stopped */ } }); }
  };

  // =====================================================================
  // shell bridge (shell.js overrides these; manual.html loads no shell and keeps the no-ops)
  // =====================================================================
  GS.shell = Object.assign({
    setDeck() {}, say() {}, openManual() {}, toast() {}, refresh() {}, setCursor() {}, beforeEnter() {}, onGo() {}, onRegister() {},
  }, GS.shell || {});

  // =====================================================================
  // screens, loop, compositing
  // =====================================================================
  const screens = Object.create(null);   // no prototype: an id such as 'constructor' (e.g. from a #hash) is no screen
  GS.screens = screens;
  const cur = { id: null, state: null, t: 0, fresh: true, params: {} };
  Object.defineProperty(GS, 'current', { get: () => ({ id: cur.id, state: cur.state, t: cur.t, params: cur.params }), configurable: true });
  GS.registerScreen = function (id, def) {
    def.id = id; def.states = def.states || []; def.labels = def.labels || {};
    screens[id] = def;
    if (GS.shell.onRegister) GS.shell.onRegister(id);
    return def;
  };
  GS.listStates = function () {
    return Object.keys(screens).map(id => ({ id, states: screens[id].states.slice(), labels: Object.assign({}, screens[id].labels) }));
  };
  const errSeen = new Set();
  function safe(fn, label) {
    try { return fn(); } catch (e) {
      const k = label + ':' + e.message;
      if (!errSeen.has(k)) { errSeen.add(k); console.error('[GS] ' + label, e); }
      return undefined;
    }
  }
  GS.go = function (id, stateId, params) {
    params = params || {};
    const def = screens[id];
    if (!def) { console.warn('[GS] screen not registered:', id); return false; }
    const st = stateId || def.states[0] || null;
    if (!params.keepFx) { trs = []; resetFx(); }
    cur.id = id; cur.state = st; cur.t = 0; cur.fresh = true; cur.params = params;
    // GS.hashRouting === false (set by shell.js when the page has no ?mock=1): no #screen/state in the URL
    if (!headless && GS.hashRouting !== false) {
      const h = '#' + id + (st ? '/' + st : '');
      if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
    }
    // shell resets per-screen chrome (e.g. the ROM cursor) BEFORE enter(), so enter() may set its own
    if (GS.shell.beforeEnter) GS.shell.beforeEnter(id, st, def);
    if (def.enter) safe(() => def.enter(st, params), id + '.enter');
    // BGM: the screen's def.bgm(state, params) picks the track (js/bgm.js)
    if (GS.bgm && GS.bgm.onScene) safe(() => GS.bgm.onScene(id, st, def, params), id + '.bgm');
    GS.dirty = true;
    if (GS.shell.onGo) GS.shell.onGo(id, st, def);
    return true;
  };
  GS.restart = function () { if (cur.id) GS.go(cur.id, cur.state, cur.params); };
  GS.autoPause = function (reason) { const d = screens[cur.id]; if (d && d.onPause) safe(() => d.onPause(reason), cur.id + '.onPause'); };

  function updatesBlocked() { const s = GS.state; return s.freeze || s.manualOpen || s.settingsOpen; }
  function step() {
    inputBegin();
    if (cur.fresh) cur.fresh = false; else cur.t++;
    GS.state.frame++;
    const def = screens[cur.id];
    if (def && def.update) { const id = cur.id; safe(() => def.update(cur.t, GS.input), id + '.update'); }
    tickFx();
    inputEnd();
  }
  function drawIdle(Lr) {
    Lr.bg1.fillStyle = PAL.band; Lr.bg1.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) { Lr.bg1.fillStyle = PAL.win; Lr.bg1.fillRect(0, y, W, 1); }
    GS.banner(Lr.hud, 'GUN SPLASH', 128, 80, { align: 'center', set: 'H5' });
    GS.text8(Lr.hud, 'NO SCREEN LOADED', 128, 112, { align: 'center', set: 'H0' });
    GS.text8(Lr.hud, '©199X GUN SPLASH PROJECT', 128, 192, { align: 'center', set: 'HL' });
  }
  function composite(out, fx) {
    const sx = fx.shake ? fx.shake[0] | 0 : 0, sy = fx.shake ? fx.shake[1] | 0 : 0;
    bgx.globalAlpha = 1; bgx.clearRect(0, 0, W, H); bgx.imageSmoothingEnabled = false;
    bgx.fillStyle = PAL.ink; bgx.fillRect(0, 0, W, H);
    bgx.drawImage(layerCanvas.bg1, sx, sy);
    const L2 = layerCanvas.bg2, wv = fx.wave;
    if (wv) {
      const y0 = GS.clamp(wv.y0 | 0, 0, H - 1), y1 = GS.clamp(wv.y1 == null ? H - 1 : wv.y1 | 0, y0, H - 1);
      const amp = wv.amp == null ? 1 : wv.amp, per = wv.period || 32, ph = wv.phase || 0;
      if (y0 > 0) bgx.drawImage(L2, 0, 0, W, y0, sx, sy, W, y0);
      // raster scroll wraps horizontally (src x = (x - dx) mod 256), so the shifted-out column re-enters on the other side.
      // Consecutive rows with the same offset are copied as one band (same pixels, ~10 blits instead of ~160).
      const offAt = y => R(amp * Math.sin((2 * Math.PI * (y + ph)) / per));
      for (let y = y0; y <= y1;) {
        const dx = offAt(y); let y2 = y + 1;
        while (y2 <= y1 && offAt(y2) === dx) y2++;
        const h = y2 - y;
        bgx.drawImage(L2, 0, y, W, h, sx + dx, sy + y, W, h);
        if (dx) bgx.drawImage(L2, 0, y, W, h, sx + dx - Math.sign(dx) * W, sy + y, W, h);
        y = y2;
      }
      if (y1 < H - 1) bgx.drawImage(L2, 0, y1 + 1, W, H - y1 - 1, sx, sy + y1 + 1, W, H - y1 - 1);
    } else bgx.drawImage(L2, sx, sy);
    if (fx.mosaic > 1) mosaicInto(bgBuf, bgx, 0, 0, W, H, Math.min(16, fx.mosaic | 0));
    out.globalAlpha = 1; out.globalCompositeOperation = 'source-over'; out.imageSmoothingEnabled = false;
    out.drawImage(bgBuf, 0, 0);
    const dimA = fx.dim === true ? 0.5 : typeof fx.dim === 'number' ? 0.5 * GS.clamp(fx.dim, 0, 1) : 0;
    if (dimA && fx.dimTarget === 'bg') { out.fillStyle = 'rgba(0,0,0,' + dimA + ')'; out.fillRect(0, 0, W, H); }
    out.drawImage(layerCanvas.obj, sx, sy);
    if (dimA && fx.dimTarget !== 'bg') { out.fillStyle = 'rgba(0,0,0,' + dimA + ')'; out.fillRect(0, 0, W, H); }
    out.drawImage(layerCanvas.hud, 0, 0);
    if (fx.iris) {
      const ix = R(fx.iris.x), iy = R(fx.iris.y), r = Math.max(0, R(fx.iris.r));
      out.fillStyle = '#000';
      for (let y = 0; y < H; y++) {
        const dy = y - iy;
        if (Math.abs(dy) > r || r === 0) { out.fillRect(0, y, W, 1); continue; }
        const hw = F(Math.sqrt(r * r - dy * dy));
        if (ix - hw > 0) out.fillRect(0, y, ix - hw, 1);
        if (ix + hw + 1 < W) out.fillRect(ix + hw + 1, y, W - (ix + hw + 1), 1);
      }
    }
    if (fx.flash > 0) {
      out.globalCompositeOperation = 'lighter'; const v = R(176 * GS.clamp(fx.flash, 0, 1));
      out.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; out.fillRect(0, 0, W, H); out.globalCompositeOperation = 'source-over';
    }
    const br = GS.clamp(fx.bright == null ? 15 : fx.bright | 0, 0, 15);
    if (br < 15) { out.fillStyle = br <= 0 ? '#000' : 'rgba(0,0,0,' + (15 - br) / 15 + ')'; out.fillRect(0, 0, W, H); }
    if (GS.state.grid) {
      out.globalAlpha = 0.28; out.fillStyle = '#F8F8F0';
      for (let x = 8; x < W; x += 8) out.fillRect(x, 0, 1, H);
      for (let y = 8; y < H; y += 8) out.fillRect(0, y, W, 1);
      out.globalAlpha = 0.9;
      const box = (r, c) => { out.fillStyle = c; out.fillRect(r.x, r.y, r.w, 1); out.fillRect(r.x, r.y + r.h - 1, r.w, 1); out.fillRect(r.x, r.y, 1, r.h); out.fillRect(r.x + r.w - 1, r.y, 1, r.h); };
      box(SAFE.action, '#F85078'); box(SAFE.title, '#F8D860');
      out.globalAlpha = 1;
    }
  }
  function drawScreen(def, stateId, t, stillMode) {
    clearLayers();
    if (!def) { drawIdle(L); return; }
    if (stillMode) { if (def.still) safe(() => def.still(stateId, L), def.id + '.still'); else if (def.draw) safe(() => def.draw(L, 0), def.id + '.draw'); }
    else if (def.draw) safe(() => def.draw(L, t), def.id + '.draw');
  }
  function present() {
    if (!display) return;
    if (!dctx) dctx = display.getContext('2d');
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(frameBuf, 0, 0, display.width, display.height);
  }
  function render() {
    drawScreen(screens[cur.id], cur.state, cur.t, false);
    composite(framex, GS.fx);
    present();
    GS.dirty = false;
  }
  GS.render = render;
  GS.dirty = true;
  // Draw any function into a canvas through the normal compositor (default fx unless fxPatch).
  GS.renderTo = function (canvas, drawFn, fxPatch) {
    const save = GS.fx; GS.fx = Object.assign(defaultFx(), fxPatch || {});
    clearLayers(); safe(() => drawFn(L), 'renderTo');
    const out = mk(W, H), ox = ctx2d(out); composite(ox, GS.fx);
    GS.fx = save; GS.dirty = true;
    if (canvas) {
      if (!canvas.width || !canvas.height) { canvas.width = W; canvas.height = H; }
      const cx = canvas.getContext('2d'); cx.imageSmoothingEnabled = false; cx.clearRect(0, 0, canvas.width, canvas.height);
      cx.drawImage(out, 0, 0, canvas.width, canvas.height);
    }
    return canvas || out;
  };
  GS.still = function (id, stateId, canvas) {
    const def = screens[id]; if (!def) { warnOnce('still:' + id, 'GS.still: screen not registered', id); return null; }
    const st = stateId || def.states[0];
    drawingStill = true;
    const save = GS.fx; GS.fx = defaultFx();
    drawScreen(def, st, 0, true);
    const fxUsed = GS.fx; GS.fx = save;
    const out = mk(W, H); composite(ctx2d(out), fxUsed);
    drawingStill = false; GS.dirty = true;
    if (canvas) {
      if (!canvas.width || !canvas.height) { canvas.width = W; canvas.height = H; }
      const cx = canvas.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(out, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    return out;
  };
  // Test hook: run n fixed steps (update + draw) synchronously, even while rAF is paused or frozen.
  GS.tick = function (n) { n = n == null ? 1 : n; for (let i = 0; i < n; i++) { step(); render(); } return GS.current; };

  let running = false, last = 0, acc = 0;
  const DT = 1000 / 60;
  function frameCb(ts) {
    if (!running) return;
    requestAnimationFrame(frameCb);
    if (!last) last = ts;
    let dt = ts - last; last = ts; if (dt > 250) dt = 250;
    acc += dt; let n = 0, stepped = false;
    while (acc >= DT - 0.5 && n < 4) { acc -= DT; n++; if (!updatesBlocked()) { step(); stepped = true; } }
    if (n >= 4) acc = 0;
    if (acc < 0) acc = 0;
    if (stepped || GS.dirty) render();
  }
  let bootP = null;
  // opts.rom: the display canvas (default #rom); opts.headless: no display, input or loop (the manual's stills)
  GS.boot = function (opts) {
    if (bootP) return bootP;
    opts = opts || {};
    headless = !!opts.headless;
    bootP = (async () => {
      if (!headless) {
        const rom = opts.rom || document.getElementById('rom');
        if (rom) { display = rom; dctx = rom.getContext('2d'); GS.dirty = true; attachInput(rom); }
      }
      await fontReady;
      await appReadyP; // boot gate: until GS.installApp
      if (!headless) { running = true; requestAnimationFrame(frameCb); render(); }
      return GS;
    })();
    return bootP;
  };

  // numeric formatting helpers for HUD code
  GS.pad = (n, w, ch) => { const s = String(n); return s.length >= w ? s : (ch == null ? ' ' : ch).repeat(w - s.length) + s; };
  GS.fixed1 = v => (F(v * 10 + 1e-6) / 10).toFixed(1);
})();
