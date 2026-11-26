/* ガン・スプラッシュ 復刻版 — play screen
 * Two paths share every drawing function:
 *  - MOCK (MOCK panel, #hash, GS.still for the manual / launcher): no game logic runs. A small deterministic
 *    scene simulation ("sim") plays a 480f script on stage 1 with GS.MOCK.play data. Inputs only
 *    change the aim, the weapon, pause and R (restart). still() pre-rolls a fresh sim, so stills equal the frames
 *    the running scene shows. Runtime state: `mock`.
 *  - LIVE (params.live from GS.app.startRound / retry / startDemo; see "LIVE" near the end): the real match of
 *    game.mjs (GS.app.game) is updated in this screen's fixed 60 fps step and shown through a view object with
 *    the sim's shape (v.real = true). Runtime state: `real`.
 * In this file "live" always means the real match; the mock's field scenes are FIELD_STATES.
 *
 * Coordinates: world / 3 = map px (400x240). Screen = (mx - cam.x, my - cam.y + 32). Field rows y32-190.
 * Layers: bg1 = ground, zone, pumps / bg2 = puddles (fx.wave rows 32-190) / obj = actors, shots,
 * effects, aim, edge marks / hud = top band, bottom band, message window, overlays.
 */
(function () {
  'use strict';
  const GS = window.GS;
  const R = Math.round, F = Math.floor;
  const STAGE = 'tutorial', SC = 1 / 3, LOOP = 480;
  const FY0 = 32, FY1 = 190;
  const BV = 470 / 3 / 60;                                   // shot speed, map px per frame
  const WEAP = ['normal', 'splash', 'long'];
  const WEAPON_LABEL = { normal: 'NORMAL', splash: 'SPLASH', long: 'LONG' };   // HUD / pause weapon names
  const COST = { normal: 5, splash: 15, long: 25 };
  const RANGE = { normal: 120, splash: 40, long: 466, weak: 60 };   // map px (world / 3)
  const LONG_WAIT0 = 564;                                    // 9.4 s left on YOU's long barrel
  // mock states that show the running field scene; pause and end-* have their own handlers
  const FIELD_STATES = ['countdown', 'normal', 'contest', 'lowhp', 'finale', 'spectate', 'demo'];
  const PAUSABLE = ['countdown', 'normal', 'contest', 'lowhp', 'finale', 'spectate'];
  const ENDS = ['end-final', 'end-set', 'end-timeup', 'end-draw'];
  // message priority: finale > own KO > capture change > low HP > other KO > dry > 15 s left
  const MPRIO = { start: 9, finale: 8, self: 7, capture: 6, lowhp: 5, ko: 4, dry: 3, left15: 2, tip: 1 };
  const WOB = [0, 0.09, -0.07, 0.13, -0.11, 0.04, -0.14, 0.08];   // YOU's shot spread pattern (rad)
  const AO_SPLASH = [45, 200, 380];                          // アオ fires; the f45 volley lands on カイ at f60
  // Countdown frames (both paths). The iris opens over f0-23 (reduced motion: a 16f fade-in) and the window over
  // f24-29. CD_COUNT: the 3 appears, then one number every 60f, each with a beep (CD_BEEPS). CD_GO: GO!, the timer
  // starts (live: game.start()). CD_MSG: the countdown window is gone and the start message opens (mock: the
  // scripted match starts, BLUE captures). CD_END: the GO! banner and the overlay are gone.
  const CD_COUNT = 30, CD_GO = 210, CD_MSG = 216, CD_END = 255;
  const CD_BEEPS = [CD_COUNT, CD_COUNT + 60, CD_COUNT + 120];   // 3, 2, 1
  // hit stop lengths in frames (see hitStop): a hit YOU lands or takes, YOU's long-barrel shot, a KO
  const STOP_HIT = 2, STOP_LONG = 3, STOP_KO = 4;
  const CAM_MAX = { x: 144, y: 81 };                         // camera limits: the 400x240 map minus the 256x159 field view

  const Z = () => ({ x: GS.ZONE.x * SC, y: GS.ZONE.y * SC, r: R(GS.ZONE.r * SC) });
  const pidx = dir => GS.poolByDir(STAGE, dir);
  const MSG = () => GS.MOCK.play.messages;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // =====================================================================
  // simulation
  // =====================================================================
  function baseActors() {
    const N = GS.MOCK.play.normal, st = GS.stage(STAGE), sd = GS.PUMP_LAYOUT.stand;
    return N.actors.map(a => {
      const o = {
        id: a.id, name8: a.name8, team: a.team, self: !!a.self, x: a.x * SC, y: a.y * SC,
        hp: a.hp, water: a.water, weapon: a.weapon, pose: a.pose, faceLeft: !!a.faceLeft,
        alive: a.alive !== false, act: a.act, dir: a.faceLeft ? 8 : 0, ang: a.faceLeft ? Math.PI : 0,
        flashT: 0, lastFlash: -99, hpBarT: 0, charge: 0, locked: false, aimA: null, recoil: 0,
        ko: -1, moving: false, gcool: 0, gcoolTotal: 0, vulnerable: false, gold: false,
      };
      if (a.act === 'pump') { const tp = st.taps[a.pump || 0]; o.pumpIdx = a.pump || 0; o.x = tp.x * SC + sd[0]; o.y = tp.y * SC + sd[1]; }
      o.hx = o.x; o.hy = o.y;
      return o;
    });
  }

  function makeSim(kind) {
    const N = GS.MOCK.play.normal, M = GS.MOCK.play, st = GS.stage(STAGE);
    const s = {
      kind, f: -1, actors: baseActors(), bullets: [], parts: [], beams: [], ev: [],
      cam: { x: N.camera.x, y: N.camera.y }, zone: N.zone, x2: N.attackX2, capturing: 'blue',
      // start: frame the 480f script loop starts; running: false (end-*) stops the script and the scene clock
      time0: N.time, cap0: { blue: N.capture.blue, orange: N.capture.orange }, start: 0, running: true,
      pools: st.pools.map(() => null), pumps: st.taps.map(() => null), msg: { q: [], cur: null },
      weapon: 0, hudId: 0, label: null, follow: null, timeFix: null, capFix: null, noDry: false,
      cool: { normal: 0, splash: 0, long: LONG_WAIT0 }, coolTotal: { normal: 12, splash: 48, long: 900 },
      glint: { normal: 0, splash: 0, long: 0 }, lastWait: { normal: 0, splash: 0, long: 0 }, gcool: 0, gcoolTotal: 0,
      hpShown: 0, userAim: null, shotN: 0, wedge: null, dryF: -1, koQueue: [], dim: false, lockId: -1, lockF: 0,
      stop: 0,                                   // hit stop: frames the runtime holds the sim still (see hitStop)
    };
    N.pools.forEach(p => { s.pools[pidx(p.dir)] = { level: p.level, water: p.water, capacity: p.capacity, level0: p.level, water0: p.water }; });
    N.pumps.forEach(p => { s.pumps[pidx(p.dir)] = { level: p.level, water: p.water, operating: false, footOn: false }; });
    const A = s.actors, you = A[0];
    switch (kind) {
      case 'countdown':
        s.start = CD_MSG; s.time0 = 90; s.cap0 = { blue: 0, orange: 0 }; s.zone = 'neutral'; s.x2 = null; s.capturing = null; s.noDry = true;
        A.forEach(a => { a.hp = 100; a.water = 50; a.alive = true; if (a.pose === 'down') a.pose = 'field'; });
        A[2].pose = 'field'; A[2].preMatch = true;
        s.pools.forEach((p, i) => { const c = st.pools[i]; p.water = p.water0 = c.initial; p.level = p.level0 = GS.poolLevel(c.initial, c.capacity); });
        s.pumps.forEach(p => { p.level = 4; p.water = 100; });
        s.cool.long = 0;
        break;
      case 'contest': {
        const kai = A[3]; kai.x = kai.hx = 650 * SC; kai.y = kai.hy = 372 * SC; kai.still = true;
        s.zone = 'contest'; s.x2 = null; s.capturing = null;
        break;
      }
      case 'lowhp':
        you.x = you.hx = 560 * SC; you.y = you.hy = 380 * SC; you.hp = M.lowhp.self.hp;
        s.hitIntro = true;
        break;
      case 'finale': {
        const F_ = M.finale;
        s.time0 = F_.time; s.noDry = true;
        s.pools.forEach(p => { p.level = p.level0 = 0; p.water = p.water0 = 0; });
        s.pumps.forEach(p => { p.level = 0; p.water = 0; });
        A.forEach(a => { if (F_.waters[a.id] != null) a.water = F_.waters[a.id]; });
        A[2].pose = 'field'; A[2].act = null;
        A[3].approach = { x: 640 * SC, y: 345 * SC };
        A[5].approach = { x: 760 * SC, y: 330 * SC }; A[5].act = 'fire-weak';
        break;
      }
      case 'spectate':
        s.koQueue.push({ f: 0, id: 0 });
        s.hudId = M.spectate.follow; s.follow = M.spectate.follow; s.label = M.spectate.label;
        break;
    }
    s.hpShown = A[s.hudId].hp;
    if (s.hitIntro) s.hpShown = 14;              // lowhp opens with a hit: 14 -> 6 (weak shot x2 in the zone)
    poseAll(s);
    return s;
  }

  // end-* field: the normal scene frozen with the final numbers
  function makeEndSim(kind) {
    const s = makeSim('normal');
    s.kind = kind; s.running = false;           // no script: the pumps stay idle, the clock holds
    const A = s.actors;
    const down = a => { a.alive = false; a.pose = 'down'; a.charge = 0; };
    // ミオ fell next to her pump; レン and ナギ are down
    down(A[2]); A[2].act = null; down(A[4]); A[5].act = null;
    const kai = A[3];
    if (kind === 'end-set') { s.timeFix = 28; s.capFix = { blue: 30.0, orange: 11.2 }; down(A[5]); }
    if (kind === 'end-final') { s.timeFix = 35; s.capFix = { blue: 22.6, orange: 11.2 }; down(A[5]); s.koQueue.push({ f: 0, id: 3 }); kai.alive = true; }
    if (kind === 'end-timeup' || kind === 'end-draw') {
      kai.x = kai.hx = 650 * SC; kai.y = kai.hy = 372 * SC;
      s.zone = 'contest'; s.x2 = null; s.capturing = null; s.timeFix = 0;
      s.capFix = kind === 'end-timeup' ? { blue: 18.6, orange: 25.0 } : { blue: 17.5, orange: 17.5 };
      A[5].water = 0;
    }
    if (kind === 'end-timeup') s.dim = true;     // BLUE lost: bg sinks while the banner holds
    poseAll(s);
    return s;
  }

  function preroll(kind, frames) {
    const s = ENDS.indexOf(kind) >= 0 ? makeEndSim(kind) : makeSim(kind);
    for (let i = 0; i <= frames; i++) advance(s);
    return s;
  }

  const hudActor = s => s.actors[s.hudId];
  function loopF(s, f) { return s.running && f >= s.start ? (f - s.start) % LOOP : -1; }
  function timeAt(s, f) {
    if (s.real) return s.remaining;             // live view (see LIVE below): the Game's remaining seconds
    if (s.timeFix != null) return s.timeFix;
    if (s.kind === 'countdown') return f < CD_GO ? 90 : Math.max(0.01, 90 - (f - CD_GO) / 60);
    const lf = Math.max(0, loopF(s, f));
    return s.time0 - lf / 60;
  }
  function capAt(s, f, team) {
    if (s.real) return s.scores[team === 'blue' ? 0 : 1];
    if (s.capFix) return s.capFix[team];
    if (s.kind === 'countdown') return team === 'blue' && f >= CD_MSG ? Math.min(29.9, (f - CD_MSG) / 60) : 0;
    const lf = Math.max(0, loopF(s, f));
    return s.cap0[team] + (s.capturing === team ? lf / 60 : 0);
  }
  const shownTime = s => Math.max(0, Math.ceil(timeAt(s, Math.max(0, s.f)) - 1e-9));

  function pushMsg(s, kind, text, tone, extra) {
    const q = s.msg.q, m = Object.assign({ kind, text, tone: tone || 'std', dur: 90, prio: MPRIO[kind] || 0 }, extra || {});
    const i = q.findIndex(x => x.kind === kind); if (i >= 0) q.splice(i, 1);
    q.push(m);
    q.sort((a, b) => b.prio - a.prio);
    while (q.length > 3) q.pop();
  }
  function msgStep(s) {
    const M = s.msg;
    if (M.cur) { M.cur.t++; if (M.cur.t >= M.cur.dur + 12) M.cur = null; }
    if (!M.cur && M.q.length) {
      M.cur = Object.assign(M.q.shift(), { t: 0 });
      s.ev.push({ say: M.cur.text, tone: M.cur.tone });
      s.ev.push({ sfx: 'msg' });
      if (M.cur.sfx) s.ev.push({ sfx: M.cur.sfx });
    }
  }

  function aimPoint(s) {
    if (s.userAim) return s.userAim;
    const kai = s.actors[3];
    if (kai.alive) return { x: kai.x, y: kai.y };
    return { x: s.actors[0].x + 40, y: s.actors[0].y };
  }
  // touch aim assist: the visible enemy nearest to the aim point, within 48px
  function assistTarget(s) {
    if (s.real) return s.assistId >= 0 ? s.actors[s.assistId] : null;   // live: aim.mjs AimAssist's target
    const p = aimPoint(s); let best = null, bd = 48;
    for (const a of s.actors) {
      if (!a.alive || a.team === 'blue') continue;
      const [sx, sy] = scr(s, a.x, a.y); if (!onScreen(sx, sy)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function muzzle(a, ang) {
    const Lo = GS.ACTOR_LAYOUT, r = Lo.gunR + 3;
    return { x: a.x + Math.cos(ang) * r, y: a.y + Lo.gunDy + Math.sin(ang) * r };
  }
  function panOf(s, x) { return clamp((x - s.cam.x - 128) / 128, -1, 1); }
  function shoot(s, a, ang, type, opts) {
    opts = opts || {};
    const m = muzzle(a, ang), n = type === 'splash' ? 5 : 1, life = Math.ceil(RANGE[type] / BV);
    const gold = type !== 'weak' && s.x2 === a.team;
    for (let i = 0; i < n; i++) {
      const aa = n > 1 ? ang + (i / (n - 1) - 0.5) * 0.56 : ang;
      s.bullets.push({ x: m.x, y: m.y, vx: Math.cos(aa) * BV, vy: Math.sin(aa) * BV, life, type, team: a.team, gold, owner: a.id });
    }
    if (opts.sound) s.ev.push({ sfx: type === 'normal' ? 'shotN' : type === 'splash' ? 'shotS' : 'shotW', pan: panOf(s, a.x) });
  }
  // hit stop (STOP_HIT / STOP_LONG / STOP_KO): the runtime (updateMockField / updateRealPlay) skips the frame step
  // while s.stop > 0, so the whole scene (timer, blinks, messages) holds on the hit frame. Omitted with reduced motion.
  function hitStop(s, n) { if (!GS.state.reduced) s.stop = Math.max(s.stop, n); }
  // KO burst, shared by both paths (s = sim or live view): a.ko = now (drawActors blinks the actor out from there),
  // 8 splashes, SPLASH OUT! and the KO sound
  function koBurst(s, a) {
    a.ko = s.f;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      s.parts.push({ type: 'splash', x: a.x, y: a.y, vx: Math.cos(an) * 0.5, vy: Math.sin(an) * 0.5, t0: s.f, dur: 24 });
    }
    s.parts.push({ type: 'out', x: a.x, y: a.y - 12, t0: s.f, dur: 32 });
    s.ev.push({ sfx: 'ko', pan: panOf(s, a.x) });
  }
  // a hit on t at (x, y), both paths: white flash 2f (not again within 12f), the HP bar for 40f and a spark
  function markHit(s, t, x, y) {
    if (s.f - t.lastFlash >= 12) { t.flashT = 2; t.lastFlash = s.f; }
    t.hpBarT = 40;
    s.parts.push({ type: 'spark', x, y, t0: s.f, dur: 8 });
  }
  function koActor(s, a) {
    a.alive = false; a.charge = 0; a.locked = false;
    hitStop(s, STOP_KO);
    koBurst(s, a);
  }
  function hit(s, b, t) {
    markHit(s, t, b.x, b.y);
    if (b.owner === 0 || t.id === 0) hitStop(s, STOP_HIT);   // hits YOU lands or takes; CPU-vs-CPU hits do not stop the game
    if (b.owner === 0) {
      let dmg = b.type === 'weak' ? 4 : 6;
      if (b.gold) dmg *= 2;
      if (t.vulnerable) dmg *= 2;
      s.parts.push({ type: 'num', x: t.x, y: t.y - 10, t0: s.f, dur: 24, text: String(dmg), gold: b.gold });
      s.ev.push({ sfx: 'hit', pan: panOf(s, t.x) });
    }
  }

  function loopReset(s) {
    s.pools.forEach(p => { p.level = p.level0; p.water = p.water0; });
    s.dryF = -1;
    if (s.kind !== 'countdown') s.cool.long = LONG_WAIT0;
  }

  function fireYou(s) {
    const you = s.actors[0], w = WEAP[s.weapon];
    if (!you.alive || you.pose !== 'field') return;
    if (Math.max(s.gcool, s.cool[w]) > 0) return;
    const p = aimPoint(s), base = Math.atan2(p.y - you.y - GS.ACTOR_LAYOUT.gunDy, p.x - you.x);
    const ang = base + WOB[s.shotN % 8] * (s.userAim ? 0.5 : 1);
    if (you.water >= COST[w]) {
      if (w !== 'normal') return;                 // the mock only auto-fires the normal gun
      shoot(s, you, ang, 'normal', { sound: true }); s.gcool = s.gcoolTotal = 12; s.cool.normal = 12;
    } else {
      shoot(s, you, ang, 'weak', { sound: true }); s.gcool = s.gcoolTotal = 36;
    }
    s.shotN++;
  }

  function script(s, lf) {
    const A = s.actors, you = A[0], ao = A[1], mio = A[2], kai = A[3], nagi = A[5], M = MSG(), k = s.kind;
    if (lf === 0) loopReset(s);
    // ---- messages
    if (k === 'demo') { if (lf % 120 === 0) pushMsg(s, 'tip', GS.MOCK.play.demo.tips[(lf / 120) % 4], 'std'); }
    else if (lf === 0) {
      if (k === 'normal') pushMsg(s, 'capture', M.blueCapture, 'blue', { sfx: 'capture' });
      if (k === 'contest') pushMsg(s, 'capture', M.contest, 'std');
      if (k === 'lowhp') pushMsg(s, 'lowhp', M.hp6, 'danger');
      // the seconds are the real remaining time (game.mjs: min(15, remaining)), so TIME 12 says のこり12秒
      if (k === 'finale') pushMsg(s, 'finale', M.finale.replace(/\d+秒/, Math.ceil(timeAt(s, s.f) - 1e-9) + '秒'), 'danger', { dur: 180, sfx: 'buzz' });
      if (k === 'spectate') pushMsg(s, 'self', M.selfDown, 'danger');
      if (k === 'countdown' && s.f === s.start) { pushMsg(s, 'start', M.start, 'std'); pushMsg(s, 'capture', M.blueCapture, 'blue', { sfx: 'capture' }); }
    }
    if (k === 'finale' && lf === 12) s.ev.push({ sfx: 'buzz' });
    if (!s.noDry && lf === 300) {
      const i = pidx('北'); s.pools[i].level = 0; s.pools[i].water = 0; s.dryF = s.f;
      if (k !== 'demo') pushMsg(s, 'dry', M.dry, 'std', { sfx: 'dry' });
    }
    if (s.capturing === 'blue' && k !== 'demo' && capAt(s, s.f - 1, 'blue') < 25 && capAt(s, s.f, 'blue') >= 25) pushMsg(s, 'capture', M.blue25, 'blue');
    if (k === 'lowhp' && lf % 51 === 0) s.ev.push({ sfx: 'heart' });
    if (k === 'finale') {
      const t0 = Math.ceil(timeAt(s, s.f - 1) - 1e-9), t1 = Math.ceil(timeAt(s, s.f) - 1e-9);
      if (t1 !== t0 && t1 <= 10) s.ev.push({ sfx: 'tick10' });
    }
    // ---- YOU
    if (k !== 'spectate') fireYou(s);
    // ---- アオ: splash on カイ (weak shots when the tank is short)
    if (ao.alive && kai.alive) {
      const ang = Math.atan2(kai.y - ao.y - GS.ACTOR_LAYOUT.gunDy, kai.x - ao.x);
      if (ao.water >= COST.splash) { if (AO_SPLASH.indexOf(lf) >= 0) { shoot(s, ao, ang, 'splash', { sound: true }); ao.gcool = ao.gcoolTotal = 48; } }
      else if (lf % 36 === 18) { shoot(s, ao, ang, 'weak'); ao.gcool = ao.gcoolTotal = 36; }
    }
    // ---- ミオ: pumping the west pump
    if (mio.alive && mio.act === 'pump' && !mio.preMatch) {
      mio.pose = 'pump';
      const pm = s.pumps[mio.pumpIdx]; pm.operating = pm.level > 0; pm.footOn = pm.level > 0;
    }
    // ---- カイ: advancing on the zone, weak shots at アオ
    if (kai.alive) {
      if (kai.approach) { const p = lf / LOOP; kai.x = kai.hx + (kai.approach.x - kai.hx) * p; kai.y = kai.hy + (kai.approach.y - kai.hy) * p; kai.moving = true; }
      else if (!kai.still) { const p = lf < 240 ? lf / 240 : (480 - lf) / 240; kai.x = kai.hx - 12 * p; kai.moving = true; }
      if (lf % 36 === 10 && ao.alive) {
        const ang = Math.atan2(ao.y - kai.y - GS.ACTOR_LAYOUT.gunDy, ao.x - kai.x);
        shoot(s, kai, ang, kai.water >= COST.normal ? 'normal' : 'weak'); kai.gcool = kai.gcoolTotal = 36;
      }
    }
    // ---- ナギ: off screen, long-barrel charge f120-167 (locked from f156), shot at f168
    if (nagi.alive) {
      if (nagi.approach) {
        const p = lf / LOOP; nagi.x = nagi.hx + (nagi.approach.x - nagi.hx) * p; nagi.y = nagi.hy + (nagi.approach.y - nagi.hy) * p; nagi.moving = true;
        if (lf % 36 === 28 && ao.alive && Math.hypot(ao.x - nagi.x, ao.y - nagi.y) < RANGE.weak) shoot(s, nagi, Math.atan2(ao.y - nagi.y, ao.x - nagi.x), 'weak');
      } else if (nagi.water >= COST.long) {
        if (lf >= 120 && lf <= 167) {
          nagi.charge = 1 + Math.min(3, F((lf - 120) / 12));
          if (lf < 156 || nagi.aimA == null) nagi.aimA = Math.atan2(ao.y - 9 - nagi.y, ao.x - nagi.x);
          nagi.locked = lf >= 156;
        } else if (lf === 168) {
          const m = muzzle(nagi, nagi.aimA);
          s.beams.push({ x0: m.x, y0: m.y, x1: m.x + Math.cos(nagi.aimA) * RANGE.long, y1: m.y + Math.sin(nagi.aimA) * RANGE.long, t0: s.f, dur: 14 });
          s.ev.push({ sfx: 'shotL', pan: 1 }); s.ev.push({ shake: [2, 4] });
          nagi.charge = 0; nagi.locked = false; nagi.recoil = 300; nagi.aimA = null;
        } else { nagi.charge = 0; nagi.locked = false; if (lf < 120) nagi.aimA = null; }
      }
    }
  }

  function poseAll(s) {
    const A = s.actors, z = Z(), kai = A[3], ao = A[1];
    A.forEach(a => {
      a.gold = s.x2 === a.team;
      if (!a.alive) return;
      let tx = null, ty = null;
      if (a.id === 0) { const p = aimPoint(s); tx = p.x; ty = p.y; }
      else if (a.id === 1 && kai.alive) { tx = kai.x; ty = kai.y; }
      else if (a.team === 'orange' && ao.alive) { tx = ao.x; ty = ao.y; }
      if (a.charge > 0 && a.aimA != null) a.ang = a.aimA;
      else if (tx != null) a.ang = Math.atan2(ty - a.y - GS.ACTOR_LAYOUT.gunDy, tx - a.x);
      if (a.pose === 'pump') { a.faceLeft = true; a.ang = Math.PI; }
      else a.faceLeft = Math.cos(a.ang) < -0.05;
      a.dir = GS.dir16(Math.cos(a.ang), Math.sin(a.ang));
      a.vulnerable = a.pose === 'pump' || Math.hypot(a.x - z.x, a.y - z.y) < z.r;
      a.slow = inPool(s, a);
    });
  }
  // standing in a puddle with water (ellipse of the current size, world coords)
  function inPool(s, a) {
    const st = GS.stage(STAGE), wx = a.x / SC, wy = a.y / SC;
    return st.pools.some((p, i) => {
      const lv = s.pools[i].level; if (lv <= 0) return false;
      const k = Math.sqrt(lv / 5), c = Math.cos(-p.angle), sn = Math.sin(-p.angle);
      const dx = wx - p.x, dy = wy - p.y, u = dx * c - dy * sn, v = dx * sn + dy * c;
      return (u * u) / (p.rx * k * p.rx * k) + (v * v) / (p.ry * k * p.ry * k) < 1;
    });
  }

  // Camera (both paths): the target centres the field view on the point `lead` px ahead of the followed actor along
  // its aim; easing holds within 8px, else moves 1/8 of the way, at most 6px per frame, inside 0..CAM_MAX.
  function camTarget(a, lead) { return [a.x + Math.cos(a.ang) * lead - 128, a.y + Math.sin(a.ang) * lead - 79]; }
  function easeCam(cam, tx, ty) {
    const mv = (cur, tgt) => { const d = tgt - cur; if (Math.abs(d) <= 8) return cur; return cur + clamp(R(d / 8), -6, 6); };
    cam.x = clamp(mv(cam.x, tx), 0, CAM_MAX.x); cam.y = clamp(mv(cam.y, ty), 0, CAM_MAX.y);
  }
  function cameraStep(s) {
    if (s.follow == null) return;
    const [tx, ty] = camTarget(s.actors[s.follow], 22);
    easeCam(s.cam, tx, ty);
  }

  // Both paths: the countdown window's three lines, and its sounds and screen-reader lines at frame f: a beep with
  // each number (the first one read with the window text), then GO (no subtitle: all of it is on screen).
  function countdownLines(s) { return s.real ? realCountdownLines(s) : GS.MOCK.play.countdown.lines; }
  function countdownCues(s, f) {
    const n = CD_BEEPS.indexOf(f);
    if (n >= 0) {
      s.ev.push({ sfx: 'count' });
      s.ev.push({ say: n === 0 ? countdownLines(s).join(' ') + ' 3' : String(3 - n), sub: false });
    }
    if (f === CD_GO) s.ev.push({ sfx: 'go' }, { say: 'GO!', sub: false });
  }
  // Both paths: weapon-icon glint, 4f white when a wait longer than 0.25 s ends (YOU's HUD only)
  function glintStep(s) {
    if (s.hudId === 0) WEAP.forEach(w => {
      const wait = waitOf(s, w);
      if (s.lastWait[w] > 0 && wait === 0 && totalOf(s, w) > 15) s.glint[w] = 4; else if (s.glint[w] > 0) s.glint[w]--;
      s.lastWait[w] = wait;
    });
  }

  function advance(s) {
    s.f++; s.ev = [];
    const f = s.f, A = s.actors;
    A.forEach(a => { if (a.flashT > 0) a.flashT--; if (a.hpBarT > 0) a.hpBarT--; if (a.gcool > 0) a.gcool--; if (a.recoil > 0) a.recoil--; });
    for (const w of WEAP) if (s.cool[w] > 0) s.cool[w]--;
    if (s.gcool > 0) s.gcool--;
    const ha = hudActor(s);
    if (s.hpShown > ha.hp) s.hpShown = Math.max(ha.hp, s.hpShown - 0.75);
    for (let i = s.koQueue.length - 1; i >= 0; i--) if (s.koQueue[i].f === f) { koActor(s, A[s.koQueue[i].id]); s.koQueue.splice(i, 1); }
    if (s.hitIntro && f === 0) {
      const you = A[0]; you.flashT = 2; you.lastFlash = 0;
      s.wedge = { t0: 0, side: 'right', y: you.y };
      s.ev.push({ shake: [2, 4] }); s.ev.push({ sfx: 'hit' });
      hitStop(s, STOP_HIT);
    }
    if (s.kind === 'countdown') {
      countdownCues(s, f);
      if (f === CD_MSG) { s.zone = 'blue'; s.x2 = 'blue'; s.capturing = 'blue'; A[2].preMatch = false; }
    }
    const lf = loopF(s, f);
    if (lf >= 0) script(s, lf);
    // shots
    for (const b of s.bullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      for (const t of A) {
        if (!t.alive || t.team === b.team) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < 6) { hit(s, b, t); b.dead = true; break; }
      }
      if (!b.dead && b.life <= 0) { b.dead = true; s.parts.push({ type: 'drip', x: b.x, y: b.y, t0: f, dur: 8 }); }
    }
    s.bullets = s.bullets.filter(b => !b.dead);
    s.parts = s.parts.filter(p => f - p.t0 < p.dur);
    s.beams = s.beams.filter(b => f - b.t0 < b.dur);
    if (s.wedge && f - s.wedge.t0 >= 30) s.wedge = null;
    glintStep(s);
    msgStep(s);
    poseAll(s);
    cameraStep(s);
    const tg = assistTarget(s), tid = tg ? tg.id : -1;
    if (tid !== s.lockId) { s.lockId = tid; s.lockF = f; }
  }

  // Water / range as the HUD judges them. Live (s.real): the game.mjs rules themselves (hasWeaponWater is
  // water >= cost - 1e-8, so a refill that ends at 4.999999999999981 still fires the normal gun; WEAPONS cost /
  // range, CONFIG.weakRange). The mock keeps its hand-copied numbers (the same values).
  const ruleWeapon = w => GS.app.rules.WEAPONS.find(x => x.id === w) || GS.app.rules.WEAPONS[0];
  function costOf(s, w) { return s.real ? ruleWeapon(w).cost : COST[w]; }
  function shortOf(s, a, w) { return s.real ? !GS.app.rules.hasWeaponWater({ water: a.water, weapon: w }) : a.water < COST[w]; }
  function rangeOf(s, w, weak) {
    if (!s.real) return weak ? RANGE.weak : RANGE[w];
    return (weak ? GS.app.rules.CONFIG.weakRange : ruleWeapon(w).range) * SC;
  }

  // waits (frames) as seen on the HUD
  function waitOf(s, w) {
    if (s.real) { const a = hudActor(s); return w === a.weapon ? Math.max(a.gcool, a.cool[w]) : a.cool[w]; }
    if (s.hudId !== 0) { const a = hudActor(s); return w === a.weapon ? a.gcool : 0; }
    return w === WEAP[s.weapon] ? Math.max(s.gcool, s.cool[w]) : s.cool[w];
  }
  function totalOf(s, w) {
    if (s.real) { const a = hudActor(s); return (w === a.weapon && a.gcool > a.cool[w] ? a.gcoolTotal : a.coolT[w]) || 1; }
    if (s.hudId !== 0) return hudActor(s).gcoolTotal || 1;
    if (w === WEAP[s.weapon] && s.gcool > s.cool[w]) return s.gcoolTotal || 1;
    return s.coolTotal[w];
  }
  function hudWeapon(s) { return s.hudId === 0 ? WEAP[s.weapon] : hudActor(s).weapon; }

  // =====================================================================
  // drawing: field
  // =====================================================================
  function scr(s, x, y) { return [R(x - s.cam.x), R(y - s.cam.y + FY0)]; }
  function onScreen(sx, sy) { return sx >= 0 && sx < 256 && sy >= FY0 && sy <= FY1; }

  function drawActors(c, s, f, o) {
    const list = s.actors.slice().sort((a, b) => ((a.alive || a.ko >= 0 ? 1 : 0) - (b.alive || b.ko >= 0 ? 1 : 0)) || a.y - b.y);
    for (const a of list) {
      let [sx, sy] = scr(s, a.x, a.y);
      if (sx < -16 || sx > 272 || sy < FY0 - 16 || sy > FY1 + 16) continue;
      let pose = a.alive ? a.pose : 'down', flash = a.flashT > 0, visible = true;
      if (a.ko >= 0) {
        const k = f - a.ko;
        // the KO frame holds for the KO hit stop (STOP_KO; live: YOU's KOs only), then the 2f hit flash, two 10f/10f
        // blinks and the down pose
        if (k < 2) { pose = 'field'; flash = true; }
        else if (k < 42) { pose = 'field'; visible = GS.blink(k - 2, 10, 10); }
        else pose = 'down';
      }
      if (!visible) continue;
      if (a.alive && a.moving && (F(f / 8) & 1)) sy -= 1;
      const standing = a.alive || pose !== 'down';
      const hp = a.self ? (a.alive && a.hp <= 30 ? a.hp / 100 : null) : (a.hpBarT > 0 && a.alive ? a.hp / 100 : null);
      GS.actor(c, sx, sy, {
        team: a.team, pose, faceLeft: a.faceLeft, aimDir16: a.dir, tank: GS.tankLevel(a.water), gold: a.gold && standing,
        flash, corners: a.alive && a.vulnerable, hpBar: hp, recoil: a.recoil > 0 ? a.recoil / 60 : 0,
        self: a.self && a.alive && !o.noMarker, charge: a.charge, frame: F(f / 8), lockGold: a.gold, slow: a.alive && a.slow,
      });
      if (a.flinch > 0 && a.alive) GS.circle(c, sx, sy, 10, 'orangeHi');   // flinch ring (live view only)
      if (o.youTag && a.self) {                 // below the feet: the countdown window covers the head
        GS.rect(c, sx - 13, sy + 10, 26, 10, 'ink');
        GS.text8(c, 'YOU', sx, sy + 11, { set: 'H7', align: 'center' });
      }
    }
  }

  function drawShots(c, s, f) {
    for (const b of s.bullets) {
      const [x, y] = scr(s, b.x, b.y);
      if (b.type === 'weak') GS.spr(c, 'bullet_weak', x - 2, y - 2, { pal: b.team });
      else if (b.gold) GS.spr(c, 'bullet_gold', x - 3, y - 3, { pal: 'gold' });
      else GS.spr(c, 'bullet_n', x - 3, y - 3, { pal: b.team });
    }
    // long-barrel water stream: 2px white, fades through half after 7f
    for (const bm of s.beams) {
      const k = f - bm.t0, [x0, y0] = scr(s, bm.x0, bm.y0), [x1, y1] = scr(s, bm.x1, bm.y1);
      const a0 = c.globalAlpha; if (k >= 7) c.globalAlpha = 0.5;
      GS.line(c, x0, y0, x1, y1, 'white', { w: 2 });
      c.globalAlpha = a0;
    }
    // locked long-barrel warning line (team colour and white, a dot every 2px)
    for (const a of s.actors) {
      if (!a.alive || !a.locked || a.aimA == null) continue;
      const m = muzzle(a, a.aimA), [x0, y0] = scr(s, m.x, m.y);
      let x1 = x0 + Math.cos(a.aimA) * RANGE.long, y1 = y0 + Math.sin(a.aimA) * RANGE.long;
      if (s.real && a.rayX != null) [x1, y1] = scr(s, a.rayX, a.rayY);   // live: the real ray stops at walls
      GS.line(c, x0, y0, x1, y1, a.team, { dash: [1, 3] });
      GS.line(c, x0, y0, x1, y1, 'white', { dash: [1, 3], dashOffset: 2 });
    }
  }

  function drawParts(c, s, f) {
    for (const p of s.parts) {
      const k = f - p.t0;
      if (p.type === 'drip') { const [x, y] = scr(s, p.x, p.y); GS.spr(c, 'splash_' + Math.min(4, 1 + F(k / 2)), x - 4, y - 4, { pal: 'water' }); }
      else if (p.type === 'spark') { const [x, y] = scr(s, p.x, p.y); GS.spr(c, 'spark', x - 4, y - 4, { pal: 'white' }); }
      else if (p.type === 'splash') { const [x, y] = scr(s, p.x + p.vx * k * 2, p.y + p.vy * k * 2); GS.spr(c, 'splash_' + Math.min(4, 1 + F(k / 6)), x - 4, y - 4, { pal: 'water' }); }
      else if (p.type === 'num') { const [x, y] = scr(s, p.x, p.y - k * 0.5); GS.text8(c, p.text, x, y - 4, { set: p.gold ? 'H3' : 'H0', align: 'center' }); }
      else if (p.type === 'out') { const [x, y] = scr(s, p.x, p.y - k * 0.5); GS.text8(c, 'SPLASH OUT!', clamp(x, 52, 204), y - 4, { set: 'H5', align: 'center' }); }
    }
  }

  // The range guide: a dot every 8px from the gun along the aim out to the weapon's range (16 dots at most), and for
  // the splash gun (not its weak shot) the spread as 5 dots at 40px.
  function rangeGuide(c, s, you, ang, w, weak, col) {
    const [ox, oy] = scr(s, you.x, you.y + GS.ACTOR_LAYOUT.gunDy), ux = Math.cos(ang), uy = Math.sin(ang), range = rangeOf(s, w, weak);
    for (let i = 1; i <= 16 && i * 8 <= range; i++) GS.px(c, ox + ux * i * 8, oy + uy * i * 8, col);
    if (!weak && w === 'splash') {
      for (let i = 0; i < 5; i++) { const aa = ang + (i / 4 - 0.5) * 0.56; GS.px(c, ox + Math.cos(aa) * 40, oy + Math.sin(aa) * 40, col); }
    }
  }
  function drawAim(c, s, f, mode) {
    const you = s.actors[0];
    if (!you.alive || !mode) return;
    const w = WEAP[s.weapon], weak = shortOf(s, you, w);
    const p = aimPoint(s), [ax, ay] = scr(s, p.x, p.y);
    if (mode === 'mouse') {                     // PC: the guide toward the cursor, the crosshair on it (red when short)
      const [ox, oy] = scr(s, you.x, you.y + GS.ACTOR_LAYOUT.gunDy);
      rangeGuide(c, s, you, Math.atan2(ay - oy, ax - ox), w, weak, 'white');
      GS.spr(c, 'crosshair', ax - 4, ay - 4, { pal: weak ? 'danger' : 'white' });
    } else if (mode === 'assist') {
      // touch: the same guide along the way YOU faces (the aim the game uses), in red when the tank is short (there
      // is no crosshair to turn red); none at a pump, where YOU cannot shoot. Then the aim-assist target mark,
      // shrinking over 10f (2 frames).
      if (you.pose !== 'pump') rangeGuide(c, s, you, you.ang, w, weak, weak ? 'danger' : 'white');
      const tg = assistTarget(s); if (!tg) return;
      const [kx, ky] = scr(s, tg.x, tg.y);
      GS.spr(c, f - s.lockF < 5 ? 'aim_lock' : 'aim_lock_1', kx - 8, ky - 8, { pal: 'white' });
    }
  }

  // edge marks inside x8-247 / y40-182 (8x8; the hit wedge is 16x16)
  function edgePos(sx, sy) {
    const ex = clamp(sx, 12, 243), ey = clamp(sy, 44, 178);
    const side = sx > 255 ? 'r' : sx < 0 ? 'l' : sy < FY0 ? 't' : 'b';
    return { ex, ey, side };
  }
  function drawEdges(c, s, f) {
    const z = Z(), [zx, zy] = scr(s, z.x, z.y);
    if (!onScreen(zx, zy)) {
      const e = edgePos(zx, zy);
      const pal = s.zone === 'blue' ? 'blueUI' : s.zone === 'orange' ? 'orangeUI' : s.zone === 'contest' ? (GS.alt(f, 20) ? 'blueUI' : 'orangeUI') : 'neutral';
      GS.spr(c, 'edge_flag', e.ex - 4, e.ey - 4, { pal });
    }
    let near = 0;
    for (const a of s.actors) {
      if (!a.alive || a.team === 'blue') continue;
      const [sx, sy] = scr(s, a.x, a.y);
      if (onScreen(sx, sy)) continue;
      const e = edgePos(sx, sy);
      if (a.charge > 0) {                       // required on every device
        if (a.locked || GS.blink(f, 16, 16)) GS.spr(c, 'edge_drop', e.ex - 4, e.ey - 4, { pal: 'danger' });
        if (a.locked) GS.circle(c, e.ex, e.ey, 6, 'danger');
        continue;
      }
      const out = Math.max(sx - 255, -sx, FY0 - sy, sy - FY1);
      if (out <= 40 && near < 3) {
        near++;
        if (e.side === 'r' || e.side === 'l') GS.spr(c, 'edge_near', e.ex - 4, e.ey - 4, { pal: 'orangeUI', flipX: e.side === 'l' });
        else GS.spr(c, 'edge_near_v', e.ex - 4, e.ey - 4, { pal: 'orangeUI', flipY: e.side === 't' });
      }
    }
    if (s.wedge && s.wedge.real) drawWedgeReal(c, s);
    else if (s.wedge) {
      const [, wy] = scr(s, 0, s.wedge.y);
      GS.spr(c, 'edge_hit_r', 232, clamp(wy - 8, 40, 167), { pal: 'danger' });
    }
  }
  // live: the hit wedge sits on the field edge in the direction the shot came from (seen from the followed actor)
  function drawWedgeReal(c, s) {
    const a = s.actors[s.follow], [sx, sy] = scr(s, a.x, a.y), dx = s.wedge.dx, dy = s.wedge.dy;
    const kx = dx > 1e-6 ? (247 - sx) / dx : dx < -1e-6 ? (8 - sx) / dx : Infinity;
    const ky = dy > 1e-6 ? (182 - sy) / dy : dy < -1e-6 ? (40 - sy) / dy : Infinity;
    if (kx <= ky) {
      const y = clamp(R(sy + dy * Math.max(0, kx)) - 8, 40, 167);
      GS.spr(c, 'edge_hit_r', dx > 0 ? 232 : 8, y, { pal: 'danger', flipX: dx < 0 });
    } else {
      const x = clamp(R(sx + dx * Math.max(0, ky)) - 8, 8, 232);
      GS.spr(c, 'edge_hit', x, dy < 0 ? 40 : 167, { pal: 'danger', flipY: dy > 0 });
    }
  }

  function drawField(L, s, o) {
    o = o || {};
    const f = Math.max(0, s.f), ox = -s.cam.x, oy = FY0 - s.cam.y, stage = s.stage || STAGE;
    L.bg1.drawImage(GS.mapCanvas(stage, SC), ox, oy);
    GS.drawZone(L.bg1, ox, oy, SC, s.zone, f);
    if (!s.real) GS.drawPumps(L.bg1, STAGE, s.pumps, ox, oy, SC, f);
    GS.drawPuddles(L.bg2, stage, s.pools.map(p => p.level), ox, oy, SC, f);
    GS.fx.wave = GS.state.reduced ? null : { y0: FY0, y1: FY1, amp: 1, period: 32, phase: F(f / 2) };
    const c = L.obj;
    // live: the pump art sits one stand-offset beside its tap and may reach a shoreline, so it goes on obj
    // (above the water, under every part and actor)
    if (s.real) drawPumpsAtTap(c, stage, s.pumps, ox, oy, f);
    drawParts(c, s, f);                         // ground splashes under the actors
    drawActors(c, s, f, o);
    drawShots(c, s, f);
    drawAim(c, s, f, o.aim);
    drawEdges(c, s, f);
  }

  // =====================================================================
  // drawing: HUD
  // =====================================================================
  // 16x8 wave-crest strip in the H6 colours (b body, e edge, l light; '.' = band)
  const WAVE = [
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbllbbbbb',
    'bbbbbbblleelbbbb',
    'lbbbblee...elbbl',
    'ellllee......lle',
    '.eeee.........e.',
    '................',
  ];
  let waveStrip = null;
  function waveCanvas(flip) {
    if (!waveStrip) {
      waveStrip = [false, true].map(fl => {
        const cv = GS.makeCanvas(256, 8), x = cv.getContext('2d'), H6 = GS.HUD.H6, cols = { b: H6[0], e: H6[1], l: H6[2] };
        for (let y = 0; y < 8; y++) for (let i = 0; i < 256; i++) {
          const ch = WAVE[fl ? 7 - y : y][i % 16]; if (ch === '.') continue;
          x.fillStyle = cols[ch]; x.fillRect(i, y, 1, 1);
        }
        return cv;
      });
    }
    return waveStrip[flip ? 1 : 0];
  }
  function ring(c, x, y, w, h, col) { GS.rect(c, x, y, w, 1, col); GS.rect(c, x, y + h - 1, w, 1, col); GS.rect(c, x, y, 1, h, col); GS.rect(c, x + w - 1, y, 1, h, col); }
  function zoneCol(s, f) { return s.zone === 'contest' ? (GS.alt(f, 20) ? 'blue' : 'orange') : s.zone === 'blue' ? 'blue' : s.zone === 'orange' ? 'orange' : 'neutral'; }

  function captureGauge(c, x, team, val, capturing, f, rtl) {
    GS.rect(c, x, 16, 80, 8, 'ink');
    GS.rect(c, x, 17, 80, 6, team + 'Dk');
    const w = clamp(R(val / 0.375), 0, 80);
    if (w > 0) {
      GS.rect(c, rtl ? x + 80 - w : x, 17, w, 6, team);
      if (capturing && w < 80) GS.rect(c, rtl ? x + 80 - w : x + w - 1, 17, 1, 6, GS.blink(f, 10, 10) ? 'white' : team);
    }
    [27, 53].forEach(d => GS.rect(c, rtl ? x + 79 - d : x + d, 17, 1, 6, 'white'));
  }

  function drawTop(c, s, f) {
    GS.rect(c, 0, 0, 256, 32, 'band');
    c.drawImage(waveCanvas(false), 0, 0);
    GS.text8(c, 'BLUE', 16, 8, { set: 'H1' });
    GS.text8(c, 'ORANGE', 192, 8, { set: 'H2' });
    const A = s.actors;
    [0, 1, 2].forEach((id, i) => { const a = A[id]; GS.spr(c, a.alive ? 'face' : 'face_x', 64 + i * 8, 8, { pal: a.alive ? 'blue' : 'gray' }); });
    [3, 4, 5].forEach((id, i) => { const a = A[id]; GS.spr(c, a.alive ? 'face' : 'face_x', 168 + i * 8, 8, { pal: a.alive ? 'orange' : 'gray' }); });
    if (s.x2 === 'blue') GS.text8(c, '×2', 88, 8, { set: 'H3' });
    if (s.x2 === 'orange') GS.text8(c, '×2', 152, 8, { set: 'H3' });
    // centre plate: ink, outer 1px ink + inner 1px zone colour
    GS.rect(c, 104, 8, 48, 24, 'ink');
    ring(c, 105, 9, 46, 22, zoneCol(s, f));
    const tm = shownTime(s);
    const set = s.kind === 'finale' || s.finale ? (GS.alt(f, 30) ? 'H4' : 'H3') : tm <= 15 ? 'H4' : 'H0';
    GS.banner(c, GS.pad(tm, 2, '0'), 112, 12, { set });
    // capture gauges and flags
    const cb = capAt(s, Math.max(0, s.f), 'blue'), co = capAt(s, Math.max(0, s.f), 'orange');
    captureGauge(c, 16, 'blue', cb, s.capturing === 'blue', f, false);
    captureGauge(c, 160, 'orange', co, s.capturing === 'orange', f, true);
    GS.spr(c, 'flag', 96, 16, { pal: 'gold' });
    GS.spr(c, 'flag', 152, 16, { pal: 'gold', flipX: true });
    GS.text8(c, fmtCap(cb), 16, 24, { set: 'H1' });
    GS.text8(c, fmtCap(co), 208, 24, { set: 'H2' });
    GS.rect(c, 0, 31, 256, 1, 'frameHi');       // last: the y24 text shadows must not break the band's edge line
  }
  function fmtCap(v) { const t = GS.fixed1(clamp(v, 0, 30)); return t.length < 4 ? '0' + t : t; }
  function fmtWait(fr) { const v = fr / 60; return v >= 10 ? String(Math.ceil(v - 1e-9)) : (Math.ceil(v * 10 - 1e-9) / 10).toFixed(1); }

  function cells(c, y, val, shown, col, trail) {
    GS.rect(c, 32, y, 70, 8, 'ink');
    for (let k = 0; k < 10; k++) {
      const x = 32 + k * 7, cur = R(clamp(val - k * 10, 0, 10) * 0.6);
      GS.rect(c, x, y + 1, 6, 6, 'dim');
      if (trail && shown > val) { const w2 = R(clamp(shown - k * 10, 0, 10) * 0.6); if (w2 > cur) GS.rect(c, x + cur, y + 1, w2 - cur, 6, 'white'); }
      if (cur > 0) GS.rect(c, x, y + 1, cur, 6, col);
    }
  }

  function weaponStatus(s) {
    const a = hudActor(s), w = hudWeapon(s);
    // seconds rounded up, with the same 1e-9 slack as the timer (live recoil 4.0000000000000036 s is RECOIL 5 otherwise)
    if (a.recoil > 0) return { text: 'RECOIL ' + Math.ceil(a.recoil / 60 - 1e-9), set: 'H2' };
    // live: pumpNear = YOU stands still within reach of a free pump, so game.mjs walks YOU onto it and holds fire
    if (a.pose === 'pump' || a.pumpNear) return { text: 'PUMP', set: 'H7' };
    if (a.charge > 0) return { text: 'CHARGE', set: 'H3', charge: a.charge };
    const wait = waitOf(s, w);
    if (wait > 15) return { text: 'WAIT ' + fmtWait(wait), set: 'H0' };
    if (shortOf(s, a, w)) return { text: 'WEAK OK', set: 'H4' };
    return { text: 'READY', set: 'H5' };
  }

  let darkPal = null;
  function drawBottom(c, s, f) {
    GS.rect(c, 0, 191, 256, 33, 'band');
    GS.rect(c, 0, 191, 256, 1, 'frameHi');
    const a = hudActor(s), w = hudWeapon(s);
    // HP
    GS.text8(c, 'HP', 16, 192, { set: 'H7' });
    const low = a.hp <= 30;
    cells(c, 192, a.hp, s.hpShown, low ? (GS.blink(f, 30, 30) ? 'danger' : 'dangerDk') : 'self', true);
    GS.text8(c, GS.pad(Math.max(0, Math.ceil(a.hp)), 3), 104, 192, { set: low ? 'H4' : 'H0' });
    if (a.alive && a.vulnerable) { GS.rect(c, 132, 192, 16, 8, 'danger'); GS.text8(c, '×2', 132, 192, { set: 'HK', style: 'plain' }); }
    // water
    GS.spr(c, 'tank_icon', 16, 200, { pal: 'blue' });
    const short = shortOf(s, a, w);
    cells(c, 200, a.water, a.water, short ? 'gray' : 'water', false);
    const tx = 32 + R(costOf(s, w) * 0.7);
    GS.rect(c, tx, 199, 1, 1, 'gold'); GS.rect(c, tx, 208, 1, 1, 'gold');
    // + the rules' 1e-8 slack: 4.999999999999981 reads 005, and the number reaches the cost exactly when !short
    GS.text8(c, GS.pad(F(a.water + 1e-8), 3), 104, 200, { set: short ? 'HL' : 'H0' });
    // weapon name + state
    if (s.label) GS.text8(c, s.label, 16, 208, { set: 'H7' });
    else {
      GS.text8(c, WEAPON_LABEL[w], 16, 208, { set: 'H0' });
      const st = weaponStatus(s);
      GS.text8(c, st.text, 72, 208, { set: st.set });
      if (st.charge) for (let i = 0; i < 4; i++) GS.rect(c, 120 + i * 6, 209, 5, 6, i < st.charge ? (st.charge >= 4 ? 'white' : 'gold') : 'dim');
    }
    // weapon icons
    if (!darkPal) darkPal = GS.makePal('blue', { 1: 'ink', 2: 'grayDk', 3: 'gray', 4: 'dim', 7: 'grayDk', 11: 'waterDk', 12: 'waterDk', 13: 'gray', 14: 'grayDk' });
    WEAP.forEach((wn, i) => {
      const x = 152 + i * 16, sel = wn === w;
      GS.rect(c, x, 192, 16, 16, sel ? 'win' : 'dim');
      GS.spr(c, 'icon_' + wn, x, 192, { pal: sel ? 'blue' : darkPal });
      const rem = waitOf(s, wn), tot = totalOf(s, wn);
      if (rem > 0 && tot > 15) GS.half(c, x, 192, 16, Math.ceil(16 * Math.min(1, rem / tot)), 'ink');
      if (s.hudId === 0 && s.glint[wn] > 0) GS.half(c, x, 192, 16, 16, 'white');
      if (a.recoil > 0) GS.half(c, x, 192, 16, 16, 'orange');
      if (sel) { ring(c, x, 192, 16, 16, 'gold'); GS.text8(c, '▲', x + 4, 208, { set: 'H3' }); }
    });
    // radar
    GS.rect(c, 203, 192, 1, 24, 'frameLo'); GS.rect(c, 244, 192, 1, 24, 'frameLo');
    GS.radar(c, 204, 192, radarSnap(s), f);
    // the wave strip last, on a fresh band row, so the y208 text shadows cannot bite into it
    GS.rect(c, 0, 216, 256, 8, 'band');
    c.drawImage(waveCanvas(true), 0, 216);
  }

  function radarSnap(s) {
    if (s.real) {
      const f = Math.max(0, s.f);
      return {
        stage: s.stage, zone: s.zone, cam: s.cam,
        pools: s.pools.map((p, i) => ({ ratio: p.water / p.capacity, dryBlink: s.dryAt[i] >= 0 ? f - s.dryAt[i] : undefined })),
        pumps: s.pumps.map(p => ({ level: p.level, operating: p.operating })),
        actors: s.actors.map(a => ({ x: a.x / SC, y: a.y / SC, team: a.team, self: a.self, alive: a.alive, charging: a.charge > 0 })),
      };
    }
    const north = pidx('北'), f = Math.max(0, s.f);
    return {
      stage: STAGE, zone: s.zone, cam: s.cam,
      pools: s.pools.map((p, i) => ({ ratio: p.level <= 0 ? 0 : p.water / p.capacity, dryBlink: i === north && s.dryF >= 0 ? f - s.dryF : undefined })),
      pumps: s.pumps.map(p => ({ level: p.level, operating: p.operating })),
      actors: s.actors.map(a => ({ x: a.x / SC, y: a.y / SC, team: a.team, self: a.self, alive: a.alive, charging: a.charge > 0 })),
    };
  }

  function drawMsg(c, s) {
    const m = s.msg.cur; if (!m) return;
    const t = m.t, d = m.dur;
    const open = t < 6 ? GS.step(t, 0, 6) : t < 6 + d ? 1 : 1 - GS.step(t, 6 + d, 6);
    if (open <= 0) return;
    GS.win(c, 8, 32, 240, 32, { fill: 'half', tone: m.tone, open });
    if (open >= 1) GS.text16(c, m.text, 128, 40, { align: 'center' });
  }

  function drawScene(L, s, o) {
    o = o || {};
    drawField(L, s, o);
    drawTop(L.hud, s, Math.max(0, s.f));
    drawBottom(L.hud, s, Math.max(0, s.f));
    if (!o.noMsg) drawMsg(L.hud, s);
  }

  // =====================================================================
  // overlays: countdown / demo / pause / end
  // =====================================================================
  function drawCountdown(L, s) {
    const f = Math.max(0, s.f), c = L.hud, red = GS.state.reduced;
    if (red) { if (f < 16) GS.fx.bright = Math.min(15, F(((f + 1) * 15) / 16)); }
    else GS.fx.iris = f < 24 ? { x: s.real ? s.iris[0] : 101, y: s.real ? s.iris[1] : 116, r: R((176 * f) / 24) } : null;
    // the window opens over f24-29 (full when the 3 appears) and closes over the 6f from GO
    if (f >= 24 && f < CD_MSG) {
      const open = f < CD_COUNT ? GS.step(f, 24, 6) : f >= CD_GO ? 1 - GS.step(f, CD_GO, 6) : 1;
      GS.win(c, 16, 48, 224, 64, { fill: 'solid', open });   // x16-239: ~9px side margin for the 200px 3rd line
      if (open >= 1) {
        const lines = countdownLines(s);
        GS.text16(c, lines[0], 128, 56, { align: 'center' });
        GS.text16(c, lines[1], 128, 72, { align: 'center' });
        GS.text16(c, lines[2], 128, 88, { align: 'center' });
      }
    }
    if (f >= CD_COUNT && f < CD_GO) {
      const n = 3 - F((f - CD_COUNT) / 60), k = (f - CD_COUNT) % 60, dy = !red && k < 4 ? -8 + k * 2 : 0;
      GS.banner(c, String(n), 112, 128 + dy, { size: 32, set: 'H0' });
    }
    if (f >= CD_GO && f < CD_END) GS.banner(c, 'GO!', 80, 128, { size: 32, set: 'H3' });
  }

  function drawDemo(L, s) {
    if (GS.blink(Math.max(0, s.f), 32, 32)) GS.banner(L.hud, 'DEMO PLAY', 80, 72, { set: 'H0' });
  }

  // mock field scenes: the aim mark (stills always show the mouse crosshair) and the YOU tag before GO
  function mockFieldOpts(s, forStill) {
    const k = s.kind;
    let aim = null;
    if (k !== 'demo' && k !== 'spectate' && !(k === 'countdown' && s.f < CD_GO)) aim = forStill || (GS.state.layout === 'pc' && !GS.state.touch) ? 'mouse' : 'assist';
    return { aim, youTag: k === 'countdown' && s.f < CD_GO };
  }
  function drawMockField(L, s, forStill) {
    drawScene(L, s, mockFieldOpts(s, forStill));
    if (s.kind === 'countdown') drawCountdown(L, s);
    if (s.kind === 'demo') drawDemo(L, s);
  }

  // ---- pause
  // cursor x16 / x128, text 8px after the 8px cursor (x32 / x144) so ▶ does not touch the label
  const PAUSE_ITEMS = [
    { id: 'cont', label: 'つづける', x: 32, y: 164, cx: 16 },
    { id: 'retry', label: 'やりなおす', x: 144, y: 164, cx: 128 },
    { id: 'stage', label: 'ステージ選択', x: 32, y: 184, cx: 16 },
    { id: 'manual', label: 'せつめいしょ', x: 144, y: 184, cx: 128 },
  ];
  function newPauseMenu() { return GS.menu({ items: PAUSE_ITEMS.map(i => Object.assign({}, i)), cols: 2, index: 0 }); }
  function fieldWater(s) { return s.pools.reduce((n, p) => n + (p.level > 0 ? p.water : 0), 0) + s.pumps.reduce((n, p) => n + p.water, 0); }
  function drawPauseWin(c, s, t, menu, open) {
    // x8 y32 w240 h184 (y32-215): on the 8px grid and covering the bottom band's y208 text row; the contents keep their own y
    GS.win(c, 8, 32, 240, 184, { fill: 'solid', open });
    if (open < 1) return;
    if (GS.blink(t, 30, 30)) GS.banner(c, 'PAUSE', 88, 44, { set: 'H0' });
    // whole map 1/10 (120x72) with a 1px frame
    const mx = 16, my = 64, f = Math.max(0, s.f);
    const stage = s.stage || STAGE;
    ring(c, mx - 1, my - 1, 122, 74, 'frameHi');
    c.save(); c.beginPath(); c.rect(mx, my, 120, 72); c.clip();
    c.drawImage(GS.mapCanvas(stage, 0.1), mx, my);
    GS.drawPuddles(c, stage, s.pools.map(p => p.level), mx, my, 0.1, f);
    GS.drawZone(c, mx, my, 0.1, s.zone, f);
    GS.drawPumps(c, stage, s.pumps, mx, my, 0.1, f);
    s.actors.forEach(a => {
      if (!a.alive) return;
      const x = R(mx + a.x * 0.3), y = R(my + a.y * 0.3);
      if (a.self) GS.circle(c, x, y, 3, 'white');
      GS.rect(c, x - 1, y - 1, 2, 2, a.team);
    });
    ring(c, R(mx + s.cam.x * 0.3), R(my + s.cam.y * 0.3), 77, 48, 'gray');
    c.restore();
    // info
    const A = s.actors, ab = A.filter(a => a.team === 'blue' && a.alive).length, ao = A.filter(a => a.team === 'orange' && a.alive).length;
    GS.text8(c, 'STAGE ' + (s.real ? s.stageNo : 1), 144, 64);
    GS.text8(c, 'TIME  ' + GS.pad(shownTime(s), 2, '0'), 144, 76);
    GS.text8(c, 'ALIVE', 144, 88);
    GS.text8(c, String(ab), 192, 88, { set: 'H1' }); GS.text8(c, '-', 200, 88); GS.text8(c, String(ao), 208, 88, { set: 'H2' });
    GS.text8(c, 'WATER', 144, 100);
    GS.text8(c, s.real ? GS.pad(s.fieldWater, 3) + '/' + s.fieldTotal : GS.pad(fieldWater(s), 3) + '/900', 144, 110, { set: 'H5' });
    GS.text8(c, WEAPON_LABEL[hudWeapon(s)], 144, 122);
    GS.text16(c, s.real ? s.stageNo + ' ' + romStageName(s.stage) : GS.MOCK.play.pause.stageLine, 16, 140);
    menu.draw(c, t);
  }

  // ---- end banners
  // out = frame the mosaicOut (32f; reduced: 16f fade) starts; the result appears out + fade + 8f black.
  // end-final: the result appears 123f after the decision (reduced 66f), so out = 123-32-8 = 83 (reduced 66-16-8 = 42).
  const OUT_FADE = () => (GS.state.reduced ? 16 : 32);
  function endTiming(kind) {
    const red = GS.state.reduced;
    if (kind === 'end-final') return red ? { slow: false, flash: false, banner: 5, out: 66 - 16 - 8 } : { slow: true, flash: false, banner: 51, out: 123 - 32 - 8 };
    const b = red ? 5 : 7;
    return { slow: false, flash: !red, banner: b, out: b + 16 + 90 };
  }
  const END_RESULT = { 'end-final': 'win-1', 'end-set': 'win-1', 'end-timeup': 'lose-1', 'end-draw': 'draw-1' };
  const END_JINGLE = { 'end-final': 'win', 'end-set': 'win', 'end-timeup': 'lose', 'end-draw': 'draw' };
  const END_TONE = { win: 'blue', lose: 'orange', draw: 'std' };
  function drawEnd(L, s, kind, t) {
    const E = s.endE || GS.MOCK.play.end[kind], T = endTiming(kind), c = L.hud;
    // hide the YOU ▼ once the banner is up: through the half band it read as a stray glyph between the words
    drawScene(L, s, { noMsg: true, noMarker: t >= T.banner });
    GS.fx.flash = T.flash && t >= 5 && t < 7 ? 1 : 0;
    if (t < T.banner) return;
    if (s.dim) { GS.fx.dim = true; GS.fx.dimTarget = 'bg'; }
    GS.half(c, 0, 88, 256, 32, 'ink');
    const k = t - T.banner, red = GS.state.reduced;
    if (E.drop) {
      // one letter every 4f, falls from y-16 in 12f (accelerating), then a 2px bounce
      Array.from(E.banner).forEach((ch, i) => {
        const kk = red ? 99 : k - i * 4; if (kk < 0) return;
        const p = (kk + 1) / 12, dy = kk < 12 ? R(-16 + 16 * p * p) : kk < 14 ? -2 : 0;
        GS.banner(c, ch, E.x + i * 16, 96 + dy, { set: E.set });
      });
    } else {
      let x = E.x;
      if (k < 12) x = R(256 + (E.x - 4 - 256) * GS.ease.out((k + 1) / 12));
      else if (k < 16) x = E.x - 4 + (k - 11);
      GS.banner(c, E.banner, x, 96, { set: E.set });
    }
    if (k >= 16) {
      GS.win(c, 24, 120, 208, 24, { fill: 'solid', open: GS.step(k, 16, 6) });
      if (k >= 22) GS.text16(c, E.sub, 128, 124, { align: 'center' });
    }
  }

  // =====================================================================
  // runtime (mock path; the real match has its own below, see LIVE)
  // =====================================================================
  const mock = { kind: null, sim: null, lock: 0, mouseAim: false, leave: -1, menu: null, pauseFrom: 'normal', closing: -1, resultAt: -1 };

  function consumeEvents(s) {
    for (const e of s.ev) {
      if (e.sfx) GS.sfx(e.sfx, e.pan != null ? { pan: e.pan } : undefined);
      if (e.say) GS.shell.say(e.say, e.sub === false ? { sub: false } : { tone: e.tone });
      if (e.shake) GS.shake(e.shake[0], e.shake[1]);
    }
    s.ev = [];
  }

  function goPause() { GS.go('play', 'pause', { from: mock.kind, sim: mock.sim }); }
  function goTitle(state) {
    if (GS.screens.title) GS.go('title', state);
    else GS.go('play', 'countdown');
  }
  function setDeckWeapon() { if (mock.sim) GS.shell.setDeck({ type: 'play', weapon: WEAP[mock.sim.weapon] }); }

  function userAim(s, input) {
    const p = input.pointer, ox = s.cam.x, oy = s.cam.y - FY0;
    if (p.type === 'mouse') {
      if (p.inside && p.x >= 0 && (p.moved || mock.mouseAim)) { mock.mouseAim = true; s.userAim = { x: p.x + ox, y: p.y + oy }; }
    } else {
      const st = input.stick;
      if (st.x || st.y) { const a = input.aim; s.userAim = { x: a.x + ox, y: a.y + oy }; }
    }
  }

  function enterMockField(st, params) {
    const p = params || {};
    mock.kind = st; mock.mouseAim = false; mock.leave = -1;
    if (p.sim && p.sim.kind === st) { mock.sim = p.sim; mock.lock = 10; }
    else { mock.sim = makeSim(st); advance(mock.sim); mock.lock = 0; }
  }
  function updateMockField(t, input) {
    const s = mock.sim; if (!s) return;
    if (t === 0) GS.shell.setCursor(s.kind === 'demo' || s.kind === 'spectate' ? '' : 'none');
    if (s.kind === 'demo') {
      if (mock.leave >= 0) { mock.leave++; if (mock.leave >= 32) goTitle('title'); }
      else if (input.pressed('any') || input.pointer.justDown) { mock.leave = 0; GS.transition('fadeOut', { frames: 32 }); }
    } else if (mock.lock > 0) mock.lock--;
    else {
      if (input.pressed('pause')) { goPause(); return; }
      if (input.pressed('restart')) { GS.go('play', 'countdown'); return; }
      if (input.pressed('weapon') && s.hudId === 0) { s.weapon = (s.weapon + 1) % 3; GS.sfx('cursor'); setDeckWeapon(); }
      if (s.hudId === 0) userAim(s, input);
    }
    if (t > 0) { if (s.stop > 0) s.stop--; else advance(s); }   // hit stop: hold the scene, keep drawing
    const you = s.actors[0];
    const [yx, yy] = scr(s, you.x, you.y);
    GS.input.aimOrigin = { x: yx, y: yy };
    consumeEvents(s);
  }

  function enterPause(st, params) {
    const p = params || {};
    mock.kind = 'pause'; mock.closing = -1; mock.leave = -1;
    mock.pauseFrom = p.from && PAUSABLE.indexOf(p.from) >= 0 ? p.from : 'normal';
    mock.sim = p.sim || preroll('normal', GS.MOCK.play.pause.frame);
    mock.menu = newPauseMenu();
    // aria-live at once (also for the auto pause on blur / hidden / rotate, when no frame may run for a while);
    // the window shows PAUSE, so no subtitle. The menu then announces the selected item.
    GS.shell.say('ポーズ', { sub: false });
  }
  function updatePause(t, input) {
    if (t === 0) { GS.sfx('pause'); GS.shell.setCursor(''); GS.activeMenu = mock.menu; mock.menu.setIndex(mock.menu.index); }
    if (mock.closing >= 0) { mock.closing++; if (mock.closing >= 6) GS.go('play', mock.pauseFrom, { sim: mock.sim }); return; }
    if (mock.leave >= 0) { mock.leave++; if (mock.leave >= 16) goTitle('stage1'); return; }
    if (input.pressed('restart')) { GS.go('play', 'countdown'); return; }
    if (t < 6) return;                          // window still opening: the menu waits
    if (input.pressed('pause') || input.pressed('back')) { mock.closing = 0; return; }
    const id = mock.menu.update(input);
    if (id === 'cont') { GS.sfx('ok'); mock.closing = 0; }
    else if (id === 'retry') { GS.sfx('ok'); GS.go('play', 'countdown'); }
    else if (id === 'stage') { GS.sfx('ok'); mock.leave = 0; GS.transition('fadeOut', { frames: 16 }); }
    else if (id === 'manual') { GS.sfx('ok'); GS.shell.openManual('p8'); }
  }
  function drawPause(L, t) { drawPauseOf(L, t, mock.sim, mock.menu, mock.closing); }
  function drawPauseOf(L, t, s, menu, closing) {
    drawScene(L, s, { noMsg: true, aim: null });
    let dim, open;
    if (closing >= 0) { dim = 1 - closing / 6; open = 1 - GS.step(closing, 0, 6); }
    else { dim = Math.min(1, (t + 1) / 8); open = GS.step(t + 1, 0, 6); }
    GS.fx.dim = dim; GS.fx.dimTarget = 'bgobj';
    drawPauseWin(L.hud, s, t, menu, open);
  }

  function enterEnd(st) {
    mock.kind = st; mock.sim = makeEndSim(st); advance(mock.sim); mock.resultAt = -1;
  }
  function updateEnd(t) {
    const s = mock.sim, T = endTiming(s.kind);
    if (t === 0) GS.shell.setCursor('');
    if (t > 0) {
      if (T.slow && t >= 5 && t <= 50) { if ((t - 5) % 6 === 0) advance(s); }
      else if (T.slow && t > 50) advance(s);
    }
    if (t === T.banner) { const E = GS.MOCK.play.end[s.kind]; GS.shell.say(E.banner + ' ' + E.sub, { tone: END_TONE[END_JINGLE[s.kind]] }); }
    if (t === T.banner + 16) GS.sfx(END_JINGLE[s.kind]);
    if (t === T.out) { GS.transition('mosaicOut'); mock.resultAt = t + OUT_FADE() + 8; }
    if (mock.resultAt >= 0 && t >= mock.resultAt) {
      mock.resultAt = -1;
      if (GS.screens.result) GS.go('result', END_RESULT[s.kind], { from: s.kind });
      else goTitle('title');
    }
    consumeEvents(s);
  }

  // =====================================================================
  // LIVE: the real match (GS.app.game = game.mjs) on this screen
  // =====================================================================
  // Entered only with params.live (GS.app.startRound / retry / startDemo). The view v has the mock sim's shape
  // (v.real = true) and is refreshed from the Game every frame, so every drawing function above is shared and
  // the live screen looks the same as the mock path. game.update(1/60, input) runs inside this screen's fixed
  // 60 fps update, so GS.tick(n) advances the match deterministically (?seed=N).
  const DEMO_MAX = 1800;                             // the title demo shows at most 30 s of a match
  const TEAMS = ['blue', 'orange'];
  const LIVE_PAUSABLE = ['countdown', 'normal', 'spectate'];
  const TXT = {                                       // message lines (names, compass and seconds are filled in)
    start: '中央の 陣地を とれ!', blue: 'ブルーが 陣地を 確保!', orange: 'オレンジが 陣地を 確保!', contest: '陣地を とりあい中!',
    neutral: '陣地が 中立に もどった', selfDown: 'やられた… なかまを おうえん', hp30: '体力わずか! かくれよう',
    hp6: '通常弾 1発で ダウン!', hp4: 'あと 1発で ダウン!', blue25: 'ブルー あと5秒で かち!', orange25: 'オレンジ あと5秒で かち!',
    left15: 'のこり 15秒!', hints: ['陣地の中は ダメージ×2', 'ポンプ中は うてない!', '水が へった! 水たまりへ'],
    demo: ['水たまりで 水を ほきゅう!', '陣地を とると こうげき×2!', 'ぜんめつ させても かち!', '陣地を 30秒 とれば かち!'],
  };
  // active: this screen shows the real match (set by enter; else the mock path runs). v: the view.
  // mouseIdle: steps without mouse motion / button (see readControl). pendingWeapon: a weapon picked during 3-2-1,
  // given to game.selectWeapon at GO. endT: the end banner's own clock (see enterReal / updateRealEnd).
  const real = { active: false, v: null, lock: 0, leave: -1, mouseAim: false, mouseIdle: 0, pauseFrom: 'normal', closing: -1, menu: null,
    resultAt: -1, deckWeapon: null, pendingWeapon: null, endT: 0 };
  const MOUSE_IDLE_KEYS = 180;                        // 3 s of keys-only steering: the keys aim again (see readControl)
  const liveApp = () => (GS.app && GS.app.live && GS.app.game ? GS.app : null);
  const N16 = id => GS.NAME16[id];
  // YOU's weapon as the HUD and the deck show it: during 3-2-1 a pick waits for GO (game.selectWeapon needs 'playing')
  const youWeapon = () => real.pendingWeapon || GS.app.game.actors[0].weapon;

  function romStageName(id) { const st = GS.stage(id); return st ? (st.nameRom ? st.nameRom.join('') : st.name) : ''; }
  function realCountdownLines(s) { const l = GS.MOCK.play.countdown.lines; return ['STAGE ' + s.stageNo + ' ' + romStageName(s.stage), l[1], l[2]]; }
  function poolDir(stage, i) { const st = GS.stage(stage), p = st && st.pools[i]; return p && p.dir ? p.dir : ''; }

  // The Game operates a pump AT its tap point, so live draws the pump art one PUMP_LAYOUT.stand away: the
  // footprints and the operator sit on the real operating spot (mock: pump at the tap, operator at tap + stand).
  function drawPumpsAtTap(c, stage, pumps, ox, oy, f) {
    const base = GS.PUMP_LAYOUT, sd = base.stand, sh = p => [p[0] - sd[0], p[1] - sd[1]];
    GS.PUMP_LAYOUT = Object.assign({}, base, { body: sh(base.body), lever: sh(base.lever), foot: sh(base.foot), gauge: sh(base.gauge), dropFrom: sh(base.dropFrom), stand: [0, 0] });
    try { GS.drawPumps(c, stage, pumps, ox, oy, SC, f); } finally { GS.PUMP_LAYOUT = base; }
  }

  // Build every cached static image of a stage once (map at 1/3, 1/10, 1/30, all 6 puddle levels) when its first
  // round starts, so no level change rasterises a puddle in the middle of the match (~5-10 ms each).
  const warmed = new Set();
  function prewarm(id) {
    if (warmed.has(id)) return;
    warmed.add(id);
    const c = GS.makeCanvas(8, 8).getContext('2d');
    [SC, 0.1, 1 / 30].forEach(k => GS.mapCanvas(id, k));
    for (let lv = 0; lv <= 5; lv++) [SC, 0.1].forEach(k => GS.drawPuddles(c, id, [lv, lv, lv, lv], 0, 0, k, 0));
  }

  function makeView(kind) {
    const app = GS.app, g = app.game, id = g.stage ? g.stage.id : 'tutorial', C = app.rules.CONFIG;
    const v = {
      real: true, kind, stage: id, stageNo: app.stageNo(id), round: app.round, f: 0,
      actors: [], bullets: [], parts: [], beams: [], ev: [],
      cam: { x: 0, y: 0 }, iris: [128, 112], zone: 'neutral', x2: null, capturing: null, finale: false,
      remaining: g.remainingTime(), scores: g.scores.slice(),
      pools: g.puddles.map(p => ({ level: GS.poolLevel(p.water, p.capacity), water: p.water, capacity: p.capacity })),
      pumps: g.taps.map(t => ({ level: GS.pumpLevel(t.water), water: t.water, operating: false, footOn: false })),
      msg: { q: [], cur: null }, weapon: 0, hudId: 0, follow: 0, label: null,
      glint: { normal: 0, splash: 0, long: 0 }, lastWait: { normal: 0, splash: 0, long: 0 },
      hpShown: g.actors[0].hp, userAim: null, wedge: null, dryAt: g.puddles.map(() => -1), dim: false, endE: null,
      assistId: -1, lockId: -1, lockF: 0, stop: 0,
      fieldWater: 0, fieldTotal: Math.round(g.initialTotalWater - g.actors.length * C.initialWater),
      seenFx: new WeakSet(), seenEv: new WeakSet(), boost: new Map(), lastCombat: g.combatSequence,
      tips: {}, zoneSeen: 'neutral', zoneSince: 0, zoneSaid: 'neutral', poolW: g.puddles.map(p => p.water), dryArmed: g.puddles.map(() => true),
      prevHp: g.actors[0].hp, prevRemain: g.remainingTime(), prevScores: g.scores.slice(), lastSec: 99, heartT: 0,
    };
    g.effects.forEach(e => v.seenFx.add(e)); g.events.forEach(e => v.seenEv.add(e));
    prewarm(id);
    v.actors = g.actors.map(ga => ({
      g: ga, id: ga.id, name8: GS.NAME8[ga.id], team: TEAMS[ga.team], self: ga.id === 0, alive: ga.alive, was: ga.alive,
      x: ga.x * SC, y: ga.y * SC, hp: ga.hp, water: ga.water, weapon: ga.weapon, pose: 'field', faceLeft: ga.team === 1,
      dir: ga.team ? 8 : 0, ang: ga.aim, flashT: 0, lastFlash: -99, hpBarT: 0, charge: 0, chargeLv: 0, locked: false, wasLocked: false,
      aimA: null, rayX: null, rayY: null, recoil: 0, flinch: 0, ko: -1, moving: false, vulnerable: false, gold: false, slow: false, pumpNear: false,
      cool: { normal: 0, splash: 0, long: 0 }, coolT: { normal: 12, splash: 48, long: 900 }, gcool: 0, gcoolTotal: 12, shots: ga.stats.shots,
    }));
    syncView(v);
    cameraReal(v, true);
    const you = v.actors[0], p = scr(v, you.x, you.y); v.iris = [p[0], p[1]];
    return v;
  }

  // Refresh the view from the Game (positions, HUD values, pools, pumps, zone, shots). Display-only state
  // (flash timers, parts, messages, KO frames) lives in the view.
  function syncView(v) {
    const app = GS.app, g = app.game, rules = app.rules, C = rules.CONFIG;
    v.remaining = g.remainingTime(); v.scores = g.scores.slice();
    v.zone = g.contested ? 'contest' : g.zoneOwner === 0 ? 'blue' : g.zoneOwner === 1 ? 'orange' : 'neutral';
    v.x2 = g.zoneOwner == null ? null : TEAMS[g.zoneOwner];
    v.capturing = g.state === 'playing' ? v.x2 : null;
    v.finale = g.finaleEndsAt !== null;
    g.puddles.forEach((p, i) => { const q = v.pools[i]; q.water = p.water; q.capacity = p.capacity; q.level = GS.poolLevel(p.water, p.capacity); });
    g.taps.forEach((t, i) => {
      const q = v.pumps[i], near = g.actors.filter(a => a.alive && rules.distance(a, t) <= C.tapRadius);
      q.water = t.water; q.level = GS.pumpLevel(t.water);
      q.operating = near.some(a => a.tapId === t.id); q.footOn = g.usableTap(t) && near.length > 0;
    });
    v.fieldWater = Math.max(0, Math.ceil(g.remainingWater() - 1e-7));
    g.actors.forEach((ga, i) => {
      const a = v.actors[i], pump = ga.alive && ga.tapId != null;
      a.alive = ga.alive; a.x = ga.x * SC; a.y = ga.y * SC; a.hp = ga.hp; a.water = ga.water; a.weapon = ga.weapon;
      a.pose = pump ? 'pump' : 'field';
      a.ang = ga.charge > 0 ? ga.chargeAim : ga.aim;
      if (pump) { a.faceLeft = true; a.ang = Math.PI; } else a.faceLeft = Math.cos(a.ang) < -0.05;
      a.dir = GS.dir16(Math.cos(a.ang), Math.sin(a.ang));
      a.charge = ga.alive && ga.charge > 0 ? 1 + Math.min(3, F((ga.charge * 60) / 12 + 1e-6)) : 0;   // orb: 4 steps of 12f
      a.locked = a.charge > 0 && ga.charge >= C.longChargeDuration - C.longLockDuration - 1e-8;       // last 12f: aim fixed
      a.aimA = a.charge > 0 ? ga.chargeAim : null;
      if (a.locked) { const e = rules.longRayEnd(ga, ga.chargeAim, g.obstacles); a.rayX = e.x * SC; a.rayY = e.y * SC; } else a.rayX = a.rayY = null;
      a.recoil = ga.alive ? ga.recoil * 60 : 0; a.flinch = ga.alive ? ga.flinch : 0;
      a.moving = ga.alive && Math.hypot(ga.vx, ga.vy) > 1;
      a.vulnerable = rules.incomingDamageMultiplier(ga) > 1;
      a.gold = v.x2 === a.team;
      a.slow = ga.alive && ga.puddleId != null;
      // waits in frames; a wait that grows starts a new "total" (icon shadow = rest / total)
      WEAP.forEach(w => { const cw = ga.weaponCooldowns[w] * 60; if (cw > a.cool[w] + 0.5) a.coolT[w] = cw; a.cool[w] = cw; });
      const gc = ga.cooldown * 60; if (gc > a.gcool + 0.5) a.gcoolTotal = gc; a.gcool = gc;
    });
    v.weapon = Math.max(0, WEAP.indexOf(youWeapon()));
    v.bullets = g.bullets.map(b => {
      if (!v.boost.has(b.id)) v.boost.set(b.id, !!b.boosted);
      return { x: b.x * SC, y: b.y * SC, vx: (b.vx * SC) / 60, vy: (b.vy * SC) / 60, rem: (b.remaining || 0) * SC,
        type: b.weak ? 'weak' : b.weapon, gold: !!b.boosted && !b.weak, team: TEAMS[b.team] };
    });
  }

  function tickView(v) {
    const f = v.f;
    v.actors.forEach(a => { if (a.flashT > 0) a.flashT--; if (a.hpBarT > 0) a.hpBarT--; });
    v.parts = v.parts.filter(p => f - p.t0 < p.dur);
    v.beams = v.beams.filter(b => f - b.t0 < b.dur);
    if (v.wedge && f - v.wedge.t0 >= 30) v.wedge = null;
  }

  // Everything that happened in the last game.update -> parts, sounds, hit stop, shake and the message queue.
  // The steps run in this order (the order of the sounds and messages they queue).
  function processMatch(v) {
    const g = GS.app.game, demo = v.kind === 'demo';
    const fx = matchEffects(v, g);
    const kills = matchHits(v, g, fx);
    matchKOs(v, g, kills, demo);
    matchShots(v, g);
    matchPools(v, g, demo);
    matchEvents(v, g, demo);
    matchZone(v, g, demo);
    matchThresholds(v, g, demo);
    matchAlarms(v, g, demo);
  }

  // new effects: drips and long-barrel beams; hit effects by position and beam boosts are returned for matchHits
  function matchEffects(v, g) {
    const f = v.f, hitAt = new Map(), beamBoost = {};
    for (const e of g.effects) {
      if (v.seenFx.has(e)) continue;
      v.seenFx.add(e);
      if (e.kind === 'splash') v.parts.push({ type: 'drip', x: e.x * SC, y: e.y * SC, t0: f, dur: 8 });
      else if (e.kind === 'beam') { v.beams.push({ x0: e.x * SC, y0: e.y * SC, x1: e.endX * SC, y1: e.endY * SC, t0: f, dur: 14 }); beamBoost[e.owner] = !!e.boosted; }
      else if (e.kind === 'hit') hitAt.set(e.x + ',' + e.y, e);
    }
    return { hitAt, beamBoost };
  }

  // new combat events: hit marks, YOU's damage numbers (summed per target), one hit sound, the hit stop and the
  // wedge + shake when YOU is hit. Returns the events that knocked an actor out.
  function matchHits(v, g, fx) {
    const A = v.actors, f = v.f;
    let youHit = false, hurt = null;
    const nums = {}, kills = [];
    for (const e of g.combatEvents) {
      if (e.id <= v.lastCombat) continue;
      v.lastCombat = e.id;
      const t = A[e.target];
      markHit(v, t, e.x * SC, e.y * SC);
      if (e.owner === 0) {
        youHit = true;
        const hx = fx.hitAt.get(e.x + ',' + e.y);
        const gold = !e.weak && (e.weapon === 'long' ? !!fx.beamBoost[0] : hx && v.boost.has(hx.seed) ? v.boost.get(hx.seed) : g.zoneOwner === 0);
        const n = nums[e.target] || (nums[e.target] = { dmg: 0, gold: false });
        n.dmg += e.damage; n.gold = n.gold || gold;
      }
      if (e.target === 0) hurt = e;
      if (e.killed) kills.push(e);
    }
    const hitIds = Object.keys(nums);
    hitIds.forEach(id => { const t = A[id]; v.parts.push({ type: 'num', x: t.x, y: t.y - 10, t0: f, dur: 24, text: String(Math.round(nums[id].dmg)), gold: nums[id].gold }); });
    // one hit sound per frame (a splash volley is 5 pellets); hit stop when YOU lands or takes a hit
    if (youHit || hurt) { v.ev.push({ sfx: 'hit', pan: hurt || !hitIds.length ? 0 : panOf(v, A[hitIds[0]].x) }); hitStop(v, STOP_HIT); }
    if (hurt) { v.wedge = { real: true, t0: f, dx: -hurt.dx, dy: -hurt.dy }; v.ev.push({ shake: [2, 4] }); }
    return kills;
  }

  // actors that went down: the KO burst (hit stop only for YOU's KOs, made or taken) and the KO lines
  function matchKOs(v, g, kills, demo) {
    v.actors.forEach(a => {
      if (a.was && !a.alive) {
        const k = kills.find(e => e.target === a.id);
        koBurst(v, a);
        if (a.id === 0 || (k && k.owner === 0)) hitStop(v, STOP_KO);
      }
      a.was = a.alive;
    });
    if (!demo) kills.forEach(k => {
      if (k.owner === 0) pushMsg(v, 'self', N16(k.target) + 'を たおした!', 'blue');
      else if (k.target === 0) pushMsg(v, 'self', TXT.selfDown, 'danger');
      else pushMsg(v, 'ko', N16(k.owner) + 'が ' + N16(k.target) + 'を たおした', TEAMS[g.actors[k.owner].team]);
    });
  }

  // shots (sounds, long-barrel shake and hit stop) and long-barrel charges (tally per orb step / enemy lock-on)
  function matchShots(v, g) {
    const rules = GS.app.rules, A = v.actors, you = g.actors[0];
    g.actors.forEach((ga, i) => {
      const a = A[i];
      if (ga.stats.shots > a.shots) {
        a.shots = ga.stats.shots;
        const long = ga.lastShotWeapon === 'long' && !ga.lastShotWeak, pan = panOf(v, a.x);
        if (i === 0) v.ev.push({ sfx: ga.lastShotWeak ? 'shotW' : long ? 'shotL' : ga.lastShotWeapon === 'splash' ? 'shotS' : 'shotN', pan });
        else if (long) v.ev.push({ sfx: 'shotL', pan });
        else if (ga.lastShotWeapon === 'splash' && !ga.lastShotWeak) { const p = scr(v, a.x, a.y); if (onScreen(p[0], p[1])) v.ev.push({ sfx: 'shotS', pan }); }
        if (long) { v.ev.push({ shake: [2, 4] }); if (i === 0) hitStop(v, STOP_LONG); }
      }
      if (i === 0 && a.charge > a.chargeLv) v.ev.push({ sfx: 'tally' });   // YOU: each orb step of the charge
      if (i !== 0 && ga.team !== 0 && a.locked && !a.wasLocked && you.alive && rules.distance(ga, you) < 600 && g.clearPath(ga, you)) v.ev.push({ sfx: 'tally', pan: panOf(v, a.x) });
      a.chargeLv = a.charge; a.wasLocked = a.locked;
    });
  }

  // pools running dry (compass from data.js, not game.mjs's label)
  // A pump trickling into a pool that is being drained empties it again and again: announce (and blink the
  // radar) once, then again only after the pool held 20% of its capacity.
  function matchPools(v, g, demo) {
    const f = v.f;
    g.puddles.forEach((p, i) => {
      if (p.water >= p.capacity * 0.2) v.dryArmed[i] = true;
      if (v.poolW[i] > 0 && p.water <= 0 && v.dryArmed[i]) {
        v.dryArmed[i] = false; v.dryAt[i] = f;
        if (!demo) pushMsg(v, 'dry', poolDir(v.stage, i) + 'の 水たまりが 枯れた', 'std', { sfx: 'dry' });
      }
      v.poolW[i] = p.water;
    });
  }

  // new game events: the finale (water ran out)
  function matchEvents(v, g, demo) {
    for (const e of g.events) {
      if (v.seenEv.has(e)) continue;
      v.seenEv.add(e);
      if (e.type === 'finale' && !demo) {
        pushMsg(v, 'finale', '水が つきた! のこり' + Math.ceil(g.remainingTime() - 1e-8) + '秒', 'danger', { dur: 180, sfx: 'buzz' });
        const cur = v.msg.cur;                    // the most urgent line: an open window closes now (6f) to make room
        if (cur && cur.kind !== 'finale' && cur.t < cur.dur + 6) cur.t = cur.dur + 6;
      }
    }
  }

  // zone: a state is announced once it held for 20f (a body on the circle's edge would otherwise spam)
  function matchZone(v, g, demo) {
    const f = v.f;
    if (v.zone !== v.zoneSeen) { v.zoneSeen = v.zone; v.zoneSince = f; }
    else if (f - v.zoneSince >= 20 && v.zone !== v.zoneSaid && g.state === 'playing') {
      const prev = v.zoneSaid; v.zoneSaid = v.zone;
      // the window already says this state (it flipped and came back): drop the queued, outdated zone line instead
      const sayZone = (text, tone, extra) => {
        const cur = v.msg.cur;
        if (cur && cur.kind === 'capture' && cur.text === text) { v.msg.q = v.msg.q.filter(m => m.kind !== 'capture'); return; }
        pushMsg(v, 'capture', text, tone, extra);
      };
      if (!demo) {
        if (v.zone === 'blue') sayZone(TXT.blue, 'blue', { sfx: 'capture' });
        else if (v.zone === 'orange') sayZone(TXT.orange, 'orange', { sfx: 'captureEnemy' });
        else if (v.zone === 'contest') sayZone(TXT.contest, 'std');
        else if (prev !== 'neutral') sayZone(TXT.neutral, 'std');
      }
    }
  }

  // threshold lines: a team's capture reaching 25 s, 15 s left, YOU's HP steps and the tutorial hints; then keep the
  // values the next step compares with
  function matchThresholds(v, g, demo) {
    const rules = GS.app.rules, C = rules.CONFIG, you = g.actors[0];
    if (!demo && g.state === 'playing') {
      [0, 1].forEach(t => { if (v.prevScores[t] < 25 && g.scores[t] >= 25 && g.scores[t] < C.captureGoal - 1e-8) pushMsg(v, 'cap25', t ? TXT.orange25 : TXT.blue25, TEAMS[t], { prio: MPRIO.capture }); });
      if (v.prevRemain > 15 && v.remaining <= 15 && !v.finale) pushMsg(v, 'left15', TXT.left15, 'std');
      if (you.alive && you.hp < v.prevHp) {
        const ph = v.prevHp, hp = you.hp;
        if (hp <= C.weakDamage && ph > C.weakDamage) pushMsg(v, 'lowhp', TXT.hp4, 'danger');
        else if (hp <= C.damage && ph > C.damage) pushMsg(v, 'lowhp', TXT.hp6, 'danger');
        else if (hp <= 30 && ph > 30) pushMsg(v, 'lowhp', TXT.hp30, 'danger');
      }
      if (v.stage === 'tutorial' && you.alive) {   // tutorial-only hints, once each
        if (!v.tips.zone && rules.distance(you, rules.ZONE) <= rules.ZONE.r) { v.tips.zone = 1; pushMsg(v, 'tip', TXT.hints[0], 'std'); }
        if (!v.tips.pump && you.tapId) { v.tips.pump = 1; pushMsg(v, 'tip', TXT.hints[1], 'std'); }
        if (!v.tips.water && you.water < 15) { v.tips.water = 1; pushMsg(v, 'tip', TXT.hints[2], 'std'); }
      }
    }
    v.prevScores = g.scores.slice(); v.prevRemain = v.remaining; v.prevHp = you.hp;
  }

  // low HP heartbeat (75f, HP<=6: 51f; GS.sfx mutes it when けいこくおん is OFF), the last 10 s ticks and the BGM hurry
  function matchAlarms(v, g, demo) {
    const C = GS.app.rules.CONFIG, you = g.actors[0];
    if (!demo && you.alive && you.hp <= 30 && g.state === 'playing') {
      if (--v.heartT <= 0) { v.ev.push({ sfx: 'heart' }); v.heartT = you.hp <= C.damage ? 51 : 75; }
    } else v.heartT = 0;
    const sec = Math.ceil(v.remaining - 1e-9);
    if (g.state === 'playing' && sec !== v.lastSec && sec <= 10 && sec > 0) v.ev.push({ sfx: 'tick10' });
    v.lastSec = sec;
    // BGM 03 plays 15% faster for the last 15 s (the finale's clock also starts at 15 s or less)
    if (!demo && !v.hurry && g.state === 'playing' && v.remaining <= 15) { v.hurry = true; if (GS.bgm) GS.bgm.hurry(true); }
  }

  // the live camera leads further (64px) while the followed actor charges the long barrel; snap: no easing
  function cameraReal(v, snap) {
    const a = v.actors[v.follow], [tx, ty] = camTarget(a, a.charge > 0 ? 64 : 22);
    if (snap) { v.cam.x = clamp(R(tx), 0, CAM_MAX.x); v.cam.y = clamp(R(ty), 0, CAM_MAX.y); return; }
    easeCam(v.cam, tx, ty);
  }

  // Player input -> game input. Mouse: ROM point -> world (camera), left = fire (hold = long charge).
  // Touch (shell: left half stick, right half fire): the stick also aims while it is steered.
  // No mouse yet: the keys aim like the stick. aim.mjs AimAssist corrects with scale = CSS px per world unit.
  // The mouse aims from its first motion (or click / held button) over the ROM. After MOUSE_IDLE_KEYS steps of
  // steering with the keys and no mouse motion or button, the keys aim again until the mouse is used; every new
  // round starts with key aim (enterReal).
  function readControl(v, input) {
    const app = GS.app, g = app.game, you = g.actors[0], p = input.pointer;
    const st = input.stick, steer = Math.hypot(st.x, st.y) > 0.05;
    if (p.type !== 'mouse') { real.mouseAim = false; real.mouseIdle = 0; }
    else if (p.inside && (p.moved || p.justDown || input.fire)) { real.mouseAim = true; real.mouseIdle = 0; }
    else if (real.mouseAim && steer && ++real.mouseIdle >= MOUSE_IDLE_KEYS) { real.mouseAim = false; real.mouseIdle = 0; }
    if (!you.alive) { v.userAim = null; v.assistId = -1; return {}; }
    let direction = null, cursor = null;
    if (real.mouseAim) {
      const mx = p.x + v.cam.x, my = p.y - FY0 + v.cam.y;
      v.userAim = { x: mx, y: my }; cursor = { x: mx / SC, y: my / SC };
      direction = Math.atan2(cursor.y - you.y, cursor.x - you.x);
    } else { v.userAim = null; if (steer) direction = Math.atan2(st.y, st.x); }
    const shooting = !!input.fire;
    const css = GS.state.scale && GS.state.scale.cssW ? GS.state.scale.cssW / 256 : 3;
    const aim = app.aimAssist.resolve(g, you, { direction, shooting, cursor, scale: css / 3 }, 1 / 60);
    const tg = real.mouseAim ? null : app.aimAssist.visibleTarget(g, you, shooting);
    v.assistId = tg == null ? -1 : tg;
    return { x: st.x, y: st.y, aim, shoot: shooting };
  }

  function stepReal(v, input) {
    const app = GS.app, g = app.game;
    v.f++; tickView(v);
    if (v.kind === 'countdown' && v.f <= CD_GO) {
      const f = v.f;
      countdownCues(v, f);
      if (f === CD_GO) {
        g.start();
        if (real.pendingWeapon) { g.selectWeapon(g.actors[0], real.pendingWeapon); real.pendingWeapon = null; }   // picked during 3-2-1
        if (GS.bgm) GS.bgm.scene('battle');     // BGM 03 hits with GO (the state is still countdown until CD_END)
      }
      app.countdown = f < CD_GO ? Math.max(0, (CD_GO - Math.max(CD_COUNT, f)) / 60) : -1;
      syncView(v); msgStep(v);
      return;
    }
    const ctl = real.lock > 0 || v.kind === 'demo' || g.autopilot ? {} : readControl(v, input);
    if (g.state === 'playing') g.update(1 / 60, ctl);
    syncView(v);
    v.actors[0].pumpNear = pumpNear(g, ctl);
    processMatch(v);
    if (v.kind === 'countdown' && v.f === CD_MSG) pushMsg(v, 'start', TXT.start, 'std');
    if (v.kind === 'demo' && v.f % 120 === 1) pushMsg(v, 'tip', TXT.demo[F(v.f / 120) % 4], 'std');
    msgStep(v);
    const m = v.msg.cur; if (m && m.kind === 'finale' && m.t === 12) v.ev.push({ sfx: 'buzz' });   // finale: buzz x2
    glintStep(v);
    if (v.kind === 'spectate') pickFollow(v);
    const ha = hudActor(v);
    if (v.hpShown < ha.hp) v.hpShown = ha.hp; else if (v.hpShown > ha.hp) v.hpShown = Math.max(ha.hp, v.hpShown - 0.75);
    cameraReal(v);
    if (v.assistId !== v.lockId) { v.lockId = v.assistId; v.lockF = v.f; }
  }

  // game.mjs update: an actor with no stick input takes a usable tap within tapRadius that no other living body
  // blocks (closer than 2 radii), walks onto it and holds fire (firing = shoot && !tap) until it stands on it (tapId,
  // pose 'pump'). The HUD shows PUMP for that walk too: the same test on YOU's input of this step, which the next
  // update repeats. Bots (autopilot) and the dead never show it.
  function pumpNear(g, ctl) {
    const rules = GS.app.rules, C = rules.CONFIG, a = g.actors[0];
    if (g.state !== 'playing' || g.autopilot || !a.alive || a.tapId != null) return false;
    if (Math.hypot(ctl.x || 0, ctl.y || 0) >= 1e-8) return false;
    return g.taps.some(t => g.usableTap(t) && rules.distance(a, t) <= C.tapRadius
      && !g.actors.some(b => b.alive && b.id !== a.id && rules.distance(b, t) < C.radius * 2));
  }

  // spectate: follow a living ally (the HUD shows that ally, WATCH name)
  function pickFollow(v) {
    const g = GS.app.game, cur = g.actors[v.follow];
    if (cur && cur.alive && cur.team === 0 && v.follow !== 0) return;
    const ally = g.actors.find(a => a.team === 0 && a.alive && a.id !== 0);
    if (!ally) return;
    v.follow = v.hudId = ally.id; v.label = 'WATCH ' + GS.NAME8[ally.id]; v.hpShown = ally.hp;
  }

  // reason / winner -> banner, sub line (with the loss wordings) and end state
  function endInfo(g) {
    const w = g.winner, r = g.reason;
    const E = (kind, banner, x, sub, set, drop) => ({ kind, banner, x, sub, set: set || 'H0', drop: !!drop });
    if (r === '全滅') return w === 0 ? E('end-final', 'FINAL SPLASH!', 24, 'あいてを ぜんめつ!', 'H3') : w === 1 ? E('end-set', 'GAME SET', 64, 'なかまが ぜんめつ…') : E('end-draw', 'DRAW GAME', 56, 'りょうチーム ぜんめつ', 'H0', true);
    if (r === '陣地を30秒確保') return w === 0 ? E('end-set', 'GAME SET!', 56, '陣地を 30秒 確保!') : E('end-set', 'GAME SET', 64, '陣地を 30秒 とられた…');
    if (r === 'タイムアップ' || r === '最終局面終了') {
      if (w == null) return E('end-draw', 'DRAW GAME', 56, '確保タイム どうてん', 'H0', true);
      return E('end-timeup', 'TIME UP!', 64, r === '最終局面終了' ? '水ぎれで タイムアップ' : '確保タイムで しょうぶ');
    }
    return null;
  }
  const outcomeOf = g => (g.winner === 0 ? 'win' : g.winner === 1 ? 'lose' : 'draw');

  function goRealEnd(v) {
    const app = GS.app, g = app.game, E = endInfo(g) || Object.assign({ kind: 'end-timeup' }, GS.MOCK.play.end['end-timeup']);
    v.endE = E; v.kind = E.kind; v.dim = g.winner === 1; v.msg.q = []; v.msg.cur = null; v.stop = 0;
    app.countdown = -1;
    app.recordResult();                         // once per round (idle-safe); a later R cannot lose the decided result
    GS.go('play', E.kind, { live: true, cont: true });
  }
  function enterSpectate(v) {
    v.kind = 'spectate'; v.follow = 0; v.wedge = null; v.userAim = null; v.assistId = -1; pickFollow(v);
    v.msg.q = v.msg.q.filter(m => m.kind !== 'lowhp' && m.kind !== 'tip');   // YOU's own warnings are stale now
    const cur = v.msg.cur;
    if (cur && (cur.kind === 'lowhp' || cur.kind === 'tip') && cur.t < cur.dur + 6) cur.t = cur.dur + 6;
    GS.go('play', 'spectate', { live: true, cont: true, keepFx: true });
  }
  function leaveDemo() { real.leave = 0; GS.transition('fadeOut', { frames: 32 }); if (GS.bgm) GS.bgm.stop(32); }
  function goRealPause() { GS.go('play', 'pause', { live: true, from: GS.current.state }); }
  // E / right click / weapon button. game.selectWeapon only takes a pick while 'playing', so during 3-2-1 (before
  // game.start at GO) the pick waits in real.pendingWeapon; HUD and deck show it at once, as in the mock.
  function cycleWeapon(v) {
    const app = GS.app, g = app.game, you = g.actors[0], W = app.rules.WEAPONS;
    const next = id => W[(W.findIndex(w => w.id === id) + 1) % W.length].id;
    if (g.state === 'ready' && v.kind === 'countdown') { real.pendingWeapon = next(youWeapon()); GS.sfx('cursor'); }
    else if (g.selectWeapon(you, next(you.weapon))) GS.sfx('cursor');
    else return;
    v.weapon = Math.max(0, WEAP.indexOf(youWeapon()));
    syncDeckWeapon(v);
  }
  // the deck's weapon button shows YOU's weapon, in spectate the followed ally's (the one the HUD shows)
  function syncDeckWeapon(v) {
    if (v.kind !== 'countdown' && v.kind !== 'normal' && v.kind !== 'spectate') return;
    const w = v.kind === 'spectate' ? hudWeapon(v) : youWeapon();
    if (w !== real.deckWeapon) { real.deckWeapon = w; GS.shell.setDeck({ type: 'play', weapon: w }); }
  }

  function enterReal(st, p) {
    const app = GS.app;
    real.leave = -1; real.closing = -1; real.resultAt = -1;
    const keep = !!(p.resume || p.cont) && real.v && real.v.round === app.round;
    // a new round: no weapon pick waiting for GO, and the keys aim until the mouse is used again (readControl)
    const fresh = () => { real.pendingWeapon = null; real.mouseAim = false; real.mouseIdle = 0; };
    if (st === 'pause') {
      if (!real.v || real.v.round !== app.round) { fresh(); real.v = makeView('normal'); }
      real.pauseFrom = LIVE_PAUSABLE.indexOf(p.from) >= 0 ? p.from : real.v.kind === 'spectate' ? 'spectate' : 'normal';
      real.menu = newPauseMenu();
      GS.shell.say('ポーズ', { sub: false });  // as in enterPause
      return;
    }
    if (!keep) {
      fresh();
      real.v = makeView(st); real.lock = 0; real.deckWeapon = null;
      if (st !== 'countdown' && ENDS.indexOf(st) < 0 && app.game.state === 'ready') app.game.start();   // demo / direct entry
      app.countdown = st === 'countdown' ? 3 : -1;
    } else { real.v.kind = st; if (p.resume) real.lock = 10; }   // back from pause: 10f without input
    if (ENDS.indexOf(st) >= 0) {
      if (!real.v.endE) {
        real.v.endE = endInfo(app.game) || Object.assign({ kind: st }, GS.MOCK.play.end[st]);
        real.v.dim = app.game.winner === 1;
      }
      // The end timing counts from the decision. goRealEnd (cont) enters inside the deciding step, whose frame already
      // shows the end at 0, and the screen's first update then runs with t = 0 again: the end clock starts at 1
      // there, so end-final reaches the result 123f after the decision (reduced 66f), not 124f.
      real.endT = p.cont ? 0 : -1;
    }
  }

  function updateRealPlay(t, input) {
    const app = GS.app, v = real.v, g = app.game;
    if (!v) return;
    if (t === 0) GS.shell.setCursor(v.kind === 'demo' || v.kind === 'spectate' ? '' : 'none');
    if (v.kind === 'demo') {
      if (real.leave >= 0) { if (++real.leave >= 32) { real.leave = -1; app.endDemo(); return; } }
      else if (input.pressed('any') || input.pointer.justDown) leaveDemo();
    } else if (real.lock > 0) real.lock--;
    else {
      if (input.pressed('pause')) { goRealPause(); return; }
      if (input.pressed('restart')) { app.retry(); return; }
      if (input.pressed('weapon') && v.kind !== 'spectate') cycleWeapon(v);
    }
    if (v.stop > 0) v.stop--;                   // hit stop: hold the match, keep drawing
    else stepReal(v, input);
    const a = v.actors[v.follow], p = scr(v, a.x, a.y);
    GS.input.aimOrigin = { x: p[0], y: p[1] };
    consumeEvents(v);
    if (g.state === 'ended') {
      if (v.kind === 'demo') { if (real.leave < 0) leaveDemo(); }
      else goRealEnd(v);
      return;
    }
    if (v.kind === 'demo') { if (v.f >= DEMO_MAX && real.leave < 0) leaveDemo(); return; }
    if (!g.actors[0].alive && v.kind !== 'spectate') { enterSpectate(v); return; }
    if (v.kind === 'countdown' && v.f >= CD_END) { v.kind = 'normal'; GS.go('play', 'normal', { live: true, cont: true, keepFx: true }); return; }
    syncDeckWeapon(v);
  }

  function updateRealPause(t, input) {
    const app = GS.app;
    if (t === 0) { GS.sfx('pause'); GS.shell.setCursor(''); GS.activeMenu = real.menu; real.menu.setIndex(real.menu.index); }
    if (real.closing >= 0) { if (++real.closing >= 6) GS.go('play', real.pauseFrom, { live: true, resume: true }); return; }
    if (real.leave >= 0) { if (++real.leave >= 16) { real.leave = -1; app.toStageSelect(); } return; }
    if (input.pressed('restart')) { app.retry(); return; }
    if (t < 6) return;                          // window still opening: the menu waits
    if (input.pressed('pause') || input.pressed('back')) { real.closing = 0; return; }
    const id = real.menu.update(input);
    if (id === 'cont') { GS.sfx('ok'); real.closing = 0; }
    else if (id === 'retry') { GS.sfx('ok'); app.retry(); }
    else if (id === 'stage') { GS.sfx('ok'); real.leave = 0; GS.transition('fadeOut', { frames: 16 }); }
    else if (id === 'manual') { GS.sfx('ok'); app.openManual('p8'); }
  }

  function endAdvance(v) {                      // the decided field: effects run out, shots in flight land
    v.f++; tickView(v);
    v.bullets = v.bullets.filter(b => {
      b.x += b.vx; b.y += b.vy; b.rem -= Math.hypot(b.vx, b.vy);
      if (b.rem > 0) return true;
      v.parts.push({ type: 'drip', x: b.x, y: b.y, t0: v.f, dur: 8 }); return false;
    });
  }
  function updateRealEnd(t0, input) {
    const app = GS.app, v = real.v, g = app.game; if (!v) return;
    const T = endTiming(v.kind), E = v.endE, o = outcomeOf(g);
    if (t0 === 0) GS.shell.setCursor('');
    if (input.pressed('restart')) { app.retry(); return; }
    const t = ++real.endT;                         // the end clock (see enterReal), not the screen's t0
    if (t > 0) {
      if (T.slow && t >= 5 && t <= 50) { if ((t - 5) % 6 === 0) endAdvance(v); }
      else if (T.slow && t > 50) endAdvance(v);
    }
    if (t === T.banner) GS.shell.say(E.banner + ' ' + E.sub, { tone: END_TONE[o] });
    if (t === T.banner + 16) GS.sfx(o);         // the jingle plays here once (a live result page 1 never repeats it)
    if (t === T.out) { GS.transition('mosaicOut'); real.resultAt = t + OUT_FADE() + 8; }
    if (real.resultAt >= 0 && t >= real.resultAt) {
      real.resultAt = -1;
      app.recordResult();
      if (GS.screens.result) GS.go('result', o + '-1', { live: true, from: v.kind });
      else app.toTitle();
    }
    consumeEvents(v);
  }

  function drawRealLive(L, v) {
    const k = v.kind, g = GS.app.game;
    let aim = null;
    if (k !== 'demo' && k !== 'spectate' && !(k === 'countdown' && v.f < CD_GO) && !g.autopilot && g.actors[0].alive) {
      if (real.mouseAim) {                         // the crosshair stays on the cursor even when the camera moved
        const p = GS.input.pointer; v.userAim = { x: p.x + v.cam.x, y: p.y - FY0 + v.cam.y }; aim = 'mouse';
      } else if (GS.state.layout !== 'pc' || GS.state.touch) aim = 'assist';
    }
    drawScene(L, v, { aim, youTag: k === 'countdown' && v.f < CD_GO });
    if (k === 'countdown' && v.f < CD_END) drawCountdown(L, v);
    if (k === 'demo') drawDemo(L, v);
  }
  function drawReal(L, st, t) {
    const v = real.v; if (!v) return;
    if (st === 'pause') drawPauseOf(L, t, v, real.menu, real.closing);
    else if (ENDS.indexOf(st) >= 0) drawEnd(L, v, st, Math.max(0, real.endT));
    else drawRealLive(L, v);
  }
  // spectate keeps the play deck (stick / fire pads / weapon button), as deck(st) does on the mock path; a dead YOU's input is
  // dropped by readControl, and the weapon button shows the followed ally's weapon
  function realDeck(st) {
    if (st === 'pause') return { type: 'menu' };
    if (ENDS.indexOf(st) >= 0 || st === 'demo') return { type: 'none' };
    const w = st === 'spectate' && real.v ? hudWeapon(real.v) : youWeapon(); real.deckWeapon = w;
    return { type: 'play', weapon: w };
  }

  // =====================================================================
  // registration
  // =====================================================================
  const STATES = ['countdown', 'normal', 'contest', 'lowhp', 'finale', 'spectate', 'pause', 'end-final', 'end-set', 'end-timeup', 'end-draw', 'demo'];
  const LABELS = {
    countdown: 'カウントダウン', normal: 'ふつう（BLUE確保中）', contest: '争奪中', lowhp: 'HP6（低体力）', finale: '最終局面',
    spectate: '観戦', pause: 'ポーズ', 'end-final': '決着 FINAL SPLASH!', 'end-set': '決着 GAME SET!', 'end-timeup': '決着 TIME UP!',
    'end-draw': '決着 DRAW GAME', demo: 'デモ',
  };
  // The shell names the ROM canvas from LABELS (the mock path's scenes, e.g. ふつう（BLUE確保中）) right after enter().
  // A live match renames it once that GS.go is over, with what is really on screen (the zone owner changes
  // without a state change, so the play state does not name it).
  function liveLabel(st) {
    if (ENDS.indexOf(st) >= 0) { const E = real.v && real.v.endE; return '決着' + (E ? ' ' + E.banner : ''); }
    return st === 'normal' ? 'プレイ中' : LABELS[st] || st;
  }
  function queueLiveLabel() {
    Promise.resolve().then(() => {
      const c = GS.current, rom = document.getElementById('rom');
      if (real.active && c.id === 'play' && rom) rom.setAttribute('aria-label', 'ゲーム画面：プレイ ' + liveLabel(c.state));
    });
  }
  const LEGEND_PLAY = {
    pc: 'WASD／矢印：いどう ／ マウス：ねらう ／ 左クリック：うつ（ロングは長おし） ／ E・右クリック：ぶき ／ Esc：ポーズ ／ R：すぐやりなおし',
    touch: '左半分で いどう・右半分で うつ・ぶきボタンで きりかえ',
  };

  GS.registerScreen('play', {
    title: 'プレイ',
    states: STATES,
    labels: LABELS,
    enter(st, params) {
      // the real match only with params.live and a live GS.app (startRound / retry / startDemo); else the mock
      real.active = !!(params && params.live && liveApp());
      if (real.active) { enterReal(st, params); queueLiveLabel(); return; }
      if (FIELD_STATES.indexOf(st) >= 0) enterMockField(st, params);
      else if (st === 'pause') enterPause(st, params);
      else if (ENDS.indexOf(st) >= 0) enterEnd(st);
    },
    update(t, input) {
      const st = GS.current.state;
      if (real.active) {
        if (st === 'pause') updateRealPause(t, input);
        else if (ENDS.indexOf(st) >= 0) updateRealEnd(t, input);
        else updateRealPlay(t, input);
        return;
      }
      if (FIELD_STATES.indexOf(st) >= 0) updateMockField(t, input);
      else if (st === 'pause') updatePause(t, input);
      else if (ENDS.indexOf(st) >= 0) updateEnd(t, input);
    },
    draw(L, t) {
      const st = GS.current.state;
      if (real.active) { drawReal(L, st, t); return; }
      if (!mock.sim) return;
      if (FIELD_STATES.indexOf(st) >= 0) drawMockField(L, mock.sim, false);
      else if (st === 'pause') drawPause(L, t);
      else if (ENDS.indexOf(st) >= 0) drawEnd(L, mock.sim, st, t);
    },
    still(st, L) {
      if (st === 'pause') {
        const s = preroll('normal', GS.MOCK.play.pause.frame);
        const m = newPauseMenu();
        drawScene(L, s, { noMsg: true });
        GS.fx.dim = 1; GS.fx.dimTarget = 'bgobj';
        drawPauseWin(L.hud, s, 0, m, 1);
      } else if (ENDS.indexOf(st) >= 0) {
        // DRAW GAME drops one letter every 4f (last letter lands + bounces by k=46), so its still waits until k=48
        const T = endTiming(st), E = GS.MOCK.play.end[st], hold = Math.min(T.banner + (E.drop ? 48 : 40), T.out - 1);
        const s = makeEndSim(st);
        for (let i = 0; i <= hold; i++) advance(s);
        drawEnd(L, s, st, hold);
      } else {
        const s = preroll(st, st === 'countdown' ? 100 : 60);
        drawMockField(L, s, true);
        // the still always shows the DEMO PLAY label (the running blink may be in its off phase at the still frame)
        if (st === 'demo' && !GS.blink(Math.max(0, s.f), 32, 32)) GS.banner(L.hud, 'DEMO PLAY', 80, 72, { set: 'H0' });
      }
    },
    deck(st) {
      if (real.active) return realDeck(st);
      if (st === 'pause') return { type: 'menu' };
      if (ENDS.indexOf(st) >= 0 || st === 'demo') return { type: 'none' };
      return { type: 'play', weapon: mock.sim && mock.sim.kind === st ? WEAP[mock.sim.weapon] : st === 'spectate' ? 'splash' : 'normal' };
    },
    legend(st) {
      if (st === 'pause') return { pc: 'Esc：つづける ／ ↑↓←→：えらぶ ／ Enter：けってい ／ R：やりなおし（確認なし）', touch: '下のボタンで えらんでね' };
      if (st === 'demo') return { pc: 'Enter・クリック：タイトルへ', touch: 'がめんに タッチで タイトルへ' };
      if (ENDS.indexOf(st) >= 0) return { pc: '', touch: '' };
      if (st === 'spectate') return { pc: 'Esc：ポーズ ／ R：すぐやりなおし', touch: 'なかまを おうえん中' };
      return LEGEND_PLAY;
    },
    // BGM (js/bgm.js): silent 3-2-1; BGM 03 from GO (stepReal asks at CD_GO; and in the demo) through play and
    // spectate; held in pause and going on from there; cut at the decision (the jingle follows)
    bgm(st) {
      if (st === 'pause') return 'pause';
      // a countdown resumed from pause after GO keeps the music (a fresh one starts with real.v.f = 0: silent)
      if (st === 'countdown') return real.active && real.v && real.v.f >= CD_GO ? 'battle' : null;
      if (ENDS.indexOf(st) >= 0) return null;
      return 'battle';
    },
    onPause(reason) {
      const st = GS.current.state;
      // auto pause (blur / hidden / rotate): the live match pauses in countdown, play and spectate
      if (real.active) { if (LIVE_PAUSABLE.indexOf(st) >= 0 && real.v) goRealPause(); return; }
      if (PAUSABLE.indexOf(st) >= 0 && mock.sim && mock.leave < 0) goPause();
      void reason;
    },
    // ROM coordinates for the manual's leader lines (p8: ①-⑫ in this order)
    anchors: {
      normal: {
        timer: [128, 20], blueGauge: [56, 20], orangeGauge: [200, 20], alive: [72, 12], attackX2: [96, 12], message: [128, 48],
        zone: [144, 112], self: [101, 110], hp: [66, 196], water: [66, 204], weapon: [176, 200], radar: [224, 204],
      },
      countdown: { info: [128, 80], count: [128, 144], self: [101, 110] },
      pause: { title: [128, 52], map: [76, 100], info: [192, 92], stage: [80, 148], menu: [128, 184] },
      end: { banner: [128, 104], reason: [128, 132] },
    },
  });

  // debugging / tests (S = the mock runtime state, LS = the real match's)
  GS.PLAY = { S: mock, makeSim, makeEndSim, preroll, advance, timeAt, capAt, LS: real, makeView, syncView, endInfo, waitOf, totalOf, weaponStatus, pumpNear, liveLabel };
})();
