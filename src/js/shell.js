/* ガン・スプラッシュ 復刻版 — shell
 * The modern re-release frame around the ROM: launcher, top bar, bezel, wallpaper, display/scale modes,
 * responsive layouts (lay-pc / lay-portrait / lay-landscape), touch deck & rails, legend, subtitles,
 * toasts, settings, MOCK switcher, hash routing, auto-pause, manual iframe.
 */
(function () {
  'use strict';
  const GS = window.GS;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const body = document.body;
  const rom = $('#rom'), stageEl = $('#stage'), bezel = $('#bezel'), crt = $('#crt');
  const deckEl = $('#deck'), railL = $('#rail-l'), railR = $('#rail-r'), legendEl = $('#legend'), subEl = $('#subtitle');
  const topbar = $('#topbar'), bootEl = $('#boot'), settingsEl = $('#settings'), mockEl = $('#mockpanel');
  const manualLayer = $('#manual-layer'), manualFrame = $('#manual-frame'), liveEl = $('#live'), toastsEl = $('#toasts');
  const stickEl = $('#stick');

  // The MOCK button / panel exists only with ?mock=1 or ?debug=1, the #screen/state hash routes only with ?mock=1
  // (so a reload at ?debug=1 never swaps the real match for a scripted mock screen); otherwise the game always
  // starts from the launcher and the URL gets no hash. (core.js reads ?debug=1 on its own for GS.DEBUG.)
  const query = new URLSearchParams(location.search);
  const queryOn = key => query.getAll(key).indexOf('1') >= 0;   // ?key=1 anywhere in the query
  const MOCK_ON = queryOn('mock') || queryOn('debug');
  const HASH_ON = queryOn('mock');
  GS.hashRouting = HASH_ON;
  if (!MOCK_ON) $('#topbar [data-act="mock"]').remove();

  // ------------------------------------------------------------------ prefs
  const PREF_KEY = 'gs-retro-shell-v1';
  // saved values outside these choices (the settings panel's data-v, the MOCK layout select) fall back to the default
  const prefs = GS.loadPrefs(PREF_KEY, { display: 'dot', scaleMode: 'auto', wallpaper: 'water', warnSound: true, stereo: true, bgm: true,
    reducedPref: 'auto', subtitles: false, layoutOverride: 'auto', lastManual: 'p1' }, {
    display: ['dot', '43', 'crt'], scaleMode: ['auto', 'int', 'fill'], wallpaper: ['water', 'desk', 'none'],
    reducedPref: ['auto', 'on', 'off'], layoutOverride: ['auto', 'pc', 'portrait', 'landscape'],
    lastManual: /^[a-z][a-z0-9]{0,15}$/,   // a manual page id (p1, cover1, ...); manual.js checks it against its pages
  });
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } }

  const mqCoarse = matchMedia('(pointer: coarse)');
  const mqAnyCoarse = matchMedia('(any-pointer: coarse)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const isTouch = () => mqCoarse.matches || (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

  let deckSpec = { type: 'none' };
  let legend = { pc: '', touch: '' };
  let curId = null, curState = null;
  let lastLayout = null;
  let devBox = null; // device-pixel size of the viewport from ResizeObserver
  let shellReady = false;
  let lastDpr = window.devicePixelRatio || 1;
  let legendFitH = 40, launcherDrawn = false;
  const appEl = $('#app');

  // MOCK panel's 動きをへらす is a session-only override (never saved), so testing it cannot silently
  // replace the OS prefers-reduced-motion for later visits. null = follow the settings value.
  let mockReduced = null;
  function applyReduced() {
    GS.state.reduced = mockReduced != null ? mockReduced
      : prefs.reducedPref === 'on' ? true : prefs.reducedPref === 'off' ? false : mqReduce.matches;
    body.classList.toggle('reduced', GS.state.reduced);
    postManualPrefs();
  }
  function applyPrefsToState() {
    GS.state.display = prefs.display; GS.state.scaleMode = prefs.scaleMode;
    GS.state.warnSound = !!prefs.warnSound; GS.state.stereo = prefs.stereo !== false; GS.state.subtitles = !!prefs.subtitles;
    if (GS.state.bgm !== (prefs.bgm !== false)) { GS.state.bgm = prefs.bgm !== false; if (GS.bgm) GS.bgm.sync(); }
    applyReduced();
    body.classList.remove('wp-water', 'wp-desk', 'wp-none'); body.classList.add('wp-' + prefs.wallpaper);
  }

  // ------------------------------------------------------------------ layout
  const probe = document.createElement('div'); probe.id = 'safe-probe'; body.append(probe);
  function safeInsets() {
    const cs = getComputedStyle(probe), v = k => parseFloat(cs[k]) || 0;
    return { l: v('paddingLeft'), r: v('paddingRight'), t: v('paddingTop'), b: v('paddingBottom') };
  }
  function decideLayout(vw, vh) {
    // the MOCK panel's layout override counts only while that panel is available (?mock=1 / ?debug=1)
    if (MOCK_ON && prefs.layoutOverride && prefs.layoutOverride !== 'auto') return prefs.layoutOverride;
    const touch = isTouch();
    if (touch && vw < vh) return 'portrait';
    if (touch && vw > vh && vh < 560) return 'landscape';
    return 'pc';
  }
  // integer / fill scaling. Returns CSS + buffer sizes.
  function fit(availW, availH, mode, xr, dpr) {
    availW = Math.max(16, availW); availH = Math.max(16, availH);
    if (mode === 'int') {
      const n = Math.max(1, Math.floor(Math.min((availW * dpr) / (256 * xr), (availH * dpr) / 224) + 1e-6));
      return { mode, n, dev: n, bufW: n * 256, bufH: n * 224, cssW: (n * 256 * xr) / dpr, cssH: (n * 224) / dpr, pixelated: xr === 1 };
    }
    const s = Math.min(availW / (256 * xr), availH / 224);
    return { mode, n: s, dev: s * dpr, bufW: 256, bufH: 224, cssW: 256 * xr * s, cssH: 224 * s, pixelated: true };
  }
  const snap = (v, dpr) => Math.round(v * dpr) / dpr;
  function setBox(el, x, y, w, h) {
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (w != null) el.style.width = Math.max(0, w) + 'px';
    if (h != null) el.style.height = Math.max(0, h) + 'px';
  }
  function layout() {
    const vw = viewportW(), vh = viewportH();
    // real device pixels per CSS px: from device-pixel-content-box when available (Safari: devicePixelRatio)
    let dpr = window.devicePixelRatio || 1;
    if (devBox && devBox.w > 0 && vw > 0) { const r = devBox.w / vw; if (Math.abs(r - dpr) > 0.02) dpr = r; }
    const lay = decideLayout(vw, vh);
    GS.state.layout = lay; GS.state.touch = isTouch();
    body.classList.remove('lay-pc', 'lay-portrait', 'lay-landscape'); body.classList.add('lay-' + lay);
    body.classList.toggle('touch-pc', lay === 'pc' && mqAnyCoarse.matches);
    const xr = prefs.display === 'dot' ? 1 : 7 / 6;
    const mode = prefs.scaleMode === 'auto' ? (lay === 'portrait' ? 'fill' : 'int') : prefs.scaleMode;
    const subH = prefs.subtitles ? 28 : 0;
    const ins = safeInsets();
    let f, x, y, bez = 8, topH = 0, legendH = 0;
    if (lay === 'pc') {
      topH = 48 + ins.t; legendH = fitLegend(vw);
      const aw = vw - 16, ah = vh - topH - legendH - 8;
      const withB = fit(aw - 16, ah - 16, mode, xr, dpr), noB = fit(aw, ah, mode, xr, dpr);
      // drop (shrink) the 8px bezel whenever that gives a bigger picture: int = one more scale step, fill = always
      if (noB.cssW > withB.cssW + 0.01) { f = noB; bez = Math.max(0, Math.min(8, Math.floor(Math.min((aw - f.cssW) / 2, (ah - f.cssH) / 2)))); }
      else f = withB;
      x = (vw - f.cssW) / 2; y = topH + 4 + (ah - f.cssH) / 2;
    } else if (lay === 'portrait') {
      topH = 52 + ins.t; // 44px buttons + 4px margins, below the status bar / notch (viewport-fit=cover)
      const aw = vw - 16 - ins.l - ins.r, ah = vh - topH - 16 - subH - 220 - ins.b;
      f = fit(aw, ah, mode, xr, dpr);
      x = (vw - f.cssW) / 2; y = topH + 8;
    } else {
      const rail = 160;
      const aw = vw - 2 * rail - ins.l - ins.r, ah = vh - 16 - ins.t - ins.b;
      f = fit(aw, ah, mode, xr, dpr);
      x = (vw - f.cssW) / 2; y = Math.max(8 + ins.t, (vh - f.cssH) / 2);
    }
    x = snap(x, dpr); y = snap(y, dpr);
    // canvas buffer and css size
    if (rom.width !== f.bufW) rom.width = f.bufW;
    if (rom.height !== f.bufH) rom.height = f.bufH;
    rom.style.width = f.cssW + 'px'; rom.style.height = f.cssH + 'px';
    rom.style.imageRendering = f.pixelated ? 'pixelated' : 'auto';
    setBox(stageEl, x, y, f.cssW, f.cssH);
    bezel.style.setProperty('--bez', bez + 'px');
    // CRT: disabled automatically below x3
    const crtOn = prefs.display === 'crt' && f.dev >= 3;
    body.classList.toggle('crt-on', crtOn);
    if (crtOn) {
      // one dark line per ROM row (period = one ROM row in CSS px), so int and fill scaling never beat against the rows
      const per = f.cssH / 224, dark = Math.min(1 / dpr, per / 3);
      crt.style.setProperty('--scan', 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ' + (per - dark) + 'px, rgba(0,0,0,.35) ' + (per - dark) + 'px, rgba(0,0,0,.35) ' + per + 'px)');
    }
    // chrome around the ROM
    topbar.style.height = lay === 'landscape' ? '' : topH + 'px';
    body.style.setProperty('--top-h', (lay === 'landscape' ? ins.t : topH) + 'px');
    body.style.setProperty('--legend-h', (lay === 'pc' ? legendH : ins.b) + 'px');
    legendEl.style.height = legendH ? legendH + 'px' : '';
    const romBottom = y + f.cssH;
    subEl.style.height = '';
    if (lay === 'portrait') {
      subEl.dataset.place = 'below';
      setBox(subEl, 8, romBottom + 4, vw - 16, 24);
      const dTop = romBottom + 8 + subH;
      setBox(deckEl, 0, dTop, vw, vh - dTop);
    } else if (lay === 'pc') {
      // subtitles, one line just outside the ROM: below the bezel when there is room, else on the legend bar
      // (it covers the key caps while it shows), never over the ROM
      const below = romBottom + bez + 4;
      if (below + 26 <= vh - legendH) { subEl.dataset.place = 'below'; setBox(subEl, 16, below, vw - 32, 26); }
      else { subEl.dataset.place = 'legend'; setBox(subEl, 0, vh - legendH, vw, legendH); }
    } else {
      // landscape: in the left rail, under the ポーズ / 設定 buttons (wraps to several lines if needed)
      subEl.dataset.place = 'rail';
      setBox(subEl, 8 + ins.l, ins.t + 60, Math.max(96, x - 16 - ins.l), null);
      setBox(railL, 0, 0, x, vh); setBox(railR, x + f.cssW, 0, vw - x - f.cssW, vh);
    }
    if (lay === 'pc' && mqAnyCoarse.matches) { setBox(railL, 0, topH, Math.max(0, x - bez), vh - topH - legendH); setBox(railR, x + f.cssW + bez, topH, Math.max(0, vw - x - f.cssW - bez), vh - topH - legendH); }
    GS.state.scale = { n: f.n, dev: f.dev, mode: f.mode, cssW: f.cssW, cssH: f.cssH, x, y, bezel: bez };
    GS.dirty = true;
    if (lay !== lastLayout) { const prev = lastLayout; lastLayout = lay; renderDeck(); if (prev) GS.autoPause('rotate'); }
    syncTopbar();
    lastDpr = dpr; sizeLauncher();
  }

  // PC legend bar: 1) as is, 2) compact (smaller gaps and type), 3) two rows (the bar grows and the ROM area
  // shrinks). Never clips: every key cap stays visible at any window width. Returns the bar height.
  function fitLegend(vw) {
    if (GS.state.layout !== 'pc') return 40;
    legendEl.classList.remove('compact', 'wrap');
    legendEl.style.height = '';
    const segs = $$('.lg-seg', legendEl);
    if (!segs.length) return (legendFitH = 40);
    const need = () => {
      const cs = getComputedStyle(legendEl), gap = parseFloat(cs.columnGap) || 0;
      return segs.reduce((s, e) => s + e.offsetWidth, 0) + gap * (segs.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    };
    if (need() <= vw) return (legendFitH = 40);
    legendEl.classList.add('compact');
    if (need() <= vw) return (legendFitH = 40);
    legendEl.classList.add('wrap');
    return (legendFitH = Math.max(40, Math.ceil(legendEl.offsetHeight)));
  }

  // Launcher package art: the 256x224 still is shown at a whole number of device pixels per ROM pixel
  // (n*256 device px), choosing the n closest to the box's natural width. The box and the bezel margin absorb
  // the rest, so the dots are always even.
  function sizeLauncher() {
    const shot = $('#boot-shot'), box = $('.pkg-box'), bz = $('.pkg-bezel');
    if (!shot || !box || !bz || bootEl.hidden) return;
    const dpr = lastDpr || 1;
    box.style.width = ''; bz.style.marginLeft = ''; bz.style.marginRight = '';
    const vwNow = viewportW();
    const bcs = getComputedStyle(bootEl), padX = parseFloat(bcs.paddingLeft) + parseFloat(bcs.paddingRight);
    const avail = Math.max(64, bz.clientWidth - 16);             // canvas width the CSS would give (bezel padding 8+8)
    const chrome = box.offsetWidth - avail;                       // box border + bezel margins + padding
    let room = vwNow - padX - 26;                                 // widest canvas the viewport allows (4px bezel margins)
    const inner = $('.boot-inner'), pkg = $('.pkg');
    if (inner && pkg && getComputedStyle(inner).flexDirection === 'row') {
      // side-by-side launcher: the package must also fit the viewport height (no scrolling the art away)
      const padY = parseFloat(bcs.paddingTop) + parseFloat(bcs.paddingBottom);
      const nonCanvasH = pkg.offsetHeight - shot.getBoundingClientRect().height;
      room = Math.min(room, ((viewportH() - padY - nonCanvasH) * 256) / 224);
    }
    const n1 = Math.max(1, Math.floor((avail * dpr) / 256 + 1e-6)), w1 = (n1 * 256) / dpr, w2 = ((n1 + 1) * 256) / dpr;
    const n = w2 <= Math.min(avail * 1.3, room) && w2 - avail < avail - w1 ? n1 + 1 : n1;
    let w = (n * 256) / dpr;
    if (w > room) w = Math.max(64, room); // tiny viewport only: fall back to non-integer
    const boxW = Math.min(w + chrome, vwNow - padX);
    box.style.width = boxW + 'px';
    const mx = Math.max(4, (boxW - 2 - 16 - w) / 2);
    bz.style.marginLeft = mx + 'px'; bz.style.marginRight = mx + 'px';
    shot.style.width = w + 'px'; shot.style.height = (w * 224) / 256 + 'px';
    if (shot.width !== n * 256 || shot.height !== n * 224) { shot.width = n * 256; shot.height = n * 224; if (launcherDrawn) drawLauncher(); }
  }

  // ------------------------------------------------------------------ helpers
  // viewport size in CSS px without the scrollbars (inner size as the fallback)
  function viewportW() { return document.documentElement.clientWidth || window.innerWidth; }
  function viewportH() { return document.documentElement.clientHeight || window.innerHeight; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(label, cls, onClick, extra) {
    const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button';
    if (onClick) b.addEventListener('click', e => { onClick(e); b.blur(); });
    if (extra) Object.assign(b, extra);
    return b;
  }
  function pressBtn(name) { return () => GS.input.press(name); }
  // an ON / OFF setting: '1' from a settings button (data-v), true from code
  function asBool(v) { return v === '1' || v === true; }
  const safeCall = (fn, fb) => { try { return fn(); } catch (e) { console.error('[shell]', e); return fb; } };

  // ------------------------------------------------------------------ deck / rails
  function weaponIcon(w) {
    const name = 'icon_' + (w || 'normal');
    const c = GS.hasSprite(name) ? GS.spriteCanvas(name, { pal: 'blue', scale: 3 }) : GS.makeCanvas(48, 48);
    c.className = 'wicon'; c.setAttribute('aria-hidden', 'true'); return c;
  }
  function weaponButton() {
    const b = el('button', 'btn wbtn'); b.type = 'button'; b.setAttribute('aria-label', 'ぶきを きりかえる');
    b.append(weaponIcon(deckSpec.weapon), el('span', 'wlabel', 'ぶき'));
    b.addEventListener('pointerdown', e => { e.stopPropagation(); GS.input.virtual('weapon', true); b.classList.add('down'); });
    const up = () => { GS.input.virtual('weapon', false); b.classList.remove('down'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); GS.input.press('weapon'); } });
    return b;
  }
  function menuButtons() {
    const wrap = el('div', 'dk-menu');
    (deckSpec.items || []).forEach((it, i) => {
      const b = button(it.label, 'dk-item', () => { GS.menuPick(i); });
      b.disabled = !!it.disabled; b.dataset.i = i;
      if (i === deckSpec.index) { b.classList.add('sel'); b.setAttribute('aria-current', 'true'); }
      wrap.append(b);
    });
    return wrap;
  }
  function updateMenuSelection() {
    $$('.dk-item').forEach(b => { const on = +b.dataset.i === deckSpec.index; b.classList.toggle('sel', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  function railTop(side) {
    const g = el('div', 'rail-top');
    if (side === 'l') {
      if (curId === 'play') g.append(button('ポーズ', 'rt', pressBtn('pause'), { ariaLabel: 'ポーズ' }));
      g.append(button('設定', 'rt', toggleSettings));
    } else {
      g.append(button('説明', 'rt', openManualHere, { ariaLabel: 'せつめいしょ' }));
      if (MOCK_ON) g.append(button('MOCK', 'rt rt-mock', toggleMock));
    }
    return g;
  }
  function hintEl() { return el('p', 'deck-hint', legend.touch || ''); }
  function renderDeck() {
    deckEl.textContent = ''; railL.textContent = ''; railR.textContent = '';
    const lay = GS.state.layout, t = deckSpec.type || 'none';
    body.classList.toggle('deck-play', t === 'play');
    if (lay === 'portrait') {
      if (legend.touch) deckEl.append(hintEl());
      if (t === 'menu') deckEl.append(menuButtons());
      else if (t === 'stage') {
        const row = el('div', 'dk-row');
        row.append(button('◀', 'dk-big dk-arrow', pressBtn('left'), { ariaLabel: 'まえのステージ' }), button('しゅつげき', 'dk-big primary', pressBtn('ok')), button('▶', 'dk-big dk-arrow', pressBtn('right'), { ariaLabel: 'つぎのステージ' }));
        deckEl.append(row, button('もどる', 'dk-back', pressBtn('back')));
      } else if (t === 'play') {
        const pad = el('div', 'dk-play');
        const mv = el('div', 'pad pad-move'); mv.append(el('div', 'ring'), el('span', 'pad-label', 'いどう'));
        const fr = el('div', 'pad pad-fire'); fr.append(el('span', 'pad-label', 'おしている間 うつ'));
        pad.append(mv, fr, weaponButton());
        deckEl.append(pad);
      } else if (t === 'next') deckEl.append(button('つぎへ ▼', 'dk-next primary', pressBtn('ok')));
      else deckEl.append(button('取扱説明書をひらく', 'dk-back', openManualHere));
    } else if (lay === 'landscape' || (lay === 'pc' && mqAnyCoarse.matches)) {
      if (lay === 'landscape') { railL.append(railTop('l')); railR.append(railTop('r')); }
      const midR = el('div', 'rail-mid'), botL = el('div', 'rail-bot'), botR = el('div', 'rail-bot');
      if (t === 'menu') midR.append(menuButtons());
      else if (t === 'stage') {
        const row = el('div', 'dk-row');
        row.append(button('◀', 'dk-arrow', pressBtn('left'), { ariaLabel: 'まえのステージ' }), button('▶', 'dk-arrow', pressBtn('right'), { ariaLabel: 'つぎのステージ' }));
        midR.append(row, button('しゅつげき', 'primary', pressBtn('ok')), button('もどる', '', pressBtn('back')));
      } else if (t === 'play') {
        const mv = el('div', 'pad pad-move'); mv.append(el('div', 'ring'), el('span', 'pad-label', 'いどう'));
        botL.append(mv);
        midR.append(weaponButton());
        const fr = el('div', 'pad pad-fire'); fr.append(el('span', 'pad-label', 'うつ'));
        botR.append(fr);
      } else if (t === 'next') midR.append(button('つぎへ ▼', 'primary', pressBtn('ok')));
      railL.append(botL); railR.append(midR, botR);
    }
    syncTopbar();
  }

  // play: left half of the screen = stick, right half = fire, buttons excluded
  const pads = { move: null, fire: null };
  function playTouchActive() { return deckSpec.type === 'play' && (GS.state.layout !== 'pc' || mqAnyCoarse.matches); }
  function overlayOpen() { return GS.state.manualOpen || GS.state.settingsOpen || !mockEl.hidden || body.classList.contains('boot-open'); }
  document.addEventListener('pointerdown', e => {
    if (!playTouchActive() || e.pointerType === 'mouse' || overlayOpen()) return;
    if (e.target.closest('button, a, input, select, .panel, #topbar')) return;
    const left = e.clientX < window.innerWidth / 2;
    if (left && !pads.move) {
      pads.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on');
      stickEl.style.setProperty('--kx', '0px'); stickEl.style.setProperty('--ky', '0px');
      e.preventDefault();
    } else if (!left && !pads.fire) {
      pads.fire = { id: e.pointerId }; GS.input.virtual('fire', true); body.classList.add('firing'); e.preventDefault();
    }
  }, { capture: true, passive: false });
  document.addEventListener('pointermove', e => {
    const p = pads.move; if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.ox, dy = e.clientY - p.oy, d = Math.hypot(dx, dy), radius = 32, dead = 7;
    const s = Math.min(1, Math.max(0, (d - dead) / (radius - dead)));
    GS.input.setStick(d ? (dx / d) * s : 0, d ? (dy / d) * s : 0);
    const v = Math.min(d, radius);
    stickEl.style.setProperty('--kx', (d ? (dx / d) * v : 0) + 'px'); stickEl.style.setProperty('--ky', (d ? (dy / d) * v : 0) + 'px');
    e.preventDefault();
  }, { capture: true, passive: false });
  function releasePad(e) {
    if (pads.move && (!e || pads.move.id === e.pointerId)) { pads.move = null; GS.input.setStick(0, 0); stickEl.classList.remove('on'); }
    if (pads.fire && (!e || pads.fire.id === e.pointerId)) { pads.fire = null; GS.input.virtual('fire', false); body.classList.remove('firing'); }
  }
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, releasePad, true));
  // double-tap zoom: off with the play deck and whenever app.mjs locks zoom (countdown / play / spectate: html.zoom-locked)
  document.addEventListener('dblclick', e => { if (playTouchActive() || document.documentElement.classList.contains('zoom-locked')) e.preventDefault(); });
  // "がめんを タッチ" (title intro, demo, result pages 1-2): with a deck of type none / next, a tap on the deck, a rail,
  // the bezel or the wallpaper counts like a tap on the ROM ('any'; core.js handles the ROM itself). Buttons, panels,
  // the top bar and the overlays keep their own meaning.
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || overlayOpen()) return;
    const t = deckSpec.type || 'none';
    if (t !== 'none' && t !== 'next') return;
    const tg = e.target;
    if (!tg || !tg.closest || tg.closest('#rom, button, a, input, select, textarea, label, .panel, #topbar, #boot, #manual-layer, #toasts')) return;
    GS.input.press('any');
  });

  // ------------------------------------------------------------------ legend
  function renderLegend() {
    legendEl.textContent = '';
    const txt = legend.pc || '';
    txt.split(/\s+／\s+/).filter(Boolean).forEach(seg => {
      const s = el('span', 'lg-seg'), i = seg.indexOf('：');
      if (i < 0) s.append(el('span', 'lg-act', seg));
      else {
        seg.slice(0, i).split(/[／・]/).filter(Boolean).forEach(k => s.append(el('kbd', null, k)));
        s.append(el('span', 'lg-act', seg.slice(i + 1)));
      }
      legendEl.append(s);
    });
    // re-fit (compact / two rows) for the new content; relayout only when the bar height changes
    if (GS.state.layout === 'pc') {
      const before = legendFitH, h = fitLegend(viewportW());
      if (h !== before) layout(); else legendEl.style.height = h + 'px';
    }
  }

  // ------------------------------------------------------------------ public bridge
  GS.shell.setDeck = function (spec) {
    spec = spec || { type: 'none' };
    if (spec.fromMenu) {
      if (deckSpec.type !== 'menu') return;
      const same = JSON.stringify(deckSpec.items || []) === JSON.stringify(spec.items);
      deckSpec = Object.assign({}, deckSpec, { items: spec.items, index: spec.index });
      if (same) updateMenuSelection(); else renderDeck();
      return;
    }
    GS.invalidateMenus();
    const prev = deckSpec;
    deckSpec = Object.assign({ type: 'none' }, spec);
    if (prev.type === 'play' && deckSpec.type === 'play' && prev.weapon !== deckSpec.weapon) {
      $$('.wbtn .wicon').forEach(c => c.replaceWith(weaponIcon(deckSpec.weapon)));
      return;
    }
    if (deckSpec.type !== 'play') releasePad();
    renderDeck();
  };
  function setLegend(lg) {
    legend = Object.assign({ pc: '', touch: '' }, lg || {});
    renderLegend();
    $$('.deck-hint').forEach(h => { h.textContent = legend.touch || ''; });
    if (legend.touch && !$('.deck-hint') && GS.state.layout !== 'pc') renderDeck();
  }
  let subTimer = 0, liveTimer = 0, livePending = '';
  // opts: tone ('std'|'blue'|'orange'|'danger'), ms (subtitle time), sub:false = screen reader only (menu cursor)
  GS.shell.say = function (text, opts) {
    opts = opts || {};
    text = String(text == null ? '' : text);
    if (!text) return;
    // aria-live: clear, then set 30ms later; says arriving in the same moment are joined so none is lost
    livePending = livePending ? livePending + '　' + text : text;
    liveEl.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { liveEl.textContent = livePending; livePending = ''; }, 30);
    if (prefs.subtitles && opts.sub !== false) {
      subEl.textContent = text;
      subEl.classList.remove('tone-std', 'tone-blue', 'tone-orange', 'tone-danger');
      subEl.classList.add('show', 'tone-' + (opts.tone || 'std'));
      clearTimeout(subTimer); subTimer = setTimeout(() => subEl.classList.remove('show'), opts.ms || 2600);
    }
  };
  GS.shell.toast = function (text, opts) {
    const t = el('div', 'toast', text); toastsEl.append(t);
    setTimeout(() => t.classList.add('out'), (opts && opts.ms) || 5000);
    setTimeout(() => t.remove(), ((opts && opts.ms) || 5000) + 400);
  };
  GS.shell.setCursor = function (css) { rom.style.cursor = css || ''; };
  // The manual iframe is loaded once and then kept: closing only hides it, reopening moves it to the page by a
  // fragment navigation (manual.js follows hashchange), so there is no reload, re-boot or still redraw.
  let manualReturn = null;
  function focusManual() {
    try { manualFrame.focus(); if (manualFrame.contentWindow) manualFrame.contentWindow.focus(); } catch (e) { /* ignore */ }
  }
  // 動きをへらす for the manual's page-turn animation. manual.js reads GS.state.reduced from this page when it can;
  // where it cannot (file://, including the blob: manual of play.html: opaque origins), it uses the value sent as
  // {gs: 'manual-prefs', reduced}: after the manual loads and whenever the value changes (applyReduced).
  function postManualPrefs() {
    if (!manualFrame.getAttribute('src') || !manualFrame.contentWindow) return;
    try { manualFrame.contentWindow.postMessage({ gs: 'manual-prefs', reduced: !!GS.state.reduced }, '*'); } catch (e) { /* ignore */ }
  }
  manualFrame.addEventListener('load', () => {
    if (!manualFrame.getAttribute('src')) return;
    manualLayer.classList.remove('loading');
    postManualPrefs();
    if (GS.state.manualOpen) focusManual();
  });
  // Single-file build (play.html, made by standalone.mjs): every script is inlined as <script data-gs-src="js/X.js">
  // (ES modules as <script type="module" data-gs-src="X.mjs"> filling window.GS_MODULES), and manual.html /
  // manual.css are embedded as JSON in <script type="application/json" id="gs-embed">. The manual iframe then gets
  // a blob: document assembled from those texts, so it needs no network and works from file://: manual.css inline,
  // fonts/fonts.css as this page's <style data-gs-src="fonts/fonts.css"> (the fonts as data: URLs, in the file once),
  // each <script src="js/X.js"> replaced by this page's copy, import('./X.mjs') by the inlined module.
  // <html data-embed> tells manual.js it is embedded (a blob: URL cannot carry ?embed=1).
  let embeddedManual; // undefined = not looked up yet, null = not a single-file build (or it failed)
  function embeddedManualURL() {
    if (embeddedManual !== undefined) return embeddedManual;
    embeddedManual = null;
    const tag = document.getElementById('gs-embed');
    if (!tag) return null;
    try {
      const E = JSON.parse(tag.textContent);
      // a script of this page, or one only the manual needs (e.g. js/manual.js), embedded as text
      const src = name => {
        const s = $$('script[data-gs-src]').find(x => x.dataset.gsSrc === name);
        if (s) return s.textContent;
        if (typeof E[name] === 'string') return E[name];
        throw new Error('script ' + name + ' is neither inlined nor embedded');
      };
      // a stylesheet: manual.css from the embedded copy, fonts/fonts.css from this page's own inlined copy
      const style = name => {
        if (name === 'manual.css') return String(E['manual.css'] || '');
        const s = $$('style[data-gs-src]').find(x => x.dataset.gsSrc === name);
        if (s) return s.textContent;
        throw new Error('stylesheet ' + name + ' is neither inlined nor embedded');
      };
      const mods = [];
      let html = String(E['manual.html'] || '');
      if (!html) throw new Error('manual.html is not embedded');
      // 1) on manual.html's own text only: <html data-embed>, import('./X.mjs') -> the inlined module's exports
      html = html.replace(/<html\b/i, '<html data-embed')
        .replace(/import\((['"])\.\/([\w.-]+\.mjs)\1\)/g, (m, q, name) => {
          if (mods.indexOf(name) < 0) mods.push(name);
          return 'Promise.resolve(window.GS_MODULES[' + JSON.stringify(name) + '])';
        });
      // 2) one pass over its tags (inserted text is never scanned again): the stylesheets, the classic scripts, and
      //    the module wrappers right before its own first inline module
      let modsIn = false;
      html = html.replace(/<link rel="stylesheet" href="(?:\.\/)?(manual\.css|fonts\/fonts\.css)">|<script src="(?:\.\/)?(js\/[\w.-]+\.js)"><\/script>|<script type="module">/g, (m, css, name) => {
        if (name) return '<script data-gs-src="' + name + '">' + src(name) + '<\/script>';
        if (css) return '<style>' + style(css) + '</style>';
        if (modsIn) return m;
        modsIn = true;
        return mods.map(n => '<script type="module" data-gs-src="' + n + '">' + src(n) + '<\/script>\n').join('') + m;
      });
      if (mods.length && !modsIn) throw new Error('manual.html has no inline module for ' + mods.join(', '));
      embeddedManual = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    } catch (e) { console.error('[shell] the embedded manual could not be built', e); }
    return embeddedManual;
  }
  GS.shell.openManual = function (page) {
    page = page || prefs.lastManual || 'p1';
    prefs.lastManual = page; savePrefs();
    if (!GS.state.manualOpen) manualReturn = focusTrigger();
    const embedded = embeddedManualURL();
    const url = (embedded || 'manual.html?embed=1') + '#' + page;
    if (!manualFrame.getAttribute('src')) { manualLayer.classList.add('loading'); manualFrame.src = url; }
    else {
      let moved = false;
      try { const loc = manualFrame.contentWindow.location; if (loc.hash !== '#' + page) loc.hash = '#' + page; moved = true; } catch (e) { moved = false; }
      if (!moved) manualFrame.src = url; // file:// (opaque origin): same document, fragment-only navigation
    }
    manualLayer.hidden = false; GS.state.manualOpen = true; GS.input.clear(); releasePad();
    syncInert();
    setTimeout(focusManual, 60);
  };
  function openManualHere() { GS.shell.openManual(curId === 'result' ? 'p17' : undefined); } // from the result: p17 (how to read the result)
  // Focus return for modal layers. Only a trigger reached by keyboard (:focus-visible) gets focus back; after a
  // mouse / touch / in-game open, focus stays on the page so the game keys keep working (buttons swallow them).
  function focusTrigger() {
    const a = document.activeElement;
    try { return a && a !== body && a.matches(':focus-visible') ? a : null; } catch (e) { return null; }
  }
  function restoreFocus(elm) {
    if (!elm || !elm.isConnected || elm.offsetParent === null || elm.closest('[inert]')) return;
    try { elm.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function closeManual() {
    if (manualLayer.hidden) return;
    // take focus out of the (kept) iframe first, or key presses would keep going to the hidden manual
    try { if (document.activeElement === manualFrame) manualFrame.blur(); window.focus(); } catch (e) { /* ignore */ }
    manualLayer.hidden = true; GS.state.manualOpen = false;
    GS.dirty = true; syncInert();
    restoreFocus(manualReturn); manualReturn = null;
  }
  // Background is inert while a modal layer is open (launcher, settings, manual): no focus, not in the a11y tree.
  function syncInert() {
    const manual = !!GS.state.manualOpen, settings = !settingsEl.hidden, boot = !bootEl.hidden;
    appEl.inert = manual || settings || boot;
    settingsEl.inert = manual;
    mockEl.inert = manual || settings;
    bootEl.inert = manual;
  }
  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || typeof d !== 'object' || e.source !== manualFrame.contentWindow) return;
    if (d.gs === 'manual-close') closeManual();
    else if (d.gs === 'manual-page' && typeof d.page === 'string') { prefs.lastManual = d.page; savePrefs(); }
  });
  GS.shell.refresh = function () {
    prefs.warnSound = !!GS.state.warnSound; prefs.stereo = GS.state.stereo !== false; prefs.bgm = GS.state.bgm !== false; savePrefs();
    syncTopbar(); syncSettings();
  };
  GS.shell.onRegister = function (id) {
    if (!mockEl.hidden) renderMock();
    // a screen registered after load (e.g. from the console) can still be opened by the current hash
    if (!curId && shellReady && location.hash.split('/')[0] === '#' + id) setTimeout(routeFromHash, 0);
  };
  GS.shell.onFontChange = function () { GS.shell.toast('ドットフォントを読みこみました'); drawLauncher(); };
  // called by GS.go before def.enter(): reset per-screen chrome so enter() may set its own cursor
  GS.shell.beforeEnter = function () { rom.style.cursor = ''; };
  GS.shell.onGo = function (id, st, def) {
    curId = id; curState = st;
    const spec = (def.deck && safeCall(() => def.deck(st), null)) || { type: 'none' };
    GS.shell.setDeck(spec);
    setLegend((def.legend && safeCall(() => def.legend(st), null)) || { pc: '', touch: '' });
    const label = (def.labels && def.labels[st]) || st || '';
    rom.setAttribute('aria-label', 'ゲーム画面：' + (def.title || id) + (label ? ' ' + label : ''));
    syncTopbar(); markMock();
    if (GS.state.layout !== 'pc') renderDeck();
  };

  // ------------------------------------------------------------------ top bar
  const DISPLAY_LABEL = { dot: 'ドット等倍', 43: '4:3', crt: 'ブラウン管風' };
  const SOUND_LABEL = v => (v <= 0 ? 'OFF' : v < 0.2 ? '小' : v < 0.4 ? '中' : '大');
  function syncTopbar() {
    const d = $('#tb-display');
    if (d) { d.textContent = window.innerWidth < 760 ? '表示' : '表示：' + DISPLAY_LABEL[prefs.display]; d.title = '表示：' + DISPLAY_LABEL[prefs.display]; }
    const s = $('#tb-sound'); if (s) { s.textContent = '音 ' + SOUND_LABEL(GS.state.sound); s.setAttribute('aria-pressed', String(GS.state.sound > 0)); }
    // [ポーズ] in the top bar: portrait, and touch PCs (tablets held sideways with 560px or more: no keyboard Esc there,
    // and the side rails may have no room left); landscape has its own in the left rail
    const p = $('.tb-pause'); if (p) p.hidden = !(curId === 'play' && (GS.state.layout === 'portrait' || body.classList.contains('touch-pc')));
  }
  function cycleDisplay() { const order = ['dot', '43', 'crt']; setPref('display', order[(order.indexOf(prefs.display) + 1) % 3]); }
  function cycleSound() { const order = [0, 0.15, 0.3, 0.5]; const i = order.findIndex(v => Math.abs(v - GS.state.sound) < 0.01); GS.audioInit(); GS.setSound(order[(i + 1) % 4]); }

  // ------------------------------------------------------------------ settings
  function setPref(key, v) {
    switch (key) {
      case 'display': prefs.display = v; break;
      case 'scaleMode': prefs.scaleMode = v; break;
      case 'wallpaper': prefs.wallpaper = v; break;
      case 'sound': GS.audioInit(); GS.setSound(+v); break;
      case 'warnSound': prefs.warnSound = asBool(v); break;
      case 'bgm': prefs.bgm = asBool(v); break;   // applyPrefsToState below hands it to GS.state / js/bgm.js
      case 'reducedPref': prefs.reducedPref = v; mockReduced = null; break;
      case 'subtitles': prefs.subtitles = asBool(v); if (!prefs.subtitles) subEl.classList.remove('show'); break;
      default: prefs[key] = v;
    }
    savePrefs(); applyPrefsToState(); layout(); syncSettings(); syncMockTools(); syncTopbar();
  }
  function syncSettings() {
    const val = { display: prefs.display, scaleMode: prefs.scaleMode, wallpaper: prefs.wallpaper, sound: String(GS.state.sound),
      bgm: GS.state.bgm !== false ? '1' : '0', warnSound: GS.state.warnSound ? '1' : '0', reducedPref: prefs.reducedPref, subtitles: prefs.subtitles ? '1' : '0' };
    $$('#settings .seg').forEach(seg => {
      const k = seg.dataset.key;
      $$('button', seg).forEach(b => {
        const on = k === 'sound' ? Math.abs(+b.dataset.v - GS.state.sound) < 0.01 : b.dataset.v === val[k];
        b.classList.toggle('on', on); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
      });
    });
  }
  let settingsReturn = null;
  function openSettings() {
    if (!settingsEl.hidden) return;
    settingsReturn = focusTrigger();
    settingsEl.hidden = false; GS.state.settingsOpen = true; GS.input.clear(); releasePad(); syncSettings(); syncInert();
    const b = $('#settings .seg button.on') || $('#settings button'); if (b) b.focus();
  }
  function closeSettings() {
    if (settingsEl.hidden) return;
    if (settingsEl.contains(document.activeElement)) document.activeElement.blur(); // back to the page (game keys)
    settingsEl.hidden = true; GS.state.settingsOpen = false; GS.dirty = true; syncInert();
    restoreFocus(settingsReturn); settingsReturn = null;
  }
  function toggleSettings() { if (settingsEl.hidden) openSettings(); else closeSettings(); }
  // aria-modal dialog: keep Tab inside the panel
  settingsEl.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', settingsEl).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !settingsEl.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !settingsEl.contains(a))) { e.preventDefault(); first.focus(); }
  });
  $$('#settings .seg').forEach(seg => seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPref(seg.dataset.key, b.dataset.v); }));

  // ------------------------------------------------------------------ MOCK panel
  function renderMock() {
    const list = $('#mock-list'); list.textContent = '';
    GS.listStates().forEach(s => {
      const g = el('section', 'mock-group'); g.append(el('h3', null, s.id));
      const ul = el('div', 'mock-states');
      (s.states.length ? s.states : [null]).forEach(st => {
        const a = el('a', 'mock-st'); a.href = '#' + s.id + (st ? '/' + st : '');
        a.dataset.id = s.id; a.dataset.state = st || '';
        a.append(el('span', null, (st && s.labels[st]) || st || '(既定)'));
        if (st) a.append(el('code', null, st));
        a.addEventListener('click', e => { e.preventDefault(); hideBoot(); GS.go(s.id, st); });
        ul.append(a);
      });
      g.append(ul); list.append(g);
    });
    markMock();
  }
  function markMock() {
    $$('.mock-st').forEach(a => a.classList.toggle('on', a.dataset.id === curId && a.dataset.state === (curState || '')));
    const now = $('#mock-now'); if (now) now.textContent = curId ? '#' + curId + (curState ? '/' + curState : '') : '(画面なし)';
  }
  function syncMockTools() {
    const q = k => $('[data-mock="' + k + '"]');
    q('freeze').checked = !!GS.state.freeze; q('grid').checked = !!GS.state.grid; q('reduced').checked = !!GS.state.reduced;
    q('layout').value = prefs.layoutOverride || 'auto';
  }
  // only the MOCK buttons call this, and they exist only with MOCK_ON
  function toggleMock() { mockEl.hidden = !mockEl.hidden; if (!mockEl.hidden) { renderMock(); syncMockTools(); } }
  $('[data-mock="freeze"]').addEventListener('change', e => { GS.state.freeze = e.target.checked; body.classList.toggle('frozen', GS.state.freeze); });
  $('[data-mock="grid"]').addEventListener('change', e => { GS.state.grid = e.target.checked; GS.dirty = true; GS.render(); });
  $('[data-mock="reduced"]').addEventListener('change', e => {
    // session only: matches the OS / settings value -> drop the override
    const base = prefs.reducedPref === 'on' ? true : prefs.reducedPref === 'off' ? false : mqReduce.matches;
    mockReduced = e.target.checked === base ? null : e.target.checked;
    applyReduced(); GS.dirty = true; syncMockTools();
  });
  $('[data-mock="layout"]').addEventListener('change', e => { prefs.layoutOverride = e.target.value; savePrefs(); layout(); renderDeck(); });

  // ------------------------------------------------------------------ launcher / power
  // package art: the title screen's still (title.js)
  function drawLauncher() {
    launcherDrawn = true;
    GS.still('title', 'title', $('#boot-shot'));
  }
  function hideBoot() { body.classList.remove('boot-open'); bootEl.hidden = true; syncInert(); }
  function showBoot() { body.classList.add('boot-open'); bootEl.hidden = false; syncInert(); sizeLauncher(); const b = $('#boot .primary'); if (b) b.focus({ preventScroll: true }); }
  // power on / reset: the title screen from its first state, boot (the company logo)
  function goTitle() { hideBoot(); GS.go('title', 'boot'); }
  let powerPending = false;
  function powerOn(withSound) {
    GS.audioInit(); // inside the click (user gesture), so the AudioContext may start
    GS.setSound(withSound ? 0.3 : 0);
    // the launcher stays until app.mjs has installed GS.app (core.js boot gate)
    if (powerPending) return;
    powerPending = true;
    GS.whenReady(() => {
      powerPending = false;
      goTitle();
      GS.dirty = true;
    });
  }
  // the URL's #screen/state, decoded; a malformed %-escape (decodeURIComponent throws) reads as no hash
  function hashRoute() {
    try { return decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { return ''; }
  }
  function routeFromHash() {
    if (!HASH_ON || !GS.isReady()) return false; // only with ?mock=1, and only once GS.app exists
    const h = hashRoute();
    if (!h) return false;
    const [id, st] = h.split('/');
    const def = GS.screens[id];
    if (!def) return false;
    if (st && def.states.length && def.states.indexOf(st) < 0) return false;
    if (id === curId && (st || def.states[0] || null) === curState) return true;
    hideBoot();
    GS.go(id, st || undefined);
    return true;
  }
  window.addEventListener('hashchange', () => routeFromHash());

  // ------------------------------------------------------------------ actions & keys
  const actions = {
    pause: () => GS.input.press('pause'),
    manual: openManualHere,
    display: cycleDisplay,
    sound: cycleSound,
    settings: toggleSettings,
    mock: toggleMock,
    'close-settings': closeSettings,
    'close-mock': () => { mockEl.hidden = true; },
    reset: () => { closeSettings(); goTitle(); },
    'play-mute': () => powerOn(false),
    'play-sound': () => powerOn(true),
    'boot-manual': () => GS.shell.openManual('cover1'),
    step1: () => GS.tick(1),
    'restart-state': () => GS.restart(),
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const f = actions[b.dataset.act]; if (!f) return;
    e.preventDefault(); f(); if (b.blur && !b.closest('.panel')) b.blur();
  });
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (GS.state.manualOpen) { closeManual(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!settingsEl.hidden) { closeSettings(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!mockEl.hidden && mockEl.contains(document.activeElement)) { mockEl.hidden = true; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ------------------------------------------------------------------ auto pause
  window.addEventListener('blur', () => GS.autoPause('blur'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) GS.autoPause('hidden'); });
  mqReduce.addEventListener && mqReduce.addEventListener('change', () => { applyReduced(); syncMockTools(); });

  // ------------------------------------------------------------------ resize
  let raf = 0;
  const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  try {
    const ro = new ResizeObserver(entries => {
      const en = entries[0];
      const box = en.devicePixelContentBoxSize && en.devicePixelContentBoxSize[0];
      devBox = box ? { w: box.inlineSize, h: box.blockSize } : null; // Safari: falls back to innerWidth/Height
      layout();
    });
    try { ro.observe(document.documentElement, { box: 'device-pixel-content-box' }); } catch (e) { ro.observe(document.documentElement); }
  } catch (e) { /* no ResizeObserver */ }

  // ------------------------------------------------------------------ wallpaper
  function makeWallpaper() {
    try {
      const t = GS.waterTile(), c = GS.makeCanvas(32, 32), x = c.getContext('2d');
      x.drawImage(t, 0, 0); x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, 32, 32);
      document.documentElement.style.setProperty('--wp-water', 'url(' + c.toDataURL() + ')');
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ init
  async function init() {
    applyPrefsToState(); makeWallpaper(); layout(); renderLegend(); syncTopbar();
    if (!HASH_ON && location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
    // ?mock=1 with a #screen/state hash: it is routed once GS.app exists (after GS.boot below), so the launcher
    // is not set up (focus, inert) for it; if the route then fails, the launcher is shown after all.
    // (This runs before app.mjs, a deferred module, so the boot gate is always still closed here.)
    const hashId = hashRoute().split('/')[0];
    const deferred = HASH_ON && !!hashId && !!GS.screens[hashId];
    if (!deferred) showBoot();
    setTimeout(() => {
      if (GS.isReady()) return;
      console.error('[shell] app.mjs has not installed GS.app (GS.installApp) after 10 s');
      GS.shell.toast('ゲームを読みこめませんでした。ページを再読みこみしてください', { ms: 15000 });
    }, 10000);
    await GS.boot({ rom }); // resolves after GS.installApp (core.js boot gate)
    drawLauncher();
    if (GS.state.fontFallback) GS.shell.toast('ドットフォントを読みこめなかったため、代替フォントで表示しています');
    if (!routeFromHash() && deferred && !GS.current.id) showBoot(); // the hash named a state that does not exist
    GS.dirty = true;
  }
  init().then(() => { shellReady = true; });
})();
