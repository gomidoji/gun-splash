/* ガン・スプラッシュ 復刻版 — title screens
 * States: boot (company logo), opening (perspective flyover of the courtyard + 4 captions), title (PUSH),
 * menu, option, stage1..stage4 (stage select).
 * Also exposes GS.screens.title.drawLogo / logoCanvas / LOGO_BOX for the manual cover.
 * Plain classic script; everything is drawn into GS.layers with palette colours only.
 * Stage data (GS.STAGES / GS.RULES) is converted from game.mjs by data.js. With the real game (GS.app.live)
 * the menus drive it: しゅつげき -> GS.app.startRound(id), the stage shown is GS.app.selectedStage,
 * せつめいしょ -> GS.app.openManual, title idle -> GS.app.startDemo(). Without a live GS.app (manual stills,
 * headless) the same states run on their scripted mock data.
 */
(function () {
  'use strict';
  const GS = window.GS;
  if (!GS || !GS.registerScreen) { console.error('[title] core.js is not loaded'); return; }
  const R = Math.round, F = Math.floor;
  const P = GS.PAL;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const reduced = () => !!GS.state.reduced;
  const isTouchUI = () => !!GS.state.touch || GS.state.layout !== 'pc';
  const live = () => !!(GS.app && GS.app.live);
  const stageAt = n => (GS.STAGES || [])[n - 1] || null;            // n = 1..4 (states stage1..stage4)

  // =====================================================================
  // LOGO. Hand-drawn masks on a 4px grid.
  //  スプラッシュ: 8x10 cells (32x40 px) per glyph, strokes 2 cells (8 px).
  //  ガン・    : 6 rows (24 px); widths 8+6+4 cells = 72 px (x32..103). ガ needs the extra width
  //              for a readable dakuten, ・ is narrow; the 3 glyphs fill the specified 72x24 box.
  // =====================================================================
  const BIG = {
    'ス': [
      '.#######',
      '.#######',
      '......##',
      '.....###',
      '....###.',
      '...#####',
      '..###.##',
      '.###..##',
      '###....#',
      '##......',
    ],
    'プ': [
      '.....###',
      '.....#.#',
      '.....###',
      '#####...',
      '######..',
      '....##..',
      '....##..',
      '...###..',
      '.####...',
      '###.....',
    ],
    'ラ': [
      '.######.',
      '.######.',
      '........',
      '########',
      '########',
      '......##',
      '.....###',
      '....###.',
      '.####...',
      '###.....',
    ],
    'ッ': [
      '........',
      '........',
      '........',
      '##.##.##',
      '##.##.##',
      '.#..#.##',
      '......##',
      '.....###',
      '...####.',
      '#####...',
    ],
    'シ': [
      '###.....',
      '.###....',
      '......##',
      '##....##',
      '###..###',
      '.##.###.',
      '...###..',
      '..###...',
      '####....',
      '##......',
    ],
    'ュ': [
      '........',
      '........',
      '........',
      '........',
      '.#####..',
      '.#####..',
      '....##..',
      '....##..',
      '########',
      '########',
    ],
  };
  const SMALL = {
    'ガ': [
      '..#..#.#',
      '..#.....',
      '#######.',
      '..#...#.',
      '.##...#.',
      '##...##.',
    ],
    'ン': [
      '##....',
      '.##..#',
      '.....#',
      '...###',
      '.###..',
      '##....',
    ],
    '・': [
      '....',
      '....',
      '.##.',
      '.##.',
      '....',
      '....',
    ],
  };
  const LOGO_BOX = { x: 32, y: 24, w: 192, h: 64, ox: 2, oy: 2 }; // ox/oy = box origin inside logoCanvas()
  const BANDS = ['waterHi', 'waterShallow', 'water', 'waterDk'];   // 4 bands of 10 px (y48..87)
  let logo = null;

  function dilate8(M, w, h) {
    const O = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!M[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) O[Y * w + X] = 1;
      }
    }
    return O;
  }
  function erode4(M, w, h) {
    const O = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; O[i] = M[i] && M[i - 1] && M[i + 1] && M[i - w] && M[i + w] ? 1 : 0;
    }
    return O;
  }
  // union of M shifted by (k,k) for k = 0..depth (a 45-degree extrusion toward the bottom right)
  function extrude(M, w, h, depth) {
    const O = M.slice();
    for (let k = 1; k <= depth; k++) for (let y = 0; y + k < h; y++) for (let x = 0; x + k < w; x++) if (M[y * w + x]) O[(y + k) * w + x + k] = 1;
    return O;
  }
  function buildLogo() {
    const ox = LOGO_BOX.ox, oy = LOGO_BOX.oy, cw = 200, ch = 72, N = cw * ch;
    const big = new Uint8Array(N), small = new Uint8Array(N);
    const stamp = (M, rows, bx, by) => rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) if (r[i] === '#') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) M[(oy + by + j * 4 + dy) * cw + ox + bx + i * 4 + dx] = 1;
      }
    });
    Array.from('スプラッシュ').forEach((c, i) => stamp(big, BIG[c], i * 32, 24));
    let sx = 0;
    ['ガ', 'ン', '・'].forEach(c => { stamp(small, SMALL[c], sx, 0); sx += SMALL[c][0].length * 4; });
    const img = new ImageData(cw, ch), d = img.data;
    const rgbCache = {};
    const put = (k, tok) => { const c = rgbCache[tok] || (rgbCache[tok] = GS.rgb(P[tok])); d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255; };
    const inner = erode4(big, cw, ch);
    // one layer = ink outline around the extruded shape, the extrusion ("shadow") colour, then the face
    function layer(M, depth, sideTok, faceAt) {
      const E = extrude(M, cw, ch, depth), O = dilate8(E, cw, ch);
      for (let k = 0; k < N; k++) if (O[k]) put(k, 'ink');
      for (let k = 0; k < N; k++) if (E[k] && !M[k]) put(k, sideTok);
      for (let k = 0; k < N; k++) if (M[k]) put(k, faceAt(k));
    }
    // スプラッシュ: outer 1px ink, inner 1px white, 4 bands top->bottom, 3px shadow (night) to the bottom right
    layer(big, 3, 'night', k => (inner[k] ? BANDS[clamp(F((F(k / cw) - oy - 24) / 10), 0, 3)] : 'white'));
    // ガン・: face cream (#F8E8A0), shadow sun, edge ink (drawn over スプラッシュ)
    layer(small, 2, 'sun', () => 'cream');
    const cv = GS.makeCanvas(cw, ch); cv.getContext('2d').putImageData(img, 0, 0);
    // glint mask = the coloured band area of スプラッシュ
    const mi = new ImageData(cw, ch), md = mi.data;
    for (let k = 0; k < N; k++) if (inner[k]) { md[k * 4] = md[k * 4 + 1] = md[k * 4 + 2] = 255; md[k * 4 + 3] = 255; }
    const mask = GS.makeCanvas(cw, ch); mask.getContext('2d').putImageData(mi, 0, 0);
    const scratch = GS.makeCanvas(cw, ch);
    const full = GS.makeCanvas(GS.W, GS.H); // for the mosaic entrance (whole-screen grid, origin 0,0)
    logo = { cv, mask, scratch, full, cw, ch };
    return logo;
  }
  function logoCanvas() { return logo || buildLogo(); }
  // glint p 0..1: a slanted white band crossing the colour bands from left to right
  function drawLogoAt(ctx, x, y, opts) {
    opts = opts || {};
    const lg = logoCanvas(), dx = R(x) - LOGO_BOX.ox, dy = R(y) - LOGO_BOX.oy;
    ctx.drawImage(lg.cv, dx, dy);
    if (opts.glint != null && opts.glint >= 0 && opts.glint <= 1) {
      const g = lg.scratch.getContext('2d');
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, lg.cw, lg.ch);
      g.fillStyle = P.white;
      const cx = LOGO_BOX.ox - 32 + R(opts.glint * (LOGO_BOX.w + 64));
      for (let yy = 0; yy < lg.ch; yy++) g.fillRect(cx - F(yy / 2), yy, 6, 1);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(lg.mask, 0, 0);
      g.globalCompositeOperation = 'source-over';
      ctx.drawImage(lg.scratch, dx, dy);
    }
  }
  // logo on a layer at its ROM position, optionally pixelated (mosaic m, grid origin 0,0)
  function drawLogoLayer(ctx, mosaic, glint) {
    if (mosaic > 1) {
      const lg = logoCanvas(), c = lg.full.getContext('2d');
      c.imageSmoothingEnabled = false; c.clearRect(0, 0, GS.W, GS.H);
      drawLogoAt(c, LOGO_BOX.x, LOGO_BOX.y);
      GS.mosaicRegion(c, 0, 0, GS.W, GS.H, mosaic);
      ctx.drawImage(lg.full, 0, 0);
    } else drawLogoAt(ctx, LOGO_BOX.x, LOGO_BOX.y, { glint });
  }

  // =====================================================================
  // title background: sky + sun + town (bg1, cached), water (bg2)
  // =====================================================================
  let skyCv = null, waterCv = null;
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }
  function drawTown(c) {
    const col = (x0, x1, top, tok) => GS.rect(c, x0, top, x1 - x0, 128 - top, tok);
    const gable = (x0, x1, top, tok) => { const w = x1 - x0; for (let k = 1; k <= w >> 1; k++) GS.rect(c, x0 + k, top - k, w - 2 * k, 1, tok); };
    // far row (sky3) — low around the sun (x184..216) so the sun shows above the roofs
    [[0, 18, 108], [18, 30, 103], [30, 46, 110], [46, 54, 100], [54, 70, 106], [70, 88, 111], [88, 100, 103], [100, 118, 109],
      [118, 126, 98], [126, 146, 105], [146, 160, 111], [160, 172, 102], [172, 184, 110], [184, 216, 122], [216, 228, 104],
      [228, 240, 109], [240, 256, 101]].forEach(([a, b, t]) => col(a, b, t, 'sky3'));
    gable(54, 70, 106, 'sky3'); gable(126, 146, 105, 'sky3'); gable(228, 240, 109, 'sky3');
    GS.rect(c, 121, 90, 1, 8, 'sky3'); GS.rect(c, 49, 94, 1, 6, 'sky3'); // antennas
    // middle row (sky2): blocks, a thin tower, a water tower
    [[0, 12, 114], [12, 26, 110], [34, 50, 116], [50, 56, 102], [56, 72, 113], [96, 108, 112], [120, 138, 108], [146, 160, 115],
      [164, 168, 100], [168, 182, 114], [220, 236, 111], [244, 256, 115]].forEach(([a, b, t]) => col(a, b, t, 'sky2'));
    gable(146, 160, 115, 'sky2'); gable(12, 26, 110, 'sky2');
    GS.rect(c, 52, 96, 2, 6, 'sky2'); GS.rect(c, 165, 92, 2, 8, 'sky2');
    // water tower (generic): tank, roof, legs, brace
    GS.rect(c, 76, 99, 14, 9, 'sky2'); gable(76, 90, 99, 'sky2');
    GS.rect(c, 77, 108, 1, 20, 'sky2'); GS.rect(c, 88, 108, 1, 20, 'sky2');
    for (let k = 0; k < 10; k++) { GS.px(c, 78 + k, 109 + k, 'sky2'); GS.px(c, 87 - k, 109 + k, 'sky2'); }
    GS.rect(c, 78, 114, 10, 1, 'sky2');
    // near row (sky1): low roofs with gables
    [[0, 20, 121], [20, 38, 119], [52, 84, 122], [92, 118, 120], [132, 160, 121], [176, 196, 124], [206, 232, 120], [240, 256, 122]]
      .forEach(([a, b, t]) => col(a, b, t, 'sky1'));
    gable(20, 38, 119, 'sky1'); gable(92, 118, 120, 'sky1'); gable(206, 232, 120, 'sky1');
    // a few windows (sky3 on darker walls)
    [[16, 118], [22, 116], [60, 118], [64, 118], [100, 116], [128, 112], [132, 112], [172, 118], [224, 114], [228, 114], [248, 118]]
      .forEach(([x, y]) => GS.rect(c, x, y, 1, 2, 'sky3'));
  }
  const DUSK = ['sky1', 'sky2', 'sky3', 'sky4', 'sky5'];   // the dusk sky's bands, top to bottom (also the opening's)
  function skyCanvas() {
    if (skyCv) return skyCv;
    skyCv = GS.makeCanvas(256, 128); const c = skyCv.getContext('2d');
    GS.gradRows(c, 0, 127, DUSK);
    GS.circle(c, 200, 120, 12, 'sun', { fill: true });
    drawTown(c);
    return skyCv;
  }
  function waterCanvas() {
    if (waterCv) return waterCv;
    waterCv = GS.makeCanvas(256, 96); const c = waterCv.getContext('2d');
    GS.rect(c, 0, 0, 256, 96, 'waterDk');
    GS.rect(c, 0, 0, 256, 1, 'sky5');           // horizon glow (y128)
    GS.rect(c, 0, 1, 256, 5, 'waterDeep');      // reflection of the town
    const rnd = lcg(1994);
    for (let y = 8; y < 96; y += y < 40 ? 3 : 4) {
      for (let x = F(rnd() * 24); x < 256; x += 20 + F(rnd() * 34)) {
        const len = 2 + F(y / 14) + F(rnd() * 4);
        const r = rnd();
        GS.rect(c, x, y, len, 1, r < 0.55 ? 'waterDeep' : r < 0.85 ? 'water' : 'waterShallow');
      }
    }
    return waterCv;
  }
  // sun reflection: a column of short horizontal dashes under the sun, every other row, narrowing
  // toward the bottom (x188..206, clear of the ORANGE bust at x208+). Dash layout is fixed; the 4 colours
  // (sun / sky5 / waterHi / water) cycle every 8f: near the horizon sun<->sky5, lower sky5<->waterHi,
  // bottom waterHi<->water. fx.wave adds the ripple.
  const REFLECT = ['sun', 'sky5', 'waterHi', 'water'];
  const JIT = [0, 1, -1, 0, 1, -1, 0, 1];
  let reflRows = null;
  function reflectRows() {
    if (reflRows) return reflRows;
    reflRows = [];
    const rnd = lcg(728);
    for (let k = 0, y = 129; y < 216; y += 2, k++) {
      const d = (y - 129) / 86;                                 // 0 = horizon .. 1 = near the bottom
      const half = Math.max(1, R(9 * (1 - d * 0.8))), cx = 197 + JIT[k % 8];
      const zone = d < 0.22 ? 0 : d < 0.55 ? 1 : 2, segs = [];
      for (let x = cx - half, s = 0; x < cx + half; s++) {
        const len = Math.min(cx + half - x, d < 0.22 ? 3 + F(rnd() * 6) : 2 + F(rnd() * 5));
        if (s === 0 || rnd() > d * 0.55) segs.push([x, len]);   // thin the dashes out toward the bottom
        x += len + 1 + F(rnd() * (1 + d * 4));
      }
      reflRows.push({ y, k, zone, segs });
    }
    return reflRows;
  }
  function drawTitleBg(L, f) {
    L.bg1.drawImage(skyCanvas(), 0, 0);
    L.bg2.drawImage(waterCanvas(), 0, 128);
    const ph = F(f / 8);
    reflectRows().forEach(r => r.segs.forEach(([x, w], s) => GS.rect(L.bg2, x, r.y, w, 1, REFLECT[r.zone + ((r.k + s + ph) & 1)])));
    // 動きをへらす: no continuous water wobble (same as play / result)
    GS.fx.wave = reduced() ? null : { y0: 136, y1: 223, amp: 1, period: 32, phase: F(f / 2) };
  }

  // busts + water arcs. The nozzle comes from the bust art (GS.BUST_LAYOUT.muzzle.ready, sprites-bust.js).
  // ORANGE is mirrored (x -> 31-x).
  const BUST = { blue: [16, 144], orange: [208, 144] };
  const bustMuzzle = () => GS.BUST_LAYOUT.muzzle.ready;
  function bez(a, b, c, u) { const v = 1 - u; return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]]; }
  // the busts wade in the water instead of ending in a hard cut at y175: their last 4 rows (y172..175) are
  // covered by the water ground (waterDk, with a dark broken reflection), a foam / waterHi ring (34px) lies on
  // the surface at y171..172 with its dashes shifting 1px every 8f, and a broken ripple ring sits at y177.
  function drawWaterline(c, x0, f) {
    const ph = reduced() ? 0 : F(f / 8) & 3;
    GS.rect(c, x0 + 1, 173, 32, 3, 'waterDk');
    for (let i = 0; i < 34; i++) {
      const x = x0 + i, end = i < 2 || i > 31, k = (i + ph) & 3;
      GS.px(c, x, 171, end ? 'water' : k === 0 ? 'waterHi' : 'foam');
      GS.px(c, x, 172, end || k === 2 ? 'waterDk' : 'water');
      if (!end && i > 5 && i < 28 && ((i + 6 - ph) & 7) < 5) GS.px(c, x, 174, 'waterDeep');
    }
    for (let i = -3; i < 37; i++) if (((i + 8 - ph) & 7) < 5) GS.px(c, x0 + i, 177, 'water');
  }
  function drawBusts(c, f) {
    GS.spr(c, 'bust_ready', BUST.blue[0], BUST.blue[1], { pal: 'blue' });
    GS.spr(c, 'bust_ready', BUST.orange[0], BUST.orange[1], { pal: 'orange', flipX: true });
    drawWaterline(c, BUST.blue[0] - 1, f);
    drawWaterline(c, BUST.orange[0] - 1, f);
    const step = F(f / 6) % 4, m = bustMuzzle();
    // control points 8px below the nozzle line, so the arcs keep their height from the nozzle
    const arcs = [
      [[BUST.blue[0] + m[0], BUST.blue[1] + m[1]], [58, 106], [30, 90]],
      [[BUST.orange[0] + 31 - m[0], BUST.orange[1] + m[1]], [198, 106], [226, 90]],
    ];
    arcs.forEach(([a, b, cc]) => {
      for (let i = 0; i < 3; i++) {
        const k = (step + i) % 4, p = bez(a, b, cc, 0.25 + k * 0.25);
        GS.spr(c, 'drop', R(p[0]) - 4, R(p[1]) - 4, { pal: 'water' });
      }
    });
  }
  // landing splash: 12 sprites radiating from the logo, 4 frames x 6f (sT 32..55)
  function drawSplash(c, sT) {
    if (sT < 32 || sT >= 56) return;
    const k = F((sT - 32) / 6), name = GS.hasSprite('splash_' + (k + 1)) ? 'splash_' + (k + 1) : 'drop';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12, d = 4 + k * 6;
      GS.spr(c, name, R(128 + Math.cos(a) * (100 + d)) - 4, R(64 + Math.sin(a) * (30 + d * 0.6)) - 4, { pal: 'water' });
    }
  }
  const PUSH_PC = 'PUSH ENTER KEY', PUSH_TOUCH = 'TOUCH THE SCREEN';
  // sT = scene time (intro: 0..55, complete >= 56). o = {push:bool, glint:0..1|null, mosaic}
  function drawTitleScene(L, sT, f, o) {
    drawTitleBg(L, f);
    const mosaic = !reduced() && sT < 32 ? 16 - F(sT / 2) : 1;
    drawLogoLayer(L.bg1, mosaic, o.glint);
    drawBusts(L.obj, f);
    if (!o.still) drawSplash(L.obj, sT);
    if (sT >= 40) GS.banner(L.hud, 'GUN SPLASH', 48, 92, { set: 'H0' });
    // catch: H1 on the dusk sky + skyline is low-contrast, so it gets a full 1px ink outline (as on result p1)
    if (sT >= 48) GS.text16(L.hud, '3VS3 水たまりの こうぼう', 32, 112, { set: 'H1', style: 'outline' });
    if (sT >= 56) GS.text8(L.hud, '©199X GUN SPLASH PROJECT', 32, 192, { set: 'HL' });
    if (o.push) {
      const touch = isTouchUI();
      GS.text8(L.hud, touch ? PUSH_TOUCH : PUSH_PC, touch ? 64 : 72, 152, { set: 'H0' });
    }
  }

  // =====================================================================
  // boot (company logo) and opening (perspective flyover: the map drawn as a tilted floor, row by row)
  // =====================================================================
  function drawBoot(L, t, still) {
    let y = 72;
    if (!still && !reduced() && t < 60) { const p = clamp((t - 30) / 30, 0, 1); y = 24 + R(48 * p * p); }
    GS.spr(L.obj, 'drop16', 120, y, { pal: 'water' });
    if (!still && !reduced() && t >= 60 && t < 108) {
      for (let r = 0; r < 2; r++) {
        const p = (t - 60 - r * 10) / 38; if (p < 0 || p > 1) continue;
        const rx = 6 + R(20 * p);
        GS.ellipse(L.bg2, 128, 88, rx, Math.max(1, R(rx / 5)), p < 0.6 ? 'water' : 'waterDk');
      }
    }
    GS.text8(L.hud, 'GUN SPLASH PROJECT', 56, 100, { set: 'H0' });
    GS.text8(L.hud, 'PRESENTS', 96, 116, { set: 'HL' });
  }

  const CAPTIONS = ['ながい 雨が やんだ。', 'まちに 水たまりが のこった。', 'でも 水には かぎりが ある。', '3たい3! 中央の 陣地を うばえ'];
  // The flyover is drawn in the game's world units (the tutorial courtyard is 1200x720). Camera: a ground point
  // (x, y), eye height h and yaw (0 = looking north, toward -y; positive turns right). Screen: horizon at y72, focal
  // length 128 px, so floor row y lies at depth h*128/(y-72) and column x at a lateral offset of (x-128)*depth/128.
  // 480f, one caption every 120f. The camera (a Catmull-Rom path through CAM_KEYS, slowing to a stop over OP.move
  // frames) comes in high over the town, turned toward the courtyard; follows the street down; swings left as it
  // reaches the courtyard; and stops at its south-west corner turned toward the zone, which then sits in the middle of
  // the picture for the last caption.
  // Each caption has its picture: the rain thins out and stops (1), glints on the courtyard's puddles (2), the
  // puddles shrink step by step (3), the zone's rim blinks gold and the two teams drop in on either side of it (4).
  // haze: depths past which the floor is sky5 / sky5 and sky4 rows / sky4 on every other row
  const OP = { len: 480, cap: 120, move: 420, horizon: 72, focal: 128, scale: 1 / 2, haze: [4600, 3800, 3000] };
  const FLOOR_TOP = OP.horizon + 1;   // the first floor row; the sky is drawn above it
  // The last key looks at the zone. GS.ZONE is set by data.js after this script runs, so camAt fills in its yaw.
  const CAM_KEYS = [
    { x: 430, y: 2750, h: 460, yaw: 0.22 },
    { x: 600, y: 1500, h: 340, yaw: 0 },
    { x: 560, y: 880, h: 230, yaw: 0.22 },
    { x: 330, y: 640, h: 170, yaw: NaN },
  ];
  const LAST_KEY = CAM_KEYS[CAM_KEYS.length - 1];
  const SUN_X = 200, SUN_AZ = Math.atan2(SUN_X - 128, OP.focal);   // the sun's direction: x200 when looking north
  // the camera at frame t, with the sine and cosine of its yaw
  function camAt(t) {
    if (Number.isNaN(LAST_KEY.yaw)) LAST_KEY.yaw = Math.atan2(GS.ZONE.x - LAST_KEY.x, LAST_KEY.y - GS.ZONE.y);
    const n = CAM_KEYS.length, u = GS.ease.out(GS.step(t, 0, OP.move)) * (n - 1);
    const i = Math.min(F(u), n - 2), s = u - i, K = j => CAM_KEYS[clamp(j, 0, n - 1)];
    const k0 = K(i - 1), k1 = K(i), k2 = K(i + 1), k3 = K(i + 2), cam = {};
    for (const key of ['x', 'y', 'h', 'yaw']) {
      const a = k0[key], b = k1[key], c = k2[key], d = k3[key];
      cam[key] = 0.5 * (2 * b + (c - a) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (3 * b - a - 3 * c + d) * s * s * s);
    }
    cam.sin = Math.sin(cam.yaw); cam.cos = Math.cos(cam.yaw);
    return cam;
  }

  // The floor is the real tutorial stage (game.mjs via data.js) at half size, its walls flat on the ground as on the
  // map, with its puddles at one level (all four alike), the zone and the pumps. Its open water (water / waterDk)
  // mirrors the sky. One floor per puddle level, cached per stage object, so a frame drawn before the data exists is
  // never kept; with them the zone's rim (ring), lit for the last caption.
  let floors = null;   // { src: stage, ring, by: { [level]: floor } }
  function floorCache() {
    const st = GS.stage('tutorial');
    if (!floors || floors.src !== st) floors = { src: st, ring: null, by: {} };
    return floors;
  }
  function buildFloor(level) {
    const fc = floorCache();
    if (fc.by[level]) return fc.by[level];
    const s = OP.scale, map = GS.mapCanvas('tutorial', s);
    const cv = GS.makeCanvas(map.width, map.height), c = cv.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    c.drawImage(map, 0, 0);
    GS.drawPuddles(c, 'tutorial', [level, level, level, level], 0, 0, s, 0);
    GS.drawZone(c, 0, 0, s, 'neutral', 0);
    GS.drawPumps(c, 'tutorial', null, 0, 0, s, 0);
    if (!fc.ring) fc.ring = zoneRing(cv.width, cv.height);
    const fl = { w: cv.width, h: cv.height, d32: new Uint32Array(c.getImageData(0, 0, cv.width, cv.height).data.buffer) };
    if (fc.src) fc.by[level] = fl;
    return fl;
  }
  // the zone's rim on a w x h floor: a 6 px band inside its edge (only the pixels in the zone's box are tested)
  function zoneRing(w, h) {
    const Z = GS.ZONE, s = OP.scale, ring = new Uint8Array(w * h);
    if (!Z) return ring;
    const i0 = Math.max(0, F((Z.x - Z.r) * s) - 1), i1 = Math.min(w - 1, Math.ceil((Z.x + Z.r) * s) + 1);
    const j0 = Math.max(0, F((Z.y - Z.r) * s) - 1), j1 = Math.min(h - 1, Math.ceil((Z.y + Z.r) * s) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const r = Math.hypot((i + 0.5) / s - Z.x, (j + 0.5) / s - Z.y);
      if (r <= Z.r && r > Z.r - 6) ring[j * w + i] = 1;
    }
    return ring;
  }
  // でも 水には かぎりが ある。: the puddles stay full until 12f into caption 3, then go one level lower every 24f down
  // to 2 (the play screen's 6-step images), and stay there
  const SHRINK = { from: 2 * OP.cap + 12, every: 24, full: 5, low: 2 };
  const poolLevelAt = t => (t < SHRINK.from ? SHRINK.full : Math.max(SHRINK.low, SHRINK.full - 1 - F((t - SHRINK.from) / SHRINK.every)));

  // Pixels are written as packed RGBA words (Uint32Array views of the ImageData, little-endian: 0xAABBGGRR).
  const pack = c => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  // The opening's fixed parts, built once: its colours as packed words; the sky above the floor (the sky, the sun at
  // x200 and the title's town skyline standing on the horizon, as one 256 px wide image that repeats sideways; the
  // yaw moves it by shift, the sun's offset from x200), whose pixels the puddles also mirror; and the image the floor
  // rows are written into. Dropped with the floors once the title screens move past the opening.
  let opRes = null;
  function opResources() {
    if (opRes) return opRes;
    const p = n => pack(GS.rgb(n));
    const col = { tile: p('dry2'), tile2: p('dry'), grout: p('dim'), road: p('wallSide'), curb: p('gray'), dash: p('neutral'),
      puddle: p('waterDeep'), water: p('water'), waterDk: p('waterDk'), fog5: p('sky5'), fog4: p('sky4'), gold: p('gold') };
    const town = GS.makeCanvas(256, 128), sky = GS.makeCanvas(256, FLOOR_TOP), c = sky.getContext('2d');
    drawTown(town.getContext('2d'));
    GS.gradRows(c, 0, OP.horizon, DUSK);
    GS.circle(c, SUN_X, OP.horizon, 12, 'sun', { fill: true });
    c.drawImage(town, 0, 88, 256, 40, 0, FLOOR_TOP - 40, 256, 40);
    const img = c.createImageData(256, GS.H - FLOOR_TOP);
    opRes = { col, sky, skyD32: new Uint32Array(c.getImageData(0, 0, 256, FLOOR_TOP).data.buffer), img, out: new Uint32Array(img.data.buffer) };
    return opRes;
  }
  const isWater = (col, v) => v === col.water || v === col.waterDk;   // open water on a floor
  function hash2(a, b) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Outside the courtyard (world units; the courtyard is the whole world, game.mjs CONFIG): a curb around it, the
  // street leading south from its middle (asphalt, curbs, a dashed centre line) and stone paving everywhere else, with
  // rain puddles on the street and the paving. Fine detail (grout, dashes, puddles) is left out where it would be
  // thinner than a pixel row.
  const YARD = { w: 1200, h: 720, curb: 14 };
  const STREET = { cx: YARD.w / 2, half: 132, curb: 12, dash: 90, tile: 64, grout: 4, cell: 112 };
  // whether world point (X, Y) is in its cell's rain puddle (about 2 cells in 5 have one)
  function inPuddle(X, Y) {
    const cx = Math.floor(X / STREET.cell), cy = Math.floor(Y / STREET.cell);
    if (hash2(cx, cy) >= 0.38) return false;
    const u = (X - (cx * STREET.cell + 30 + hash2(cx + 31, cy) * 52)) / (16 + hash2(cx + 7, cy + 3) * 24);
    const v = (Y - (cy * STREET.cell + 24 + hash2(cx, cy + 57) * 64)) / (8 + hash2(cx + 3, cy + 7) * 12);
    return u * u + v * v <= 1;
  }
  // the colour at world point (X, Y) outside the courtyard, at that depth (col.puddle: open water)
  function outsideCol(X, Y, depth, col) {
    const ax = X > STREET.cx ? X - STREET.cx : STREET.cx - X;
    let o;
    if (Y >= YARD.h && ax < STREET.half) {
      o = ax >= STREET.half - STREET.curb ? col.curb
        : ax < 4 && depth < 1800 && Y - Math.floor(Y / (STREET.dash * 2)) * STREET.dash * 2 < STREET.dash ? col.dash : col.road;
    } else if (X > -YARD.curb && X < YARD.w + YARD.curb && Y > -YARD.curb && Y < YARD.h + YARD.curb) return col.curb;
    else {
      const tx = Math.floor(X / STREET.tile), ty = Math.floor(Y / STREET.tile);
      o = depth < 1500 && (X - tx * STREET.tile < STREET.grout || Y - ty * STREET.tile < STREET.grout) ? col.grout
        : hash2(tx, ty) < 0.2 ? col.tile2 : col.tile;
    }
    return depth < 1100 && o !== col.curb && inPuddle(X, Y) ? col.puddle : o;
  }
  function drawFlyover(c, t) {
    const cam = camAt(t), res = opResources(), col = res.col, fl = buildFloor(poolLevelAt(t)), fd = fl.d32, fw = fl.w, fh = fl.h, s = OP.scale;
    // what the boot screen has not built ahead (see prepareOpening), one piece per frame during caption 2
    if (t >= OP.cap && t < 2 * OP.cap) prepareOpening();
    const shift = R(OP.focal * Math.tan(SUN_AZ - cam.yaw)) - (SUN_X - 128), sd = res.skyD32, x0 = shift & 255;
    c.drawImage(res.sky, x0, 0);
    c.drawImage(res.sky, x0 - 256, 0);
    const out = res.out, sin = cam.sin, cos = cam.cos, wave = F(t / 8), [h0, h1, h2] = OP.haze;
    // last caption (中央の 陣地を うばえ): the zone's rim blinks gold, 16f on / 16f off (always on with reduced motion)
    const ringAt = t >= 3 * OP.cap && GS.blink(t - 3 * OP.cap, 16, 16) ? floors.ring : null;
    for (let y = FLOOR_TOP; y < GS.H; y++) {
      const depth = (cam.h * OP.focal) / (y - OP.horizon), k = depth / OP.focal, row = (y - FLOOR_TOP) * 256;
      // haze toward the horizon: rows of sky5, then sky5 / sky4, then sky4 on every other row
      const haze = depth > h0 ? col.fog5 : depth > h1 ? (y & 1 ? col.fog4 : col.fog5) : depth > h2 && !(y & 1) ? col.fog4 : 0;
      if (haze) { out.fill(haze, row, row + 256); continue; }
      // open water seen at a low angle (farther than 700) mirrors the sky row as far above the horizon as it is below,
      // on every other row (moving every 8f); nearer water, looked down on, keeps its own colours (mirrored there, it
      // would show the sky's dark top as lines across it)
      const ph = y + wave, mirror = depth > 700 && ph & 1;
      const m = Math.max(0, 2 * OP.horizon - y) * 256, dX = cos * k, dY = sin * k;
      let X = cam.x + sin * depth - 128 * dX, Y = cam.y - cos * depth - 128 * dY;
      for (let x = 0; x < 256; x++, X += dX, Y += dY) {
        const ix = Math.floor(X * s), iy = Math.floor(Y * s);
        let v, wet;
        if (ix >= 0 && iy >= 0 && ix < fw && iy < fh) { const q = iy * fw + ix, f = fd[q]; v = ringAt && ringAt[q] ? col.gold : f; wet = isWater(col, f); }
        else { v = outsideCol(X, Y, depth, col); wet = v === col.puddle; }
        out[row + x] = wet && mirror ? sd[m + ((x - shift) & 255)] : v;
      }
    }
    c.putImageData(res.img, 0, FLOOR_TOP);
    return { cam, fl };
  }
  // a world point on the ground -> [screen x, screen y, depth], or null when it is (nearly) behind the camera
  function opProject(cam, X, Y) {
    const dx = X - cam.x, dy = Y - cam.y, depth = dx * cam.sin - dy * cam.cos;
    return depth < 16 ? null : [128 + ((dx * cam.cos + dy * cam.sin) * OP.focal) / depth, OP.horizon + (cam.h * OP.focal) / depth, depth];
  }

  // ながい 雨が やんだ。: slanted streaks as on the losing result screen, falling 8 px down and 4 px left every 2f. Drop
  // i stops between 20f and 60f, finishing the fall it is in (60f a screen), so the last ones are gone by 120f. With
  // reduced motion the streaks stand still and go out one by one.
  const RAIN = { n: 32, stop: 20, spread: 40 };
  function drawRain(c, t) {
    const s = reduced() ? 0 : F(t / 2);
    for (let i = 0; i < RAIN.n; i++) {
      const stop = RAIN.stop + (i * RAIN.spread) / RAIN.n, x0 = F(hash2(i, 5) * 272), y0 = F(hash2(i, 9) * 240);
      const fall = y0 + s * 8, lap = F(fall / 240);
      const began = reduced() ? t : lap ? Math.ceil((lap * 240 - y0) / 8) * 2 : 0;
      if (began >= stop) continue;
      const y = fall - lap * 240 - 8, x = ((((x0 - s * 4) % 272) + 272) % 272) - 8;
      GS.line(c, x + 4, y, x, y + 7, 'rain');
    }
  }

  // まちに 水たまりが のこった。: glints on the courtyard's puddles (two points in each, given in pool radii), each one
  // 4 steps of 3f (dot, small cross, big cross, small cross) once every 24f at its own phase; only on open water and
  // nearer than GLINT_FAR. Reduced motion: the small cross, still.
  const GLINTS = [[-0.4, -0.15], [0.3, 0.3]], GLINT_FAR = 1600;
  function drawGlints(c, cam, fl, t) {
    const st = GS.stage('tutorial'); if (!st) return;
    const col = opResources().col, plus = (x, y, r, k) => { GS.rect(c, x - r, y, 2 * r + 1, 1, k); GS.rect(c, x, y - r, 1, 2 * r + 1, k); };
    st.pools.forEach((p, i) => {
      const ca = Math.cos(p.angle || 0), sa = Math.sin(p.angle || 0);
      GLINTS.forEach(([u, v], j) => {
        const a = (t + (i * GLINTS.length + j) * 11) % 24;
        if (!reduced() && a >= 12) return;
        const X = p.x + u * p.rx * ca - v * p.ry * sa, Y = p.y + u * p.rx * sa + v * p.ry * ca;
        const under = fl.d32[F(Y * OP.scale) * fl.w + F(X * OP.scale)], pr = opProject(cam, X, Y);
        if (!isWater(col, under) || !pr || pr[2] > GLINT_FAR || pr[1] < OP.horizon + 4) return;
        const x = R(pr[0]), y = R(pr[1]), f = reduced() ? 1 : F(a / 3);
        if (f === 2) { plus(x, y, 2, 'waterHi'); plus(x, y, 1, 'white'); }
        else if (f !== 0) plus(x, y, 1, 'waterHi');
        GS.rect(c, x, y, 1, 1, 'white');
      });
    });
  }

  // 3たい3!: the teams face off across the zone, blue on the camera's side (TEAM.lead / TEAM.back short of the zone
  // along the last camera key's view, the two behind TEAM.side apart) and orange rotated 180 degrees about the zone, as
  // on the stages; clear of the walls and outside the zone. Drawn at 1x (the play screen's size about the zone), far
  // to near, aiming at the other team's leader. Each drops in at TEAM.at[i]f into the caption: a 2f flash and a hop
  // (reduced motion: neither).
  const TEAM = { lead: 100, back: 130, side: 100, at: [12, 26, 26, 18, 32, 32] };
  const HOP = [0, -3, -5, -6, -6, -5, -3, -1];
  // the six spots on the ground (blue 0..2, orange 3..5; the leaders first)
  function teamSpots() {
    const Z = GS.ZONE, k = LAST_KEY, d = Math.hypot(Z.x - k.x, Z.y - k.y), ux = (Z.x - k.x) / d, uy = (Z.y - k.y) / d;
    const blue = [[TEAM.lead, 0], [TEAM.back, TEAM.side], [TEAM.back, -TEAM.side]]
      .map(([a, b]) => ({ x: Z.x - ux * a - uy * b, y: Z.y - uy * a + ux * b, team: 0 }));
    return blue.concat(blue.map(o => ({ x: 2 * Z.x - o.x, y: 2 * Z.y - o.y, team: 1 })));
  }
  function drawTeams(c, cam, t) {
    const all = teamSpots().map((o, i) => ({ team: o.team, a: t - 3 * OP.cap - TEAM.at[i], p: opProject(cam, o.x, o.y) }));
    const lead = [all[3].p, all[0].p];   // where each team aims: the other team's leader
    all.filter(o => o.a >= 0 && o.p).sort((A, B) => B.p[2] - A.p[2]).forEach(({ team, a, p }) => {
      const at = lead[team], dx = at ? at[0] - p[0] : 0, dy = at ? at[1] - p[1] : 0;
      const hop = reduced() ? 0 : HOP[a] || 0;
      GS.actor(c, p[0], p[1] - 7 + hop, { team, pose: 'field', aimDir16: GS.dir16(dx, dy), tank: 7, frame: 0,
        faceLeft: Math.abs(dx) < 1 ? team === 1 : dx < 0, flash: !reduced() && a < 2 });
    });
  }

  // The opening's slow work, one piece per call (each can take tens of ms): its fixed parts, then a floor per puddle
  // level from full to low. Called on the boot screen's first frames (still dark), so the flyover never stops for it,
  // and during caption 2 for anything still missing (an opening entered without the boot screen).
  function prepareOpening() {
    if (!opRes) { opResources(); return; }
    const fc = floorCache(); if (!fc.src) return;
    for (let lv = SHRINK.full; lv >= SHRINK.low; lv--) if (!fc.by[lv]) { buildFloor(lv); return; }
  }
  function drawOpening(L, t) {
    const { cam, fl } = drawFlyover(L.bg1, t);
    if (t < OP.cap) drawRain(L.obj, t);
    else if (t < 2 * OP.cap) drawGlints(L.obj, cam, fl, t);
    else if (t >= 3 * OP.cap) drawTeams(L.obj, cam, t);
    const open = GS.step(t, 0, 6);
    GS.win(L.hud, 8, 176, 240, 32, { fill: 'half', open });
    if (open >= 1) GS.text16(L.hud, CAPTIONS[clamp(F(t / OP.cap), 0, 3)], 128, 184, { align: 'center' });
  }

  // =====================================================================
  // menu
  // =====================================================================
  const MENU_ITEMS = [
    { id: 'start', label: 'ゲームスタート', x: 80, y: 136, cx: 64 },
    { id: 'manual', label: 'せつめいしょ', x: 80, y: 152, cx: 64 },
    { id: 'option', label: 'オプション', x: 80, y: 168, cx: 64 },
  ];
  const MENU_WIN = [56, 128, 152, 64];
  function newMenu(index) { return GS.menu({ items: MENU_ITEMS.map(o => Object.assign({}, o)), index: index || 0 }); }
  function drawMenuWin(L, m, t, open) {
    GS.win(L.hud, MENU_WIN[0], MENU_WIN[1], MENU_WIN[2], MENU_WIN[3], { open });
    if (open >= 1) m.draw(L.hud, t);
  }

  // =====================================================================
  // option
  // =====================================================================
  // five rows 20px apart; the track name of the sound test sits at y148, above もどる (y172)
  const OPT_ROWS = [
    { id: 'sound', label: 'おと', y: 48 },
    { id: 'bgm', label: 'おんがく', y: 68 },
    { id: 'stereo', label: 'ステレオ', y: 88 },
    { id: 'warn', label: 'けいこくおん', y: 108 },
    { id: 'test', label: 'サウンドテスト', y: 128 },
    { id: 'back', label: 'もどる', y: 172 },
  ];
  const TEST_NAME_Y = 148;
  // sound test list: BGM 01..04 (js/bgm-tracks.js, with the track's name below) then SE 01.. in GS.SFX_LIST order
  const BGM_N = 4;
  const sfxList = () => GS.SFX_LIST || [];
  const testCount = () => BGM_N + sfxList().length;
  let testIdx = 0; // the list starts at BGM 01
  function testLabel(i) { return i < BGM_N ? 'BGM ' + GS.pad(i + 1, 2, '0') : 'SE ' + GS.pad(i - BGM_N + 1, 2, '0'); }
  const bgmTrack = i => (GS.bgm && GS.bgm.tracks()[i]) || null;
  // the BGM entry's name (「なし」 if that track is missing)
  const testName = i => (i < BGM_N ? (bgmTrack(i) ? bgmTrack(i).name : 'なし') : '');
  // value column: ◀ x152 (8px after サウンドテスト, which ends at x143), the value centred in x162..221, ▶ x224
  const OPT_X = { left: 152, value: 192, right: 224 };
  function optValue(id) {
    switch (id) {
      case 'sound': return GS.state.sound > 0 ? 'ON' : 'OFF';
      case 'bgm': return GS.state.bgm !== false ? 'ON' : 'OFF';
      case 'stereo': return GS.state.stereo !== false ? 'STEREO' : 'MONO';
      case 'warn': return GS.state.warnSound ? 'ON' : 'OFF';
      case 'test': return testLabel(testIdx);
      default: return null;
    }
  }
  // The menu also carries one deck-only item after サウンドテスト: on touch the deck shows
  // ［サウンドテスト：SE 01 ▶］(tap = next entry) and ［♪ きく（SE 01）］(tap = play), so the sound test no longer
  // needs the small ROM arrows. The deck-only item is not drawn on the ROM and ↑↓ skip it.
  function newOptMenu(index) {
    const items = OPT_ROWS.map(r => ({ id: r.id, label: r.label, x: 32, y: r.y, cx: 16, deckLabel: r.label }));
    items.splice(items.findIndex(it => it.id === 'test') + 1, 0,
      { id: 'testPlay', label: '', deckLabel: 'きく', x: -999, cx: -999, y: -999, w: 0, h: 0, deckOnly: true, draw() {} });
    return GS.menu({ index: index || 0, items });
  }
  const optIndex = (m, id) => m.items.findIndex(it => it.id === id);
  // deckLabel = deck / rail button text; say = what the screen reader hears for the selected item
  // (core's GS.menu announces item.say whenever the selection or its text changes)
  function syncOptLabels(m) {
    const name = testName(testIdx), nm = name ? ' ' + name : '';
    m.items.forEach(it => {
      if (it.id === 'testPlay') {
        it.deckLabel = '♪ きく（' + testLabel(testIdx) + nm + '）';
        it.say = testLabel(testIdx) + nm + ' を きく';
        return;
      }
      const v = optValue(it.id);
      it.deckLabel = !v ? it.label : it.id === 'test' ? it.label + '：' + v + ' ▶' : it.label + '：' + v;
      it.say = !v ? it.label : it.label + ' ' + v + (it.id === 'test' ? nm : '');
    });
  }
  function drawOption(L, m, t, f) {   // f: the background wave phase (the still passes 0)
    drawPattern(L, false, f);
    GS.banner(L.hud, 'OPTION', 80, 16, { set: 'H0' });
    GS.win(L.hud, 8, 40, 240, 160);
    m.draw(L.hud, t);
    const cur = m.items[m.index] && m.items[m.index].id;
    OPT_ROWS.forEach(r => {
      const v = optValue(r.id); if (v == null) return;
      const sel = r.id === cur || (r.id === 'test' && cur === 'testPlay'), set = sel ? 'H3' : 'H0';
      GS.text8(L.hud, '◀', OPT_X.left, r.y + 4, { set: sel ? 'H3' : 'HL' });
      GS.text8(L.hud, v, OPT_X.value, r.y + 4, { set, align: 'center' });
      GS.text8(L.hud, '▶', OPT_X.right, r.y + 4, { set: sel ? 'H3' : 'HL' });
    });
    if (testIdx < BGM_N) GS.text16(L.hud, testName(testIdx), OPT_X.value, TEST_NAME_Y, { set: 'HL', align: 'center' });
  }

  // =====================================================================
  // stage select
  // =====================================================================
  let patternCv = null;
  function pattern() {
    if (patternCv) return patternCv;
    patternCv = GS.makeCanvas(256, 224); const c = patternCv.getContext('2d');
    for (let x = 0; x < 256; x += 16) for (let y = 0; y < 224; y += 2) GS.px(c, x, y, 'frameLo');
    for (let y = 0; y < 224; y += 16) for (let x = 0; x < 256; x += 2) GS.px(c, x, y, 'frameLo');
    for (let y0 = 8; y0 < 224; y0 += 32) {
      for (let x = 0; x < 256; x++) GS.px(c, x, y0 + R(2 * Math.sin((x / 32) * Math.PI * 2)), 'blueDk');
    }
    return patternCv;
  }
  // background: band (bg1) + grid / wave lines (bg2, flowing with fx.wave 1 line every 4f)
  function drawPattern(L, hole, f) {
    GS.rect(L.bg1, 0, 0, 256, 224, 'band');
    L.bg2.drawImage(pattern(), 0, 0);
    if (hole) L.bg2.clearRect(14, 34, 124, 76);
    // 動きをへらす: the full-screen wobble is off (the grid and lines then stand still)
    GS.fx.wave = reduced() ? null : { y0: 0, y1: 223, amp: 1, period: 32, phase: F(f / 4) };
  }
  const MAP = { x: 16, y: 36, w: 120, h: 72, s: 1 / 10 };
  function ring(c, x, y, w, h, tok) { GS.rect(c, x, y, w, 1, tok); GS.rect(c, x, y + h - 1, w, 1, tok); GS.rect(c, x, y, 1, h, tok); GS.rect(c, x + w - 1, y, 1, h, tok); }
  // rule line (y180): the capture goal comes from game.mjs CONFIG (GS.RULES)
  const ruleLine = () => (GS.RULES ? GS.RULES.captureGoal : 30) + '秒確保か ぜんめつで かち!';
  function drawStage(L, n, f, mosaic) {
    const st = stageAt(n); if (!st) return;
    drawPattern(L, true, f);
    // preview map (bg1): ground, walls, puddles (initial level), pumps (2x2), zone ring r8
    L.bg1.drawImage(GS.mapCanvas(st.id, MAP.s), MAP.x, MAP.y);
    GS.drawPuddles(L.bg1, st.id, st.pools.map(p => GS.poolLevel(p.initial, p.capacity)), MAP.x, MAP.y, MAP.s, f);
    GS.drawPumps(L.bg1, st.id, null, MAP.x, MAP.y, MAP.s, f);
    GS.drawZone(L.bg1, MAP.x, MAP.y, MAP.s, 'neutral', f);
    if (mosaic > 1) GS.mosaicRegion(L.bg1, MAP.x, MAP.y, MAP.w, MAP.h, mosaic);
    // frame (2px, x14..137 y34..109) and start directions
    ring(L.hud, 14, 34, 124, 76, 'ink'); ring(L.hud, 15, 35, 122, 74, 'frameHi');
    GS.text8(L.hud, '▶', 17, 68, { set: 'H1', style: 'outline' });
    GS.text8(L.hud, '◀', 128, 68, { set: 'H2', style: 'outline' });
    // texts
    GS.banner(L.hud, 'STAGE SELECT', 32, 8, { set: 'H0' });
    GS.text8(L.hud, 'STAGE ' + st.no, 144, 36);
    GS.text16(L.hud, st.nameRom[0], 144, 48);
    GS.text16(L.hud, st.nameRom[1], 144, 64);
    GS.text16(L.hud, st.levelRom, 144, 83, { set: 'H7' }); // y83: 1px above the 8px grid on purpose
    GS.text8(L.hud, 'CPU', 144, 100);
    for (let i = 0; i < 4; i++) GS.text8(L.hud, i < st.cpu ? '★' : '☆', 176 + i * 8, 100, { set: i < st.cpu ? 'H3' : 'H0' });
    GS.win(L.hud, 8, 116, 240, 60); // y116..175, off the 8px grid on purpose
    st.descRom.forEach((s, i) => GS.text16(L.hud, s, 16, 122 + i * 16));
    GS.text16(L.hud, ruleLine(), 128, 180, { set: 'H3', align: 'center' });
    GS.text8(L.hud, '◀ ' + n + '/4 ▶', 128, 200, { align: 'center' });
  }

  // =====================================================================
  // runtime
  // =====================================================================
  const S = { st: null, params: {}, t: 0, busy: false, fading: false, next: null };
  let epoch = 0;
  let lastStage = 1;
  let glintClock = 0;
  function after(p, fn) { const e = epoch; p.then(() => { if (e === epoch) fn(); }); }
  // fade out, then run fn. If a fade is already running, only the destination changes.
  function fadeThen(frames, fn) {
    S.next = fn; S.busy = true;
    if (S.fading) return;
    S.fading = true;
    after(GS.transition('fadeOut', { frames }), () => { S.fading = false; const n = S.next; S.next = null; if (n) n(); });
  }
  const goTitleComplete = () => GS.go('title', 'title', { complete: true });
  function sceneT(t) { return S.params.complete ? t + 56 : t; }
  function glintOf() { if (glintClock < 0 || reduced()) return null; const p = glintClock % 240; return p < 24 ? p / 23 : null; }

  function sortie() {
    const st = stageAt(S.n);
    if (!st) { GS.sfx('buzz'); GS.warnOnce('title:nostage', 'stage', S.n, 'has no data (GS.STAGES)'); return; }
    S.busy = true; S.sortie = { black: null, done: false };
    GS.sfx('start');
    if (GS.bgm) GS.bgm.stop(40);   // the stage select music fades with the iris (32f) and the black (8f)
    after(GS.transition('irisClose', { x: 76, y: 72, r0: 160, frames: 32 }), () => { S.sortie.black = 0; GS.fx.bright = 0; });
    S.stageId = st.id;
  }
  // after the iris (32f) and 8 black frames. Live: the real match (GS.app.startRound enters play/countdown with
  // params.live); mock: the scripted countdown.
  function goPlay() {
    if (S.sortie) S.sortie.done = true;
    const st = stageAt(S.n); if (!st) return;
    if (live()) { GS.app.startRound(st.id); return; }
    GS.state.stage = st.id; GS.state.stageNo = st.no;
    GS.go('play', 'countdown', { stage: st.id, stageNo: st.no, from: 'title' });
  }
  // the stage the menu's ゲームスタート opens: GS.app.selectedStage (live) or the last one shown (mock)
  function startStageNo() {
    if (live() && GS.app.selectedStage && typeof GS.app.stageNo === 'function') return clamp(GS.app.stageNo(GS.app.selectedStage) | 0 || 1, 1, 4);
    return lastStage;
  }
  // stage select shows stage n: in the live build that is GS.app.selectedStage (toStageSelect / ゲームスタート
  // come back to it)
  function selectStage(n) {
    lastStage = n;
    const st = stageAt(n);
    if (live() && st) GS.app.selectedStage = st.id;
  }

  // option actions. Each value change is announced (aria-live, no subtitle): through the menu's own
  // announcement when core provides it (m.announce reads item.say), otherwise directly.
  function sayOpt(id) {
    const m = S.st === 'option' ? S.m : null;
    if (m) {
      syncOptLabels(m);
      if (typeof m.announce === 'function' && m.items[m.index] && m.items[m.index].id === id) { m.announce(); return; }
    }
    const row = OPT_ROWS.find(r => r.id === id); if (!row) return;
    GS.shell.say(row.label + ' ' + optValue(id) + (id === 'test' && testName(testIdx) ? ' ' + testName(testIdx) : ''), { sub: false });
  }
  function changeOpt(id, d, quiet) {
    switch (id) {
      case 'sound':
        if (GS.state.sound > 0) { GS.setSound(0); } else { GS.audioInit(); GS.setSound(0.3); GS.sfx('ok'); }
        break;
      case 'bgm': GS.setOption('bgm', GS.state.bgm === false); GS.sfx('cursor'); break;
      case 'stereo': GS.setOption('stereo', GS.state.stereo === false); GS.sfx('cursor'); break;
      case 'warn': GS.setOption('warnSound', !GS.state.warnSound); GS.sfx('cursor'); break;
      case 'test': testIdx = (testIdx + d + testCount()) % testCount(); GS.sfx('cursor'); break;
      default: return;
    }
    if (!quiet) sayOpt(id);
  }
  // stage select: announce the selected stage (on entry and on every switch)
  function sayStage(n) {
    const st = stageAt(n); if (!st) return;
    GS.shell.say('ステージ' + st.no + '／4 ' + st.name + ' レベル ' + st.levelRom + ' CPUの つよさ ' + st.cpu + '／4 ' + st.descRom.join(' '), { sub: false });
  }
  // BGM: from the top (also with おんがく OFF, until the next screen); SE: one shot
  function playTest() {
    if (testIdx < BGM_N) { const tr = bgmTrack(testIdx); if (tr && GS.bgm) GS.bgm.play(tr.id); return; }
    GS.sfx(sfxList()[testIdx - BGM_N]);
  }
  function optionBack() { GS.sfx('back'); fadeThen(16, () => GS.go('title', 'menu', { fade: true, index: 2 })); }

  const def = {
    title: 'タイトル',
    states: ['boot', 'opening', 'title', 'menu', 'option', 'stage1', 'stage2', 'stage3', 'stage4'],
    labels: {
      boot: '会社ロゴ', opening: 'オープニング', title: 'タイトル（PUSH）', menu: 'メニュー', option: 'オプション',
      stage1: 'ステージ選択 1', stage2: 'ステージ選択 2', stage3: 'ステージ選択 3', stage4: 'ステージ選択 4',
    },
    LOGO_BOX,
    logoCanvas,
    // draws the whole logo with the logo box top-left at (x,y) (ROM position = 32,24). opts.glint 0..1
    drawLogo(ctx, x, y, opts) { drawLogoAt(ctx, x == null ? LOGO_BOX.x : x, y == null ? LOGO_BOX.y : y, opts); },
    PUSH: { pc: PUSH_PC, touch: PUSH_TOUCH },

    enter(st, params) {
      epoch++;
      params = params || {};
      Object.assign(S, { st, params, t: 0, busy: false, fading: false, next: null, pushT: null, closeT: null, sortie: null, said: -1, skip: false });
      if (st !== 'boot' && st !== 'opening') opRes = floors = null;   // past the opening: free its floors (a few MB)
      if (st === 'boot') { GS.fx.bright = 0; return; }
      if (st === 'opening') { GS.transition('fadeIn', { frames: 16 }); return; }
      if (st === 'title') {
        if (!params.keepGlint) glintClock = params.complete ? 0 : -56;
        S.pm = GS.menu({ items: [{ id: 'push', label: '', deckLabel: 'スタート', x: -999, y: -999, w: 0, h: 0 }] });
        if (!params.noFade) GS.transition('fadeIn', { frames: 16 });
        return;
      }
      if (st === 'menu') {
        S.m = newMenu(params.index);
        S.openT = params.fromPush ? 0 : -6; // from PUSH: open the window (6f); otherwise already open
        if (params.fade) GS.transition('fadeIn', { frames: 16 });
        return;
      }
      if (st === 'option') {
        S.m = newOptMenu(params.index); syncOptLabels(S.m);
        if (params.fade) GS.transition('fadeIn', { frames: 16 });
        return;
      }
      const n = +String(st).replace('stage', '') || 1;
      S.n = clamp(n, 1, 4); selectStage(S.n);
      sayStage(S.n);
      if (params.fade) GS.transition('fadeIn', { frames: 16 });
    },

    update(t, input) {
      S.t = t;
      switch (S.st) {
        case 'boot': {
          if (input.pressed('any') && !S.skip) {
            S.skip = true;
            if (t < 46) { goTitleComplete(); return; } // still dark: go straight to the title (fades in 16f)
            fadeThen(16, goTitleComplete); return;
          }
          if (t >= 1) prepareOpening();
          if (t === 30) GS.transition('fadeIn', { frames: 16 });
          if (t === 60) GS.sfx('drop');
          if (t === 166 && !S.busy) fadeThen(16, () => GS.go('title', 'opening'));
          return;
        }
        case 'opening': {
          if (input.pressed('any') && !S.skip) {
            S.skip = true;
            if (t < 16) { goTitleComplete(); return; }
            fadeThen(16, goTitleComplete); return;
          }
          const k = clamp(F(t / OP.cap), 0, 3);
          if (t === 0) GS.sfx('msg');
          if (k !== S.said && t < OP.len) { S.said = k; GS.shell.say(CAPTIONS[k]); }
          if (t === OP.len && !S.busy) fadeThen(16, () => GS.go('title', 'title'));
          return;
        }
        case 'title': {
          const sT = sceneT(t);
          glintClock++;
          if (S.pushT != null) {
            if (t - S.pushT >= 60) GS.go('title', 'menu', { fromPush: true, keepFx: true });
            return;
          }
          if (S.busy) return;
          const picked = S.pm.update(input);
          if (input.pressed('any') || picked) {
            if (sT < 56) { GS.go('title', 'title', { complete: true, noFade: true }); return; } // finish the intro first
            S.pushT = t; GS.sfx('ok'); return;
          }
          if (sT === 32) GS.sfx('splash');
          if (t >= 1200) {
            // live: a real demo match (GS.app.startDemo enters play/demo with params.live); mock: the scripted demo
            S.busy = true; if (GS.bgm) GS.bgm.stop(32);
            fadeThen(32, () => (live() ? GS.app.startDemo() : GS.go('play', 'demo', { from: 'title' })));
          }
          return;
        }
        case 'menu': {
          glintClock++;
          if (S.closeT != null) { if (t - S.closeT >= 6) GS.go('title', 'title', { complete: true, noFade: true, keepGlint: true }); return; }
          if (S.busy || t < S.openT + 6) return;
          const id = S.m.update(input);
          if (id === 'start') { GS.sfx('start'); fadeThen(32, () => GS.go('title', 'stage' + startStageNo(), { fade: true })); }
          else if (id === 'manual') { GS.sfx('ok'); if (live()) GS.app.openManual('cover1'); else GS.shell.openManual('cover1'); }
          else if (id === 'option') { GS.sfx('ok'); fadeThen(16, () => GS.go('title', 'option', { fade: true })); }
          else if (input.pressed('back')) { GS.sfx('back'); S.closeT = t; S.busy = true; }
          return;
        }
        case 'option': {
          if (S.busy) return;
          const m = S.m;
          syncOptLabels(m);
          // ROM taps on ◀ (x146..167) / ▶ (x216..247)
          for (let i = 0; i < OPT_ROWS.length; i++) {
            const r = OPT_ROWS[i]; if (r.id === 'back') continue;
            const d = input.hit(OPT_X.left - 6, r.y, 22, 16) === 'tap' ? -1 : input.hit(OPT_X.right - 8, r.y, 32, 16) === 'tap' ? 1 : 0;
            if (d) { // change first, then select: one announcement with the new value
              changeOpt(r.id, d, true); syncOptLabels(m); m.setIndex(optIndex(m, r.id));
              if (typeof m.announce !== 'function') sayOpt(r.id);
              return;
            }
          }
          const fromDeck = m._pick != null; // a deck / rail button (GS.menuPick) rather than Enter or a ROM tap
          // ↑↓ step over the deck-only item (it has no ROM row): move here and hide ↑↓ from the menu, so the
          // hidden item is never selected (or announced) even for one frame
          let inp = input;
          const dn = input.pressed('down'), up = !dn && input.pressed('up');
          if (!fromDeck && (dn || up)) {
            const n = m.items.length, d = dn ? 1 : -1, nx = (m.index + d + n) % n;
            if (m.items[nx].deckOnly) {
              m.setIndex((nx + d + n) % n); GS.sfx('cursor');
              inp = Object.create(input);
              inp.pressed = k => (k === 'up' || k === 'down' ? false : input.pressed(k));
            }
          }
          const id = m.update(inp);
          if (id) {
            if (id === 'back') optionBack();
            else if (id === 'testPlay') { m.setIndex(optIndex(m, 'test')); playTest(); }
            else if (id === 'test') { if (fromDeck) changeOpt('test', 1); else playTest(); }
            else changeOpt(id, 1);
            syncOptLabels(m);
            return;
          }
          // ↑↓ never rest on the deck-only item (it has no ROM row)
          if (m.items[m.index].deckOnly) m.setIndex(m.index + (input.pressed('up') ? -1 : 1));
          const row = m.items[m.index];
          if (input.pressed('left')) changeOpt(row.id, -1);
          else if (input.pressed('right')) changeOpt(row.id, 1);
          else if (input.pressed('back')) optionBack();
          syncOptLabels(m);
          return;
        }
        default: { // stage1..4
          if (S.sortie) { if (!S.sortie.done && S.sortie.black != null && ++S.sortie.black >= 8) goPlay(); return; }
          if (S.busy) return;
          let d = 0;
          if (input.pressed('left') || input.pressed('up')) d = -1;
          else if (input.pressed('right') || input.pressed('down')) d = 1;
          else if (input.hit(64, 196, 64, 16) === 'tap') d = -1;
          else if (input.hit(128, 196, 64, 16) === 'tap') d = 1;
          if (d) {
            GS.sfx('cursor');
            GS.go('title', 'stage' + (((S.n - 1 + d + 4) % 4) + 1), { switched: true, keepFx: true });
            return;
          }
          if (input.pressed('ok') || input.hit(14, 34, 124, 76) === 'tap') { sortie(); return; }
          if (input.pressed('back')) { GS.sfx('back'); fadeThen(16, () => GS.go('title', 'menu', { fade: true })); }
        }
      }
    },

    draw(L, t) {
      const f = GS.state.frame;
      switch (S.st) {
        case 'boot': drawBoot(L, t, false); return;
        case 'opening': drawOpening(L, t); return;
        case 'title': {
          const sT = sceneT(t);
          const push = S.pushT != null ? GS.blink(t - S.pushT, 10, 10) : sT >= 56 && GS.blink(sT - 56, 32, 32);
          drawTitleScene(L, sT, f, { push, glint: sT >= 56 ? glintOf() : null });
          return;
        }
        case 'menu': {
          drawTitleScene(L, 9999, f, { push: false, glint: glintOf() });
          const open = S.closeT != null ? 1 - GS.step(t, S.closeT, 6) : GS.step(t, S.openT, 6);
          drawMenuWin(L, S.m, t, open);
          return;
        }
        case 'option': drawOption(L, S.m, t, f); return;
        default:
          if (S.n) drawStage(L, S.n, f, S.params.switched && !reduced() && t < 8 ? 8 - t : 1);
      }
    },

    // representative frames (no animation) for the manual / launcher
    still(st, L) {
      switch (st) {
        case 'boot': drawBoot(L, 120, true); return;
        case 'opening': drawOpening(L, OP.len - 30); return; // caption 4: the camera has stopped, the zone in the middle
        case 'title': drawTitleScene(L, 9999, 0, { push: true, still: true }); return;
        case 'menu': drawTitleScene(L, 9999, 0, { push: false, still: true }); drawMenuWin(L, newMenu(0), 0, 1); return;
        case 'option': { // default values of the sound test (BGM 01 and its name), whatever the live screen shows
          const keep = testIdx; testIdx = 0;
          try { drawOption(L, newOptMenu(0), 0, 0); } finally { testIdx = keep; }
          return;
        }
        default: drawStage(L, clamp(+String(st).replace('stage', '') || 1, 1, 4), 0, 1);
      }
    },

    // BGM (js/bgm.js): the company logo is silent; BGM 01 from the story opening through title, menu and option
    // (it goes on across them); BGM 02 on stage select (switching stages keeps it going)
    bgm(st) { return st === 'boot' ? null : /^stage\d$/.test(st) ? 'select' : 'title'; },

    deck(st) {
      if (st === 'boot' || st === 'opening') return { type: 'none' };
      if (st === 'title' || st === 'menu' || st === 'option') return { type: 'menu' };
      return { type: 'stage' };
    },
    legend(st) {
      switch (st) {
        case 'boot': case 'opening': return { pc: 'Enter：スキップ', touch: 'がめんを タッチすると スキップ' };
        case 'title': return { pc: 'Enter：スタート', touch: 'がめんを タッチしてね' };
        case 'menu': return { pc: 'Enter：けってい ／ ↑↓：えらぶ ／ Esc：もどる', touch: '下のボタンで えらんでね' };
        case 'option': return { pc: '↑↓：えらぶ ／ ←→：かえる ／ Enter：けってい ／ Esc：もどる', touch: '下のボタンで えらんでね（サウンドテストは タップで つぎへ）' };
        default: return { pc: '←→：ステージ ／ Enter：しゅつげき ／ Esc：もどる', touch: '◀ ▶ で えらんで しゅつげき!' };
      }
    },

    // ROM coordinates for the manual's leader lines
    anchors: (function () {
      const stage = { heading: [128, 16], preview: [76, 72], blueStart: [20, 72], orangeStart: [131, 72], number: [144, 40], name: [144, 56],
        level: [144, 92], cpu: [144, 104], stars: [192, 104], desc: [128, 146], rule: [128, 188], page: [128, 204], prev: [100, 204], next: [156, 204] };
      return {
        boot: { drop: [128, 80], company: [128, 104], presents: [128, 120] },
        opening: { horizon: [128, 72], floor: [128, 160], caption: [128, 192] },
        title: { logo: [128, 68], logoKana: [68, 36], subtitle: [128, 100], catch: [128, 120], push: [128, 156], credit: [128, 196], blue: [32, 160], orange: [224, 160] },
        menu: { window: [132, 160], cursor: [68, 144], start: [80, 144], manual: [80, 160], option: [80, 176], logo: [128, 68] },
        option: { heading: [128, 24], window: [128, 120], sound: [32, 56], bgm: [32, 76], stereo: [32, 96], warn: [32, 116], test: [32, 136], testName: [192, 156], back: [32, 180], value: [192, 52], left: [156, 52], right: [228, 52] },
        stage1: stage, stage2: stage, stage3: stage, stage4: stage,
      };
    })(),
  };
  def._debug = () => ({ st: S.st, t: S.t, busy: S.busy, fading: S.fading, sortie: S.sortie, n: S.n, lastStage, glintClock, epoch,
    live: live(), selectedStage: GS.app ? GS.app.selectedStage : null });
  GS.registerScreen('title', def);
})();
