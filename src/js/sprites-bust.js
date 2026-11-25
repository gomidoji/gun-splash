/* ガン・スプラッシュ 復刻版 — 32x32 bust sprites
 * bust_ready, bust_win1/2, bust_lose1/2, bust_tired (title, result, manual).
 *
 * Same character as the 16x16 field sprite (sprites-field.js): a round helmet with a crest swept back,
 * a dark visor with two glowing eyes, a gold line, a float-ring collar and a tank on the back.
 * All busts face RIGHT (draw ORANGE with flipX). Teams differ by palette only ('blue' / 'orange').
 *
 * OBJ palette slots: 1 outline  2 shell  3 shell hi  4 shell dark  5 visor  6 eye  7 gold line  8 collar
 *                    9 tank glass  a tank frame  b tank water  c water surface  d gun  e gun shadow
 *
 * The pictures are built from simple shapes on a 32x32 grid (back to front: tank, torso, collar,
 * gold line, helmet + crest, visor, arm + gun). Every part gets its own 1px outline (slot 1), so the
 * parts stay separated the way hand-made 16-bit sprites are.
 *
 * GS.BUST_LAYOUT (sprite-local pixels for a right-facing bust; mirror x as 31-x when flipX):
 *   muzzle.ready / muzzle.win1 / muzzle.win2 : water-gun nozzle (title arcs, result water column)
 *   drop.lose1 / drop.lose2                  : where the drip under the visor starts (result, lose)
 */
(function () {
  'use strict';
  const GS = window.GS;
  const N = 32;

  // ------------------------------------------------------------------ tiny raster helpers
  const grid = () => Array.from({ length: N }, () => Array(N).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const set = (g, x, y, c) => { if (inb(x, y)) g[y][x] = c; };
  const get = (g, x, y) => (inb(x, y) ? g[y][x] : '.');
  // filled ellipse; paint = char or fn(x, y, u, v) -> char|null  (u, v = normalised -1..1)
  function ell(g, cx, cy, rx, ry, paint) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (u * u + v * v <= 1) { const c = typeof paint === 'function' ? paint(x, y, u, v) : paint; if (c) set(g, x, y, c); }
    }
  }
  // thick segment (capsule); paint fn gets the signed side (+ = right of the direction p0->p1)
  function seg(g, x0, y0, x1, y1, r, paint) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
      const px = x0 + dx * k, py = y0 + dy * k, d = Math.hypot(x - px, y - py);
      if (d <= r) { const side = (dx * (y - y0) - dy * (x - x0)) / Math.sqrt(L2); const c = typeof paint === 'function' ? paint(x, y, side, k) : paint; if (c) set(g, x, y, c); }
    }
  }
  function poly(g, pts, paint) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) { const c = typeof paint === 'function' ? paint(x, y) : paint; if (c) set(g, x, y, c); }
    }
  }
  // 1px outline around everything drawn on this layer (4-neighbourhood)
  function outline(g, c) {
    const o = g.map(r => r.slice());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (g[y][x] !== '.') continue;
      if (get(g, x - 1, y) !== '.' || get(g, x + 1, y) !== '.' || get(g, x, y - 1) !== '.' || get(g, x, y + 1) !== '.') o[y][x] = c || '1';
    }
    return o;
  }
  function over(dst, src) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (src[y][x] !== '.') dst[y][x] = src[y][x]; }
  const rowsOf = g => g.map(r => r.join(''));

  // ------------------------------------------------------------------ parts
  function tank(g) {
    const L = grid();
    for (let y = 13; y <= 28; y++) for (let x = 1; x <= 6; x++) {
      const edge = x === 1 || x === 6 || y === 13 || y === 28;
      if ((x === 1 || x === 6) && (y === 13 || y === 28)) continue;           // rounded corners
      L[y][x] = edge ? 'a' : y === 19 ? 'c' : y > 19 ? 'b' : '9';
    }
    set(L, 2, 15, 'c'); set(L, 2, 16, 'c');                                    // glass glint
    set(L, 3, 12, 'a'); set(L, 4, 12, 'a'); set(L, 3, 11, 'a'); set(L, 4, 11, 'a'); // valve
    over(g, outline(L));
  }
  function torso(g, o) {
    const L = grid(), dy = o.slump || 0;
    ell(L, 16, 33 + dy, 12.6, 8.4, (x, y, u, v) => (u < -0.55 || v > 0.2 && u < -0.2 ? '4' : v < -0.72 && u > -0.35 ? '3' : '2'));
    // chest strap of the tank (gold line colour), from the right shoulder down to the left
    seg(L, 21, 26 + dy, 12, 31 + dy, 0.6, (x, y) => (get(L, x, y) !== '.' ? '7' : null));
    over(g, outline(L));
  }
  function collar(g, o) {
    const L = grid(), dy = o.slump || 0, cx = 16, cy = 23.6 + dy, rx = 12.6, ry = 3.2;
    // a fat tube: superellipse (|u|^4 + v^2 <= 1) so the ends are round, not pointed
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (u * u * u * u + v * v > 1) continue;
      L[y][x] = (x >= 8 && x <= 9) || (x >= 21 && x <= 22) ? '7' : v > 0.62 ? '9' : '8';   // float-ring bands
    }
    over(g, outline(L));
  }
  function goldLine(g, o) {
    const L = grid(), dy = o.slump || 0;
    ell(L, 15.5, 20.6 + dy, 10.6, 1.25, '7');
    over(g, outline(L));
  }
  function helmet(g, o) {
    const L = grid(), hx = o.hx || 0, hy = o.hy || 0, cx = 14.5 + hx, cy = 11.2 + hy;
    // crest: swept back over the top of the dome, tip sticking out behind (left)
    poly(L, [[17 + hx, 3.6 + hy], [14 + hx, 1 + hy], [8 + hx, 0.6 + hy], [1.6 + hx, 1.2 + hy], [3.5 + hx, 2.6 + hy], [8 + hx, 3.4 + hy], [11 + hx, 5 + hy]], (x, y) => (y - hy >= 3 ? '2' : '3'));
    ell(L, cx, cy, 11.4, 8.6, (x, y, u, v) => {
      if (v < -0.5 && u > -0.55 && u < 0.45 && u * u + v * v > 0.5) return '3';  // top rim light
      if (u < -0.42 && v > 0.05 || v > 0.78) return '4';                        // back / bottom shade
      return '2';
    });
    // specular spot on the dome
    [[9, 6], [10, 6], [9, 7]].forEach(([x, y]) => { if (get(L, x + hx, y + hy) !== '.') set(L, x + hx, y + hy, '3'); });
    // crest seam (a darker line where the crest meets the dome)
    [[6, 4], [7, 4], [8, 4], [9, 5], [10, 5]].forEach(([x, y]) => { if (get(L, x + hx, y + hy) !== '.') set(L, x + hx, y + hy, '4'); });
    over(g, outline(L));
  }
  function visor(g, o) {
    const L = grid(), hx = o.hx || 0, hy = o.hy || 0, x0 = 16 + hx, x1 = 27 + hx, y0 = 9 + hy, y1 = 16 + hy;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x === x0 || x === x1) && (y === y0 || y === y1)) continue;
      L[y][x] = '5';
    }
    const eyes = [x0 + 3, x0 + 8];   // left column of each eye
    const ey = y0 + 2;
    eyes.forEach(ex => {
      switch (o.eyes) {
        case 'happy':   // ^ ^
          set(L, ex - 1, ey + 2, '6'); set(L, ex, ey + 1, '6'); set(L, ex + 1, ey + 1, '6'); set(L, ex + 2, ey + 2, '6');
          break;
        case 'shut':    // looking down, eyes closed: short flat lines low in the visor
          set(L, ex - 1, ey + 3, '6'); set(L, ex, ey + 3, '6'); set(L, ex + 1, ey + 3, '6'); set(L, ex + 2, ey + 4, '6');
          break;
        case 'half':    // tired: half-closed (flat lid)
          set(L, ex - 1, ey + 1, '1'); set(L, ex, ey + 1, '1'); set(L, ex + 1, ey + 1, '1'); set(L, ex + 2, ey + 1, '1');
          set(L, ex, ey + 2, '6'); set(L, ex + 1, ey + 2, '6');
          break;
        default:        // open: 2x3 glowing eyes
          for (let y = 0; y < 3; y++) { set(L, ex, ey + y, '6'); set(L, ex + 1, ey + y, '6'); }
      }
    });
    set(L, x0 + 1, y0 + 1, '9');     // visor glint
    over(g, outline(L));
  }
  // The water gun, side view pointing right (same design as the HUD icon_normal: a team-coloured
  // reservoir on top, a white body, a grip below, water at the nozzle). Already outlined.
  const GUN = [
    '...1111.....',
    '..122331....',
    '..122221....',
    '.1111144111.',
    '1ddddddddd1.',
    '1deeeeeeedcb',
    '.11111dde11.',
    '.....1de1...',
    '.....1ee1...',
    '......11....',
  ];
  const GUN_NOZZLE = [11, 5];
  const rotR = s => Array.from({ length: s[0].length }, (_, ny) => Array.from({ length: s.length }, (_, nx) => s[s.length - 1 - nx][ny]).join(''));   // pointing down
  const GUN_DOWN = rotR(GUN);
  // The raised gun (win): the same water gun seen from the side with the nozzle pointing straight up.
  // 6x10 with the outline: a 1px gold nozzle tip (slot 7), a white body (d) with its shadow (e) on the
  // right and a small water window (c / b) on the back. No team colour. The glove covers rows 7-9.
  const GUN_RAISED = [
    '...1..',
    '..171.',
    '..1d1.',
    '.1dde1',
    '1cdde1',
    '1bdde1',
    '1bdee1',
    '.1dde1',
    '.1dde1',
    '..111.',
  ];
  const RAISED_TIP = [3, 1];   // nozzle pixel inside GUN_RAISED (stamped at hand - [3, 9])
  const RAISED_HAND = [28, 11];   // glove centre for bust_win1 (bust_win2: 2px higher)
  function stamp(L, s, x0, y0) { s.forEach((r, y) => Array.from(r).forEach((c, x) => { if (c !== '.') set(L, x0 + x, y0 + y, c); })); }

  // arm + water gun (front layer)
  function arm(g, o) {
    const L = grid(), A = grid();
    const sleeve = (x, y, side) => (side > 0.5 ? '4' : '2');
    switch (o.arm) {
      case 'ready': {   // gun held level in front of the chest, nozzle forward
        seg(A, 12, 28, 23, 26, 1.8, sleeve);
        ell(A, 24.5, 26.5, 1.8, 1.6, '8');                   // glove on the grip
        over(L, outline(A));
        const G = grid(); stamp(G, GUN, 19, 19); over(L, G);
        const H = grid(); ell(H, 25, 26.6, 1.6, 1.5, '8'); over(L, outline(H));
        break;
      }
      case 'up': case 'up2': {   // win: fist raised beside the visor, elbow out, a SHORT gun pointing straight up
        // The arm is bent (shoulder -> elbow out to the right -> hand back in) and drawn in the dark shell
        // colour, the gun is white with a gold tip and no team colour, so arm + gun never read as one long
        // staff (the team colour stays on the back tank and the shell). Light from the upper left.
        const k = o.arm === 'up2' ? 2 : 0, hx = RAISED_HAND[0], hy = RAISED_HAND[1] - k;   // win2: fist 2px higher
        const dark = (x, y, side) => (side < -1.1 ? '2' : '4');   // 1px lighter rim on the lit edge
        seg(A, 21, 27, 29, 20 - k, 1.7, dark);         // upper arm: shoulder -> elbow
        seg(A, 29, 20 - k, hx, hy + 1, 1.5, dark);     // forearm: elbow -> hand
        over(L, outline(A));
        const G = grid(); stamp(G, GUN_RAISED, hx - 3, hy - 9); over(L, G);
        const H = grid(); ell(H, hx, hy, 1.6, 1.5, '8'); over(L, outline(H));   // glove round the grip
        break;
      }
      case 'down': default: {   // arm hanging, gun pointing down (lose / tired)
        seg(A, 12, 28, 19, 28, 1.8, sleeve);
        over(L, outline(A));
        const G = grid(); stamp(G, GUN_DOWN, 18, 23); over(L, G);
        const H = grid(); ell(H, 20.2, 29.4, 1.6, 1.5, '8'); over(L, outline(H));
        break;
      }
    }
    over(g, L);
  }
  // small sweat drop beside the helmet (tired)
  const SWEAT = ['..1..', '.1c1.', '1cbb1', '1bbb1', '.111.'];
  function sweat(g, x, y) { const L = grid(); stamp(L, SWEAT, x, y); over(g, L); }

  function build(o) {
    const g = grid();
    tank(g); torso(g, o); collar(g, o); goldLine(g, o); helmet(g, o); visor(g, o); arm(g, o);
    if (o.sweat) sweat(g, o.sweat[0], o.sweat[1]);
    return rowsOf(g);
  }

  const POSES = {
    bust_ready: { eyes: 'open', arm: 'ready' },
    bust_win1: { eyes: 'happy', arm: 'up', hy: 1, hx: -1 },
    bust_win2: { eyes: 'happy', arm: 'up2', hy: 0, hx: -1 },
    bust_lose1: { eyes: 'shut', arm: 'down', hy: 3, hx: 1, slump: 1 },
    bust_lose2: { eyes: 'shut', arm: 'down', hy: 4, hx: 1, slump: 1 },
    bust_tired: { eyes: 'half', arm: 'down', hy: 1, slump: 1, sweat: [26, 1] },
  };
  for (const name in POSES) GS.defSprite(name, build(POSES[name]), { w: N, h: N });

  // nozzle = GUN_NOZZLE moved by the stamp position (and rotation)
  GS.BUST_LAYOUT = {
    // win: GUN_RAISED is stamped at hand - [3, 9]; the hand is RAISED_HAND (win1) or 2px higher (win2)
    muzzle: {
      ready: [19 + GUN_NOZZLE[0], 19 + GUN_NOZZLE[1]],
      win1: [RAISED_HAND[0] - 3 + RAISED_TIP[0], RAISED_HAND[1] - 9 + RAISED_TIP[1]],
      win2: [RAISED_HAND[0] - 3 + RAISED_TIP[0], RAISED_HAND[1] - 11 + RAISED_TIP[1]],
    },
    drop: { lose1: [25, 21], lose2: [25, 22] },
  };
})();
