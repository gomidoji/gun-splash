/* ガン・スプラッシュ 復刻版 — result screen
 * States win-1..3 / lose-1..3 / draw-1..3 (the number is the page).
 *   page 1 しょうはい      : heading, reason, capture-time tally, busts on the podium, one-line comment
 *   page 2 せいせきひょう  : 6-row table, max of each column in gold, team zone, YOU weak shots
 *   page 3 水の ゆくえ     : where the 1200 water went (largest-remainder rounding), title stamp, record, tip, menu
 * Data: GS.MOCK.result[win|lose|draw] (data.js). The comment, tip and title (称号) are computed from the
 * rules below and checked against the mock data's own values (console.warn on a mismatch).
 * Variant: GS.go('result', 'win-1', {from: 'end-final'}) uses the wipe-out win 'winWipe' (FINAL SPLASH!,
 * TIME 55.0, capture 22.6 / 11.2) on all three pages; see localWinWipe().
 * Live: GS.go('result', 'win-1'|'lose-1'|'draw-1', {live: true}) with GS.app.live reads the decided
 * match from GS.app.resultSnapshot() + GS.app.session.record (see liveSource()); the snapshot's winner decides
 * the outcome. The same rules then build the pages. Page turns carry the data set (params.src), so the snapshot
 * is read once per match. Menu / R call GS.app.retry() / toStageSelect() / toTitle(). Without params.live
 * (MOCK panel, #hash with ?mock=1, GS.still for the manual) every state stays the scripted mock.
 *
 * Timing: every page has its own clock `et` (frames). The first input during a page's animation jumps
 * `et` to the page's final state, the next input turns the page (pageOut 8f + pageIn 8f). Page 1 turns by
 * itself at f330, page 2 at f110. Page 3 ends on the menu. R = もういちど on every page.
 * Reduced motion: each page reaches its final state in 40f through 3 steps (no count-up, falling letters,
 * shake, typewriter, palette cycling, pose loops, rain or waves).
 */
(function () {
  'use strict';
  const GS = window.GS;
  if (!GS || !GS.registerScreen) { console.error('[result] core.js is not loaded'); return; }
  const R = Math.round, F = Math.floor;
  const red = () => !!GS.state.reduced;

  // =====================================================================
  // states
  // =====================================================================
  const OUTCOMES = ['win', 'lose', 'draw'];
  const STATES = [];
  OUTCOMES.forEach(o => [1, 2, 3].forEach(p => STATES.push(o + '-' + p)));
  const OUT_LABEL = { win: '勝ち', lose: '負け', draw: '引き分け' };
  const PAGE_LABEL = { 1: 'しょうはい', 2: 'せいせきひょう', 3: '水の ゆくえ' };
  const LABELS = {};
  STATES.forEach(s => { const [o, p] = parse(s); LABELS[s] = OUT_LABEL[o] + ' ' + p + '/3 ' + PAGE_LABEL[p]; });
  function parse(st) { const m = /^(win|lose|draw)-([123])$/.exec(st || ''); return m ? [m[1], +m[2]] : ['win', 1]; }

  // page clocks (frames, 60fps)
  const P1 = { SUB: 40, REASON: 48, TALLY: 60, TALLY_END: 120, POSE: 120, COMMENT: 130, NEXT: 170, FINAL: 180, AUTO: 330 };
  // (P2.AUTO keeps "end -> page 3 menu with no input" at about 12.5 s)
  const P2 = { ROW: 8, STEP: 8, GOLD: 56, ZONE: 56, ZONE_END: 86, WEAK: 86, NEXT: 90, FINAL: 90, AUTO: 110 };
  const P3 = { BAR: 8, STEP: 16, PERFECT: 76, STAMP: 106, LAND: 110, TIP: 110 };
  // reduced motion: [frames, et] steps; after the last step et = max(t, final)
  const STEPS = { 1: [[20, P1.REASON + 8], [40, P1.TALLY_END]], 2: [[20, P2.GOLD], [40, P2.ZONE_END]], 3: [[20, P3.PERFECT], [40, P3.LAND]] };

  // =====================================================================
  // data (GS.MOCK.result) and the result rules
  // =====================================================================
  const HEAD = {
    win: { text: 'YOU WIN!', x: 64, set: 'H3', drop: false },
    lose: { text: 'YOU LOSE', x: 64, set: 'H0', drop: false },
    draw: { text: 'DRAW GAME', x: 56, set: 'H0', drop: true },
  };
  const SUB = { blue: ['ブルーチームの かち!', 'H1'], orange: ['オレンジチームの かち…', 'H2'], none: ['ひきわけ ごかくの しょうぶ', 'H0'] };
  const REASON = { zone: '陣地30秒確保で 決着', wipe: 'ぜんめつで 決着', timeup: 'タイムアップで 決着', dry: '水ぎれで タイムアップ' };
  const TITLE_RULES = [
    [p => p.ko >= 2, ['しぶきの', 'めいじん']],
    [p => p.capture >= 10, ['じんちの', 'まもりて']],
    [p => p.refilled >= 150, ['みずくみ', 'たつじん']],
    [p => p.weak >= 15, ['ねばりの', 'よわいだま']],
    [() => true, ['ずぶぬれ', 'ルーキー']],
  ];
  const WATER_ROWS = [
    { key: 'shot', label: 'うった水', color: 'gray' },
    { key: 'spilled', label: 'こぼれた水', color: 'frameLo' },
    { key: 'tank', label: 'タンクの水', color: 'waterHi' },
    { key: 'left', label: 'のこった水', color: 'water' },
  ];
  const MARK = { win: '●', lose: '○', draw: '△' };
  const RECORD_CELLS = 8;   // せんせき line on page 3: x184..247 in F8 cells
  const other = team => (team === 'blue' ? 'orange' : 'blue');
  const fx1 = v => (R((+v || 0) * 10) / 10).toFixed(1);
  const pad0 = (n, w) => GS.pad(R(+n || 0), w, '0');

  // largest remainder: integers proportional to vals that add up exactly to total
  function largestRemainder(vals, total) {
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const q = vals.map(v => (v * total) / sum), out = q.map(v => F(v + 1e-9));
    let left = total - out.reduce((a, b) => a + b, 0);
    const order = q.map((v, i) => [v - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]]++;
    return out;
  }

  function commentFor(o, D) {
    if (o === 'win') return 'やった! チームの しょうり!';
    if (o === 'draw') return 'つぎの 一戦で けっちゃくを';
    const own = D.capture[D.youTeam], opp = D.capture[other(D.youTeam)];
    if (own >= 25) return 'あと ' + fx1(30 - own) + '秒 とどかなかった';
    // the gap: live from the raw scores (D.captureRaw), the mock from its numbers; cut down to 0.1, at least 0.1
    const rc = D.captureRaw, gap = rc ? rc[other(D.youTeam)] - rc[D.youTeam] : opp - own;
    if ((D.reason === 'timeup' || D.reason === 'dry') && gap > 0) return '確保タイム ' + Math.max(0.1, F(gap * 10 + 1e-6) / 10).toFixed(1) + '秒の さ…';
    return 'つぎで とりかえそう!';
  }
  function tipFor(o, you) {
    if (o === 'win') return you.ko >= 1 ? you.ko + 'にん たおした! ナイス!' : 'この ちょうしで もう一戦!';
    if (you.refilled < 15) return '先に もどる水を きめよう';
    if (you.capture < 2) return 'ほきゅうしたら 中央へ!';
    return 'はやめに 陣地へ もどろう';
  }
  function titleFor(you) { for (const [test, lines] of TITLE_RULES) if (test(you)) return lines; return ['', '']; }
  function check(o, what, mine, theirs) {
    if (theirs == null) return;
    const a = Array.isArray(mine) ? mine.join('/') : mine, b = Array.isArray(theirs) ? theirs.join('/') : theirs;
    if (a !== b) GS.warnOnce('result:' + o + what, '[result] ' + o + ' ' + what + ': rule gives', JSON.stringify(a), 'but GS.MOCK.result has', JSON.stringify(b));
  }

  // ---------------------------------------------------------------- data variants
  // The state id only names the outcome (win / lose / draw). Play's mock end-final (FINAL SPLASH!: TIME 35,
  // capture 22.6 / 11.2, ORANGE alive 0) also lands on win-1, but GS.MOCK.result.win is the 30-second-capture
  // win (TIME 62.4, 30.0 / 11.2). So params.from = 'end-final' selects the variant 'winWipe', derived here from
  // the win data so the numbers stay consistent:
  //  - reason wipe ('ぜんめつで 決着'), TIME 90 - 35 = 55.0, capture BLUE 22.6 / ORANGE 11.2, alive 2-0
  //  - カイ (the last ORANGE) is splashed by YOU: YOU ko 1 -> 2, so BLUE KOs (2+1+0) = ORANGE down (3)
  //  - game.mjs discards a KO'd player's tank water (discardedWater): カイ's 24 moves from タンクの水 to
  //    こぼれた水 (96 -> 120, 120 -> 96); the total stays 1200
  //  - title / tip follow the rules: ko >= 2 -> 'しぶきの めいじん', '2にん たおした! ナイス!'
  const VARIANT_OF = { 'end-final': 'winWipe' };
  const VARIANT_OUTCOME = { winWipe: 'win' };
  function localWinWipe(base) {
    const players = (base.players || []).map(p => Object.assign({}, p));
    let spill = 0, kos = 0;
    players.forEach((p, i) => {
      const team = p.team || (i < 3 ? 'blue' : 'orange');
      if (team === 'orange' && p.alive !== false) { spill += +p.tank || 0; p.alive = false; p.tank = 0; kos++; }
    });
    const you = players.find(p => p.self) || players[0];
    if (you) you.ko = (+you.ko || 0) + kos;
    const w = Object.assign({ shot: 0, spilled: 0, tank: 0, left: 0, total: 1200 }, base.water || {});
    w.spilled += spill; w.tank -= spill;
    const ko = you ? you.ko : 0;
    return Object.assign({}, base, {
      players, water: w, outcome: 'win', reason: 'wipe', reasonText: REASON.wipe, time: 90 - 35,
      capture: { blue: 22.6, orange: 11.2 }, alive: { blue: 2, orange: 0 },
      titleLines: ko >= 2 ? ['しぶきの', 'めいじん'] : base.titleLines, tip: ko + 'にん たおした! ナイス!',
    });
  }
  function mockFor(o, variant) {
    const all = (GS.MOCK && GS.MOCK.result) || {};
    if (variant && VARIANT_OUTCOME[variant] === o) {
      if (all[variant]) return all[variant];
      if (variant === 'winWipe') return localWinWipe(all.win || {});
    }
    return all[o] || {};
  }

  // src: a data set in the GS.MOCK.result format (live: liveSource()); without it, the mock of outcome o
  function data(o, variant, src) {
    if (src || (variant && VARIANT_OUTCOME[variant] !== o)) variant = null;
    const M = src || mockFor(o, variant);
    const ck = variant || o;   // warnOnce key
    const players = (M.players || []).map((p, i) => Object.assign({ name16: GS.NAME16[i], name8: GS.NAME8[i], team: i < 3 ? 'blue' : 'orange', alive: true }, p));
    const you = players.find(p => p.self) || players[0] || { ko: 0, refilled: 0, capture: 0, weak: 0, shot: 0, team: 'blue' };
    const D = { o, variant: variant || null, players, you, youTeam: you.team || 'blue' };
    D.winner = o === 'draw' ? null : o === 'win' ? D.youTeam : other(D.youTeam);
    D.capture = Object.assign({ blue: 0, orange: 0 }, M.capture || {});
    D.captureRaw = M.captureRaw ? Object.assign({ blue: 0, orange: 0 }, M.captureRaw) : null;
    D.time = M.time == null ? 90 : M.time;
    D.reason = M.reason || 'timeup';
    D.reasonText = M.reasonText || REASON[D.reason] || REASON.timeup;
    const sub = SUB[D.winner || 'none'];
    D.sub = sub[0]; D.subSet = sub[1];
    D.comment = commentFor(o, D);
    // a win that opened the next stage (live: M.opened, its id) says so in gold in place of the tip
    const opened = M.opened ? GS.stage(M.opened) : null;
    D.tip = opened ? opened.levelRom + 'が あそべる!' : tipFor(o, you);
    D.tipSet = opened ? 'H3' : 'H0';
    D.titleLines = titleFor(you);
    check(ck, 'sub', D.sub, M.sub); check(ck, 'comment', D.comment, M.comment); check(ck, 'tip', D.tip, M.tip); check(ck, 'title', D.titleLines, M.titleLines);
    // M.jingle null (live: play's end banner already played it) = no jingle on page 1
    D.jingle = M.jingle !== undefined ? M.jingle : o === 'draw' ? 'draw' : o;
    // water: display values and bar pixels both by the largest remainder method. The total is the
    // stage's initial water (game.mjs initialTotalWater), the bar is 192px = total. ぴったり! only when the
    // four parts really add up to it (|sum - total| < 0.5); otherwise each part is shown as it is.
    const w = M.water || {};
    D.total = w.total || 1200;
    const vals = WATER_ROWS.map(r => Math.max(0, +w[r.key] || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    D.perfect = Math.abs(sum - D.total) < 0.5;
    if (!D.perfect) GS.warnOnce('result:water' + ck + sum, '[result] water parts add up to', sum, 'not', D.total, '(no ぴったり!)');
    const shown = largestRemainder(vals, D.perfect ? D.total : R(sum));
    const px = largestRemainder(vals, D.perfect ? 192 : Math.min(192, R((192 * sum) / D.total)));
    D.water = WATER_ROWS.map((r, i) => Object.assign({}, r, { v: vals[i], shown: shown[i], px: px[i] }));
    // max of each column (ties are all gold; a column of zeros has no gold)
    const mx = k => Math.max(0, ...players.map(p => +p[k] || 0));
    D.max = { ko: mx('ko'), hit: mx('hit'), shot: mx('shot'), refilled: mx('refilled'), capture: mx('capture') };
    // this session's record (not saved): ● win, ○ lose, △ draw (draws do not count)
    // Marks start at x184 and the line must end by x248 (8 F8 cells: marks, a space, the score), so a long
    // session shows only its latest marks; the score always counts the whole session.
    const rec = Array.isArray(M.record) ? M.record : [];
    const wins = rec.filter(r => r === 'win').length, losses = rec.filter(r => r === 'lose').length;
    D.recordScore = rec.length ? wins + '-' + losses : '';
    D.record = rec.slice(-Math.max(1, RECORD_CELLS - 1 - D.recordScore.length)).map(r => MARK[r] || '');
    if (!rec.length && M.recordText) { D.record = Array.from(String(M.recordText).split(' ')[0]); D.recordScore = String(M.recordText).split(' ')[1] || ''; }
    D.p3Final = P3.TIP + Array.from(D.tip).length * 2;
    return D;
  }

  // ---------------------------------------------------------------- live data (GS.app)
  // Play's end banner already plays win / lose / draw, so page 1 of a live result never plays it again.
  const REASON_OF = { '全滅': 'wipe', '陣地を30秒確保': 'zone', 'タイムアップ': 'timeup', '最終局面終了': 'dry' };
  const TEAM_OF = ['blue', 'orange'];
  // to 0.1, nearest (time, a player's ZONE)
  const tenth = v => R((+v || 0) * 10) / 10;
  // to 0.1, cut down: the team capture time, the same formula as the HUD (GS.fixed1), so the end banner,
  // page 1 and page 2 show the same numbers (and 29.96 never shows as 30.0).
  const trunc1 = v => F((+v || 0) * 10 + 1e-6) / 10;
  const count = (v, max) => GS.clamp(R(+v || 0), 0, max);   // the table has 2 (KO) / 3 digits
  // GS.app.resultSnapshot() (+ session.record) -> a data set in the GS.MOCK.result format for data().
  // Rows: BLUE (team 0) then ORANGE (team 1), by id. Names: game.mjs actor names ('YOU', 'アオ', ...) -> GS.NAME16 / NAME8.
  function liveSource(snap, record) {
    snap = snap || {};
    const acts = (snap.actors || []).slice().sort((a, b) => (a.team - b.team) || (a.id - b.id));
    const human = acts.find(a => a.human) || acts.find(a => a.id === 0) || acts[0] || { team: 0 };
    const winner = snap.winner == null ? null : +snap.winner;
    const outcome = winner === null ? 'draw' : winner === human.team ? 'win' : 'lose';
    const byCapture = winner !== null && snap.reason !== '全滅';
    const sc = snap.scores || [0, 0], w = snap.water || {};
    // Both teams are cut down like the HUD. Only when the capture decided the match (30 s, time up, final phase)
    // and both cut values are the same (a gap under 0.1 s) does the winner get +0.1, so the tally never reads
    // as a tie or the wrong way round.
    const cap = [trunc1(sc[0]), trunc1(sc[1])];
    if (byCapture && (winner === 0 || winner === 1) && cap[0] === cap[1]) cap[winner] = R(cap[winner] * 10 + 1) / 10;
    let tank = 0;
    const players = acts.map(a => {
      const s = a.stats || {}, k = GS.NAME16.indexOf(a.name) >= 0 ? GS.NAME16.indexOf(a.name) : a.id;
      if (a.alive) tank += Math.max(0, +a.water || 0);
      return {
        name16: GS.NAME16[k] || String(a.name || '?'), name8: GS.NAME8[k] || String(a.name || '?'),
        team: TEAM_OF[a.team] || 'blue', self: a === human, alive: !!a.alive, tank: a.alive ? Math.max(0, +a.water || 0) : 0,
        ko: count(s.kills, 99), hit: count(s.hits, 999), shot: count(s.shots, 999), weak: count(s.weakShots, 999),
        refilled: count(s.refilled, 999), capture: Math.min(99.9, tenth(s.capture)),
      };
    });
    if (snap.reason && !REASON_OF[snap.reason]) GS.warnOnce('result:reason' + snap.reason, '[result] unknown game.reason', JSON.stringify(snap.reason), '-> タイムアップ');
    return {
      live: true, outcome, stage: snap.stage || null, players, record: (record || []).slice(),
      reason: REASON_OF[snap.reason] || 'timeup', time: GS.clamp(tenth(snap.time), 0, 99.9),
      capture: { blue: Math.min(99.9, cap[0]), orange: Math.min(99.9, cap[1]) },
      // the raw scores, for the comment '確保タイム {差}秒の さ…' (the real gap, not the gap of the shown numbers)
      captureRaw: { blue: +sc[0] || 0, orange: +sc[1] || 0 },
      // game.mjs: initial = used + discarded + Σ water of the living + remaining
      water: { shot: +w.used || 0, spilled: +w.discarded || 0, tank, left: +w.remaining || 0, total: R(+w.initial || 0) || 1200 },
      jingle: null,
      opened: snap.opened || null,   // the stage this win opened (GS.app stage progress)
    };
  }
  // The live data set for a result entered with params.live, or null (no GS.app / not live / error -> mock).
  function liveFromApp() {
    const app = GS.app;
    if (!app || !app.live || typeof app.resultSnapshot !== 'function') return null;
    try {
      // play calls recordResult() when it hands over; it stores each round once, so this is only a safety net
      if (typeof app.recordResult === 'function') app.recordResult();
      const rec = app.session && Array.isArray(app.session.record) ? app.session.record : [];
      return liveSource(app.resultSnapshot(), rec);
    } catch (e) {
      console.error('[result] GS.app.resultSnapshot() failed, showing the mock data', e);
      return null;
    }
  }

  function finalOf(p, D) { return p === 1 ? P1.FINAL : p === 2 ? P2.FINAL : D.p3Final; }
  function etAt(p, t, skipAdd, D) {
    let e = t + (skipAdd || 0);
    if (red()) {
      const fin = finalOf(p, D), st = STEPS[p];
      let m = Math.max(t, fin);
      for (const [lim, v] of st) if (t < lim) { m = v; break; }
      e = Math.max(e, m);
    }
    return e;
  }

  // sound events per page
  function eventsFor(p, D) {
    const ev = [], add = (t, sfx, extra) => ev.push(Object.assign({ t, sfx }, extra || {}));
    if (p === 1) {
      if (D.jingle) add(0, D.jingle, { always: true });   // jingle together with the fade-in of page 1 (not live)
      const top = Math.max(F(D.capture.blue), F(D.capture.orange));
      for (let tt = P1.TALLY; tt < P1.TALLY_END; tt += 4) if (F((tt - P1.TALLY) / 2) <= top) add(tt, 'tally');
      add(P1.TALLY_END, 'line');
    } else if (p === 2) {
      for (let i = 0; i < 6; i++) add(P2.ROW + i * P2.STEP, 'tally');
      add(P2.GOLD, 'line');
      for (let tt = P2.ZONE + 4; tt < P2.ZONE_END; tt += 4) add(tt, 'tally');
      add(P2.ZONE_END, 'line');
    } else {
      D.water.forEach((w, i) => { const s = P3.BAR + i * P3.STEP; for (let k = 0; k < P3.STEP; k += 4) add(s + k, 'tally'); add(s + P3.STEP, 'line'); });
      add(P3.PERFECT, D.perfect ? 'total' : 'line');
      add(P3.LAND, 'stamp', { shake: true });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  // =====================================================================
  // drawing helpers
  // =====================================================================
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const WC = {};
  function waterCanvas(kind) {
    if (WC[kind]) return WC[kind];
    const cv = GS.makeCanvas(256, 80), c = cv.getContext('2d'), rnd = lcg(kind === 'win' ? 731 : 1994);
    if (kind === 'win') {
      GS.gradRows(c, 0, 79, ['water', 'waterDk', 'waterDeep']);
      GS.rect(c, 0, 0, 256, 1, 'waterHi');
      GS.rect(c, 0, 1, 256, 1, 'waterShallow');
    } else {
      GS.rect(c, 0, 0, 256, 80, 'waterDk');
      GS.rect(c, 0, 0, 256, 1, 'sky5');
      GS.rect(c, 0, 1, 256, 4, 'waterDeep');
    }
    const cols = kind === 'win' ? ['waterHi', 'waterShallow', 'foam', 'water'] : ['waterDeep', 'water', 'waterShallow', 'waterDeep'];
    for (let y = 5; y < 80; y += y < 30 ? 3 : 4) {
      for (let x = F(rnd() * 24); x < 256; x += 20 + F(rnd() * 34)) {
        GS.rect(c, x, y, 2 + F(y / 14) + F(rnd() * 4), 1, cols[F(rnd() * cols.length)]);
      }
    }
    return (WC[kind] = cv);
  }
  function cloud(c, x, y, s) {
    GS.ellipse(c, x, y, 9 * s, 4 * s, 'white', { fill: true });
    GS.ellipse(c, x + 9 * s, y - 3 * s, 8 * s, 6 * s, 'white', { fill: true });
    GS.ellipse(c, x + 19 * s, y, 8 * s, 4 * s, 'white', { fill: true });
    GS.rect(c, x - 8 * s, y + 3 * s, 34 * s, 1, 'win2');
  }
  function skyWin(L, t) {
    GS.gradRows(L.bg1, 0, 143, ['win1', 'win2']);
    cloud(L.bg1, 208, 50, 1); cloud(L.bg1, 18, 128, 1); cloud(L.bg1, 120, 134, 2); cloud(L.bg1, 222, 124, 1);
    GS.rect(L.bg1, 0, 144, 256, 80, 'waterDk');
    L.bg2.drawImage(waterCanvas('win'), 0, 144);
  }
  const RAIN = [[12, 8], [70, 30], [130, 4], [190, 40], [244, 16], [40, 70], [100, 92], [160, 64], [222, 104], [20, 124], [84, 148], [200, 156]];
  function skyLose(L) {
    GS.gradRows(L.bg1, 0, 143, ['lose1', 'lose2']);
    GS.rect(L.bg1, 0, 144, 256, 80, 'lose1');
    GS.rect(L.bg1, 0, 144, 256, 1, 'grayDk');
    // wet ground: flat ripples (static)
    [[40, 196, 14], [116, 212, 10], [176, 192, 12], [228, 214, 9], [80, 184, 7]].forEach(([x, y, r]) => GS.ellipse(L.bg1, x, y, r, R(r / 4), 'lose2'));
  }
  function rain(c, t) {
    const s = red() ? 0 : F(t / 4);   // moves every 4f
    RAIN.forEach(([x0, y0]) => {
      const y = ((((y0 + s * 10) % 240) + 240) % 240) - 8, x = ((((x0 - s * 5) % 272) + 272) % 272) - 8;
      GS.line(c, x + 4, y, x, y + 7, 'rain');
    });
  }
  const REFL = ['sun', 'sky5', 'waterHi', 'water'];
  const JIT = [0, 1, -1, 0, 2, -1, 1, -2];
  function skyDraw(L, t) {   // the same dusk as the title (own simplified copy)
    GS.gradRows(L.bg1, 0, 143, ['sky1', 'sky2', 'sky3', 'sky4', 'sky5']);
    GS.circle(L.bg1, 200, 130, 12, 'sun', { fill: true });
    const rnd = lcg(42);
    for (let x = 0; x < 256;) { const w = 10 + F(rnd() * 20), h = 2 + F(rnd() * 10); GS.rect(L.bg1, x, 144 - h - 4, w, h + 4, 'sky2'); x += w + F(rnd() * 8); }
    for (let x = 0; x < 256;) { const w = 14 + F(rnd() * 22), h = 2 + F(rnd() * 6); GS.rect(L.bg1, x, 144 - h, w, h, 'sky1'); x += w + F(rnd() * 10); }
    GS.rect(L.bg1, 0, 144, 256, 80, 'waterDk');
    L.bg2.drawImage(waterCanvas('dusk'), 0, 144);
    const f = red() ? 0 : t;
    for (let i = 0, y = 146; y < 224; y += 2, i++) {
      const w = 4 + F((y - 144) / 5) + ((i * 7) % 5);
      GS.rect(L.bg2, 200 - (w >> 1) + JIT[i % 8], y, w, 1, REFL[(i + F(f / 8)) % 4]);
    }
  }
  // podium (bg1). The water on bg2 gets a hole so the podium shows through.
  function podium(L, x, w, top) {
    const h = 176 - top;
    GS.rect(L.bg1, x, top, w, h, 'ink');
    GS.rect(L.bg1, x + 1, top + 1, w - 2, 2, 'pumpMetal');
    GS.rect(L.bg1, x + 1, top + 3, w - 2, h - 4, 'grayDk');
    for (let px = x + 12; px < x + w - 4; px += 24) GS.rect(L.bg1, px, top + 5, 1, h - 7, 'dim');
    L.bg2.clearRect(x, top, w, h);
  }
  const PODIUM = { blue: 16, orange: 132 };
  function drawScene(L, D, t) {
    if (D.o === 'win') skyWin(L, t); else if (D.o === 'lose') skyLose(L); else skyDraw(L, t);
    ['blue', 'orange'].forEach(team => podium(L, PODIUM[team], 108, D.winner === team ? 160 : 168));
    if (D.o === 'lose') rain(L.bg2, t);
    GS.fx.wave = D.o !== 'lose' && !red() ? { y0: 145, y1: 223, amp: 1, period: 32, phase: F(t / 2) } : null;
  }
  // pages 2-3: the game's menu ground (same manner as the stage select): band on bg1, a dotted
  // frameLo grid (16px) and blueDk wave lines on bg2, flowing with fx.wave 1 line every 4f (still when
  // motion is reduced). Low contrast, so the windows on top carry the page.
  let patCv = null;
  function pattern() {
    if (patCv) return patCv;
    patCv = GS.makeCanvas(256, 224);
    const c = patCv.getContext('2d');
    for (let x = 0; x < 256; x += 16) for (let y = 0; y < 224; y += 2) GS.px(c, x, y, 'frameLo');
    for (let y = 0; y < 224; y += 16) for (let x = 0; x < 256; x += 2) GS.px(c, x, y, 'frameLo');
    for (let y0 = 8; y0 < 224; y0 += 32) for (let x = 0; x < 256; x++) GS.px(c, x, y0 + R(2 * Math.sin((x / 32) * Math.PI * 2)), 'blueDk');
    return patCv;
  }
  function drawPlainBg(L, t) {
    GS.rect(L.bg1, 0, 0, 256, 224, 'band');
    L.bg2.drawImage(pattern(), 0, 0);
    GS.fx.wave = red() ? null : { y0: 0, y1: 223, amp: 1, period: 32, phase: F(t / 4) };
  }
  // typewriter (2f per character), the full line stays centred on x128
  function typeText(c, str, y, k, opts) {
    if (k < 0) return;
    const chars = Array.from(str), n = red() ? chars.length : Math.min(chars.length, F(k / 2) + 1);
    const x0 = 128 - (GS.measure16(str) >> 1);
    GS.text16(c, chars.slice(0, n).join(''), x0, y, opts);
  }

  // =====================================================================
  // page 1 「しょうはい」
  // =====================================================================
  const BUST_X = { blue: [24, 56, 88], orange: [136, 168, 200] };
  const CYC = ['waterShallow', 'water', 'waterDk', 'waterHi'];
  function drawHeading(c, o, et) {
    const H = HEAD[o];
    Array.from(H.text).forEach((ch, i) => {
      const k = et - i * 4;
      if (ch === ' ' || k < 0) return;
      let dy = 0;
      if (H.drop && !red()) dy = k < 12 ? R(-16 + 16 * Math.pow((k + 1) / 12, 2)) : k < 14 ? -2 : 0;   // falls 12f, 2px bounce
      GS.banner(c, ch, H.x + i * 16, 16 + dy, { set: H.set });
    });
  }
  function bar(c, x0, v, team, dir, hide) {
    GS.rect(c, x0 - 1, 107, 74, 10, 'ink');
    GS.rect(c, x0, 108, 72, 8, 'dim');
    const w = GS.clamp(R((v * 72) / 30), 0, 72);
    if (w > 0 && !hide) {
      const x = dir > 0 ? x0 : x0 + 72 - w, B = team === 'blue' ? ['blueHi', 'blue', 'blueDk'] : ['orangeHi', 'orange', 'orangeDk'];
      GS.rect(c, x, 108, w, 1, B[0]); GS.rect(c, x, 109, w, 6, B[1]); GS.rect(c, x, 115, w, 1, B[2]);
    }
    [24, 48].forEach(d => { const x = dir > 0 ? x0 + d : x0 + 71 - d; GS.rect(c, x, 108, 1, 2, 'ink'); GS.rect(c, x, 114, 1, 2, 'ink'); });   // 10s / 20s
  }
  function drawCapture(c, D, et) {
    const k = et - P1.TALLY, done = et >= P1.TALLY_END;
    const shown = team => (done ? D.capture[team] : Math.min(F(k / 2), F(D.capture[team])));
    const b = shown('blue'), r = shown('orange');
    GS.text16(c, '確保タイム', 128, 84, { align: 'center', style: 'outline' });
    GS.digits16(c, fx1(b), 48, 104, 'H1', { align: 'right' });
    GS.digits16(c, fx1(r), 208, 104, 'H2');
    // the winner's bar blinks 3 times (10f / 10f) after the tally
    const off = D.winner && done && et < P1.TALLY_END + 60 && !GS.blink(et - P1.TALLY_END, 10, 10);
    bar(c, 52, b, 'blue', 1, off && D.winner === 'blue');
    bar(c, 132, r, 'orange', -1, off && D.winner === 'orange');
  }
  // nozzle / drop points of the bust art (GS.BUST_LAYOUT, sprites-bust.js)
  const bustLayout = (key, i) => GS.BUST_LAYOUT[key][i];
  function waterColumn(c, bx, by, name, flip, f) {
    const m = bustLayout('muzzle', name === 'bust_win2' ? 'win2' : 'win1');
    const mx = bx + (flip ? 31 - m[0] : m[0]), my = by + m[1], top = my - 32, ph = F(f / 8);
    for (let r = 6; r < 32; r++) {   // stream: 2px at the nozzle, 8px at the top; 4 colours cycle every 8f
      const hw = R(1 + ((31 - r) * 3) / 25), y = top + r;
      GS.rect(c, mx - hw, y, hw * 2, 1, CYC[(F(r / 2) + ph) % 4]);
      GS.px(c, mx - hw, y, 'waterHi');
    }
    const crown = ph & 1 ? [[-7, 3], [-4, 0], [0, 1], [3, -1], [6, 2], [-2, 4], [4, 5]] : [[-6, 1], [-3, 3], [1, -1], [4, 2], [7, 4], [-8, 5], [1, 4]];
    crown.forEach(([dx, dy], i) => GS.rect(c, mx + dx - 1, top + dy + 1, 2, 2, i & 1 ? 'water' : 'waterHi'));
  }
  function drip(c, bx, by, name, flip, k) {
    const d = bustLayout('drop', name === 'bust_lose2' ? 'lose2' : 'lose1');
    const ph = ((k % 12) + 12) % 12, x = bx + (flip ? 30 - d[0] : d[0]), y = by + d[1] + F(ph / 2);   // 2px wide, mirrored
    GS.rect(c, x, y, 2, 3, 'water'); GS.px(c, x, y, 'waterHi'); GS.px(c, x + 1, y + 2, 'waterDk');
  }
  function drawBusts(c, D, et, t) {
    const posing = et >= P1.POSE, still = red(), k = et - P1.POSE;
    ['blue', 'orange'].forEach(team => {
      const y = D.winner === team ? 128 : 136, flip = team === 'orange';
      const mode = !posing ? 'ready' : !D.winner ? 'tired' : D.winner === team ? 'win' : 'lose';
      BUST_X[team].forEach((x, i) => {
        let name = 'bust_ready';
        if (mode === 'win') name = !still && F(k / 8) & 1 ? 'bust_win2' : 'bust_win1';
        else if (mode === 'lose') name = !still && F(k / 16) & 1 ? 'bust_lose2' : 'bust_lose1';
        else if (mode === 'tired') name = 'bust_tired';
        if (mode === 'win') waterColumn(c, x, y, name, flip, still ? 0 : t);
        GS.spr(c, name, x, y, { pal: team, flipX: flip });
        if (mode === 'lose' && !still) drip(c, x, y, name, flip, k + i * 4);
      });
    });
  }
  function drawP1(L, D, et, t) {
    drawScene(L, D, t);
    const c = L.hud, o = { align: 'center', style: 'outline' };
    drawHeading(c, D.o, et);
    if (et >= P1.SUB) GS.text16(c, D.sub, 128, 36, Object.assign({ set: D.subSet }, o));
    if (et >= P1.REASON) {
      GS.text16(c, D.reasonText, 128, 56, o);
      GS.text8(c, 'TIME ' + fx1(D.time), 128, 76, o);
    }
    if (et >= P1.TALLY) drawCapture(c, D, et);
    drawBusts(L.obj, D, et, t);
    if (et >= P1.COMMENT) typeText(c, D.comment, 184, et - P1.COMMENT, { style: 'outline' });
    if (et >= P1.NEXT && GS.blink(et - P1.NEXT, 30, 30)) GS.text8(c, '▼', 232, 208, { style: 'outline' });
  }

  // =====================================================================
  // page 2 「せいせきひょう」
  // =====================================================================
  const ROW_Y = [48, 64, 80, 100, 116, 132];
  // Columns: × right after the name (x60), KO x72, HIT/SHOT x92 (x92-155, clear of WATER), the WATER header x160
  // centred over its numbers (x168), ZONE x208-239.
  const COL = { name: 28, x: 60, ko: 72, hit: 92, waterHead: 160, water: 168, zone: 208 };
  function drawP2(L, D, et, t) {
    drawPlainBg(L, t);
    const c = L.hud;
    GS.banner(c, 'RESULT', 80, 8, { set: 'H0' });
    GS.text8(c, '2/3', 216, 8, { set: 'HL' });
    GS.win(c, 8, 24, 240, 160, { fill: 'solid', open: GS.step(et + 1, 0, 6) });
    if (et < 6) return;
    const hd = { set: 'HL' };
    GS.text8(c, 'NAME', COL.name, 36, hd); GS.text8(c, 'KO', COL.ko, 36, hd); GS.text8(c, 'HIT/SHOT', COL.hit, 36, hd);
    GS.text8(c, 'WATER', COL.waterHead, 36, hd); GS.text8(c, 'ZONE', COL.zone, 36, hd);
    GS.rect(c, 16, 97, 224, 1, 'frameLo');
    const gold = et >= P2.GOLD;
    D.players.forEach((p, i) => {
      if (et < P2.ROW + i * P2.STEP || i >= ROW_Y.length) return;
      const y = ROW_Y[i], base = p.alive ? 'H0' : 'HL';
      const g = (k, v) => ({ set: gold && D.max[k] > 0 && v === D.max[k] ? 'H3' : base });
      GS.rect(c, 16, y + 1, 4, 14, p.team === 'orange' ? 'orange' : 'blue');
      if (p.self) GS.text8(c, '▶', 20, y + 4, { set: 'H3' });
      GS.text16(c, p.name16, COL.name, y, { set: base });
      if (!p.alive) GS.text8(c, '×', COL.x, y + 4, { set: 'HL' });
      GS.text8(c, pad0(p.ko, 2), COL.ko, y + 4, g('ko', p.ko));
      GS.text8(c, pad0(p.hit, 3), COL.hit, y + 4, g('hit', p.hit));
      GS.text8(c, '/', COL.hit + 24, y + 4, { set: base });
      GS.text8(c, pad0(p.shot, 3), COL.hit + 32, y + 4, g('shot', p.shot));
      GS.text8(c, pad0(p.refilled, 3), COL.water, y + 4, g('refilled', p.refilled));
      GS.text8(c, GS.pad(fx1(p.capture), 4), COL.zone, y + 4, g('capture', R(p.capture * 10) / 10));
    });
    if (et >= P2.ZONE) {
      const q = red() ? 1 : GS.step(et, P2.ZONE, P2.ZONE_END - P2.ZONE);
      GS.text8(c, 'TEAM ZONE', 28, 156, { set: 'H0' });
      GS.text8(c, GS.pad(fx1(D.capture.blue * q), 4), 120, 156, { set: 'H1' });
      GS.text8(c, '-', 156, 156, { set: 'H0' });
      GS.text8(c, fx1(D.capture.orange * q), 168, 156, { set: 'H2' });
    }
    if (et >= P2.WEAK) GS.text8(c, 'YOU WEAK SHOT ' + R(D.you.weak || 0) + '/' + R(D.you.shot || 0), 28, 168, { set: 'H0' });
    if (et >= P2.NEXT && GS.blink(et - P2.NEXT, 30, 30)) GS.text8(c, '▼', 232, 200, { set: 'H0' });
  }

  // =====================================================================
  // page 3 「水の ゆくえ」
  // =====================================================================
  const stampCv = GS.makeCanvas(96, 36);
  function stampCanvas(lines) {
    const c = stampCv.getContext('2d');
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, 96, 36);
    GS.rect(c, 1, 0, 94, 36, 'ink'); GS.rect(c, 0, 1, 96, 34, 'ink');          // ink frame, corners cut
    GS.rect(c, 2, 2, 92, 32, 'gold');
    GS.rect(c, 2, 2, 92, 1, 'goldHi'); GS.rect(c, 2, 33, 92, 1, 'goldDk');
    GS.text16(c, lines[0] || '', 48, 2, { align: 'center', set: 'HK', style: 'plain', maxW: 80 });
    GS.text16(c, lines[1] || '', 48, 18, { align: 'center', set: 'HK', style: 'plain', maxW: 80 });
    return stampCv;
  }
  // Page 3 layout: the breakdown and the title stamp share window A, the tip and the menu share window B, and the
  // session record sits on the heading line.
  //   heading 「水の ゆくえ」 x16 y8 | せんせき x116 y8 + record x184 y12
  //   window A x8 y24 w240 h112: TOTAL x28 y36 (1200 right-aligned with the row numbers), ぴったり! x144 y32,
  //            bar x32-223 y52-59, rows y64/80/96/112 (swatch x16, name x28, value right-aligned at x140),
  //            title stamp x144-239 y80-115 (to the right of the rows)
  //   window B x8 y144 w240 h72: tip centred y152, rule y171, menu rows y176/y192
  //            (cursor x16/x112, text x32/x128: the 8px cursor gap of the title menu)
  const P3L = {
    winA: [8, 24, 240, 112], winB: [8, 144, 240, 72],
    total: [28, 36], num: 140, perfect: [144, 32], barY: 52, rowY: 64, swatch: 16, name: 28,
    stamp: [192, 98], record: [116, 8, 184, 12], tip: 152, rule: 171,
  };
  // the title (称号): a provisional flourish only, it has no effect on the rules
  function drawStamp(c, D, et) {
    const cv = stampCanvas(D.titleLines), k = et - P3.STAMP;
    const s = red() || k >= 4 ? 1 : k < 2 ? 2 : 1.5;   // 2 frames shrinking, then pressed
    const w = R(96 * s), h = R(36 * s);
    c.drawImage(cv, P3L.stamp[0] - (w >> 1), P3L.stamp[1] - (h >> 1), w, h);
  }
  function drawRecord(c, D, x, y) {
    D.record.forEach((m, i) => GS.text8(c, m, x + i * 8, y, { set: m === '●' ? 'H3' : 'H0', style: 'outline' }));
    if (D.recordScore) GS.text8(c, D.recordScore, x + (D.record.length + 1) * 8, y, { set: 'H0', style: 'outline' });
  }
  // menu 「もういちど」「ステージ選択」／「タイトルへ」 ('／' separates rows, as in the pause menu);
  // GS.menu's spatial mode moves the arrows by position across [A, B] / [C]
  function makeMenu() {
    return GS.menu({
      items: [
        { id: 'retry', label: 'もういちど', x: 32, y: 176, cx: 16 },
        { id: 'stage', label: 'ステージ選択', x: 128, y: 176, cx: 112 },
        { id: 'title', label: 'タイトルへ', x: 32, y: 192, cx: 16 },
      ],
      index: 0, cols: 1, spatial: true,
    });
  }
  function drawP3(L, D, et, t, menu) {
    drawPlainBg(L, t);
    // everything on obj (above bg, under nothing): the stamp is drawn last on the same layer, and the
    // landing shake (bg1, bg2, obj) moves the whole page
    const c = L.obj, open = red() ? 1 : GS.step(et + 1, 0, 6);
    GS.text16(c, '水の ゆくえ', 16, 8, { set: 'H5', style: 'outline' });
    GS.win(c, ...P3L.winA, { fill: 'solid', open });
    GS.win(c, ...P3L.winB, { fill: 'solid', open });
    if (et < 6 && !red()) return;
    GS.text8(c, 'TOTAL', P3L.total[0], P3L.total[1], { set: 'H0' });
    GS.text8(c, GS.pad(D.total, 4), P3L.num, P3L.total[1], { align: 'right', set: 'H0' });
    GS.rect(c, 31, P3L.barY - 1, 194, 10, 'ink');
    GS.rect(c, 32, P3L.barY, 192, 8, 'night');
    let x = 32;
    D.water.forEach((w, i) => {
      const s = P3.BAR + i * P3.STEP;
      if (et >= s) {
        const p = red() ? 1 : GS.step(et, s, P3.STEP), y = P3L.rowY + i * 16;
        GS.rect(c, x, P3L.barY, R(w.px * p), 8, w.color);
        GS.rect(c, P3L.swatch - 1, y + 3, 10, 10, 'ink');
        GS.rect(c, P3L.swatch, y + 4, 8, 8, w.color);
        GS.text16(c, w.label, P3L.name, y, { set: 'H0' });
        GS.text8(c, GS.pad(R(w.shown * p), 4), P3L.num, y + 4, { align: 'right', set: 'H0' });
      }
      x += w.px;
    });
    if (et >= P3.PERFECT && D.perfect) GS.text16(c, 'ぴったり!', P3L.perfect[0], P3L.perfect[1], { set: 'H3' });
    if (et >= P3.TIP) {
      const [lx, ly, rx, ry] = P3L.record;
      GS.text16(c, 'せんせき', lx, ly, { set: 'H0', style: 'outline' });
      drawRecord(c, D, rx, ry);
      typeText(c, D.tip, P3L.tip, et - P3.TIP, { set: D.tipSet });
    }
    if (et >= D.p3Final) {
      for (let rx = 16; rx < 240; rx += 2) GS.px(c, rx, P3L.rule, 'frameLo');   // dotted rule: tip | menu
      if (menu) menu.draw(c, t);
    }
    if (et >= P3.STAMP) drawStamp(c, D, et);
  }

  function drawPage(L, p, D, et, t, menu) {
    if (p === 1) drawP1(L, D, et, t);
    else if (p === 2) drawP2(L, D, et, t);
    else drawP3(L, D, et, t, menu);
  }

  // =====================================================================
  // runtime
  // =====================================================================
  const S = { o: 'win', page: 1, variant: null, D: null, skipAdd: 0, lastEt: -1, events: [], leave: null, menu: null, live: false, src: null };
  const TARGET = { retry: ['play', 'countdown', { from: 'result' }], stage: ['title', 'stage1', { fade: true }], title: ['title', 'title', {}] };
  const LIVE_TARGET = { retry: 'retry', stage: 'toStageSelect', title: 'toTitle' };   // GS.app methods (live)

  function curEt(t) { return etAt(S.page, t, S.skipAdd, S.D); }
  function fire(prev, et) {
    if (et <= prev) return;
    const hit = S.events.filter(e => e.t > prev && e.t <= et);
    if (!hit.length) return;
    if (et - prev <= 1) { hit.forEach(e => { GS.sfx(e.sfx); if (e.shake) GS.shake(2, 4); }); return; }
    // a jump (skip / reduced motion): the always-events plus only the last sound, no shake
    hit.filter(e => e.always).forEach(e => GS.sfx(e.sfx));
    const last = hit.filter(e => !e.always).pop();
    if (last) GS.sfx(last.sfx);
  }
  function skip(t) { const fin = finalOf(S.page, S.D); if (curEt(t) < fin) S.skipAdd = fin - t; }
  function leave(frames, fn) { S.leave = { n: 0, frames, fn }; }
  function nextPage() {
    const to = S.o + '-' + (S.page + 1);
    GS.transition('pageOut');
    const params = S.live ? { page: true, live: true, src: S.src } : { page: true, variant: S.variant };
    leave(8, () => GS.go('result', to, params));
  }
  function goTarget(id) {
    const [scr, st, params] = TARGET[id] || TARGET.title;
    GS.sfx('ok');
    GS.transition('fadeOut', { frames: 32 });
    leave(32, () => {
      if (S.live) GS.app[LIVE_TARGET[id] || 'toTitle']();
      else GS.go(scr, st, Object.assign({}, params));
    });
  }
  function sayText(p, D) {
    if (p === 1) return D.sub + ' ' + D.reasonText + '。' + 'TIME ' + fx1(D.time);
    if (p === 2) return 'せいせきひょう。YOU KO ' + R(D.you.ko || 0) + '、HIT ' + R(D.you.hit || 0) + '/' + R(D.you.shot || 0);
    return '水の ゆくえ。しょうごう「' + D.titleLines.join(' ') + '」。' + D.tip;
  }

  const ANCHORS = {
    1: {
      heading: [128, 24], sub: [128, 44], reason: [128, 64], time: [128, 80], captureLabel: [128, 92],
      blueTime: [32, 112], blueBar: [88, 112], orangeBar: [168, 112], orangeTime: [224, 112],
      blueTeam: [72, 148], orangeTeam: [184, 148], podium: [72, 172], comment: [128, 192], next: [236, 212],
    },
    2: {
      heading: [128, 16], page: [228, 12], window: [128, 104], columns: [128, 40], self: [24, 52], team: [18, 56],
      defeated: [64, 88], gold: [104, 68], teamZone: [96, 160], weak: [100, 172], next: [236, 204],
    },
    3: {
      heading: [56, 16], record: [180, 16], window: [128, 80], total: [40, 40], perfect: [180, 40], bar: [128, 56],
      rows: [72, 96], swatch: [20, 68], value: [124, 68], title: [192, 98], tip: [128, 160], menu: [128, 192], cursor: [20, 180],
    },
  };
  const anchors = {};
  STATES.forEach(s => { anchors[s] = ANCHORS[parse(s)[1]]; });

  GS.registerScreen('result', {
    title: 'リザルト',
    states: STATES,
    labels: LABELS,
    anchors,
    // BGM 04 after the decision's jingle, on all three pages (it goes on from page to page)
    bgm() { return 'result'; },
    enter(st, params) {
      let [o, p] = parse(st);
      params = params || {};
      // live: the real match (page 1 reads the snapshot, pages 2-3 get the same data set in params.src).
      // The snapshot's winner decides the outcome; a different state id only warns.
      const src = params.live === true ? (params.src && params.src.live ? params.src : liveFromApp()) : null;
      if (src && src.outcome !== o) {
        GS.warnOnce('result:outcome' + st + src.outcome, '[result]', st, 'entered, but the snapshot is a', src.outcome, '- showing', src.outcome);
        o = src.outcome;
      }
      // which mock data set: params.variant (carried from page to page), else derived from the decision (params.from)
      const want = src ? null : params.variant || VARIANT_OF[params.from] || null;
      const variant = want && VARIANT_OUTCOME[want] === o ? want : null;
      Object.assign(S, { o, page: p, variant, live: !!src, src, D: data(o, variant, src), skipAdd: 0, lastEt: -1, leave: null, params });
      S.events = eventsFor(p, S.D);
      S.menu = p === 3 ? makeMenu() : null;
      if (S.menu) GS.activeMenu = S.menu;   // deck buttons pick on this menu even before the page is complete
      if (params.page) GS.transition('pageIn');
      else GS.transition('fadeIn', { frames: 16 });   // black (play) -> 16f fade-in
      GS.shell.say(sayText(p, S.D));
    },
    update(t, input) {
      if (!S.D) return;
      if (S.leave) { if (++S.leave.n >= S.leave.frames) { const fn = S.leave.fn; S.leave = null; fn(); } return; }
      const et = curEt(t);
      fire(S.lastEt, et);
      S.lastEt = et;
      if (input.pressed('restart')) { goTarget('retry'); return; }
      const fin = finalOf(S.page, S.D);
      if (S.page < 3) {
        if (et < fin) { if (input.pressed('any')) skip(t); return; }
        if (input.pressed('any') || et >= (S.page === 1 ? P1.AUTO : P2.AUTO)) nextPage();
        return;
      }
      const m = S.menu;
      m.setIndex(m.index);   // keeps the deck's menu in sync (no-op when nothing changed)
      if (et < fin) {
        if (m._pick == null) { if (input.pressed('any')) skip(t); return; }
        skip(t);             // a deck button: finish the page and take the choice right away
      }
      const id = m.update(input);
      if (id) goTarget(id);
    },
    draw(L, t) {
      if (!S.D) return;
      drawPage(L, S.page, S.D, curEt(t), t, S.menu);
    },
    still(st, L) {
      const [o, p] = parse(st), D = data(o);
      drawPage(L, p, D, finalOf(p, D), 0, p === 3 ? makeMenu() : null);
    },
    deck(st) { return { type: parse(st)[1] === 3 ? 'menu' : 'next' }; },
    legend(st) {
      return {
        pc: 'Enter：つぎへ・けってい ／ ↑↓←→：えらぶ ／ R：もういちど',
        touch: parse(st)[1] === 3 ? '下のボタンで えらんでね' : 'がめんの どこを タッチしても つぎへ',
      };
    },
  });
  GS.screens.result._debug = () => ({ o: S.o, page: S.page, variant: S.variant, live: S.live, et: S.D ? curEt(GS.current.t) : null, skipAdd: S.skipAdd, leave: !!S.leave, menu: S.menu && S.menu.index });
  GS.screens.result.dataFor = data;   // for the manual: GS.screens.result.dataFor('win') / ('win', 'winWipe')
  GS.screens.result.liveSource = liveSource;   // (snapshot, record) -> data set; dataFor(o, null, set)

  // =====================================================================
  // live self-test (console): GS.screens.result._liveSelfTest()
  // =====================================================================
  // Feeds synthetic snapshots (GS.app.resultSnapshot() shape: every outcome x reason, and extreme values) through liveSource()
  // + data() and draws the three pages at their final state off screen (the mock states first, as a baseline).
  // Each row lists what the rules gave and `issues`: text outside the action-safe area x8-247 / y8-215, text
  // boxes that overlap (the title stamp counts as a box), a J16 line over 224px, a kanji outside the 44, a rule
  // result that differs from the case's expectation, and every console.warn raised meanwhile.
  function synth(c) {
    const names = ['YOU', 'アオ', 'ミオ', 'カイ', 'レン', 'ナギ'], dead = c.dead || [], st = c.stats || {};
    const base = { shots: 30, weakShots: 8, hits: 19, kills: 1, refilled: 48, capture: 12.4 };
    const actors = names.map((name, id) => {
      const alive = dead.indexOf(id) < 0;
      return { id, name, team: id < 3 ? 0 : 1, human: id === 0, alive, water: alive ? (c.tank == null ? 35 : c.tank) : 0, stats: Object.assign({}, base, st.all, st[id]) };
    });
    const initial = c.initial || 1200, used = c.used == null ? 470 : c.used, discarded = c.discarded == null ? 96 : c.discarded;
    const tank = actors.reduce((s, a) => s + a.water, 0);
    return { stage: { id: 'tutorial', name: 'はじまりの中庭', level: '入門' }, winner: c.winner, reason: c.reason, time: c.time, scores: c.scores, actors,
      water: { used, discarded, remaining: initial - used - discarded - tank + (c.leak || 0), initial } };
  }
  const recOf = (w, l, d) => [].concat(Array(w).fill('win'), Array(l).fill('lose'), Array(d || 0).fill('draw'));
  const SELF_CASES = [
    ['win 全滅', { winner: 0, reason: '全滅', time: 41.27, scores: [12.4, 8], dead: [2, 3, 4, 5], stats: { 0: { kills: 2 } } }, ['win'],
      { o: 'win', reason: REASON.wipe, title: 'しぶきの/めいじん', tip: '2にん たおした! ナイス!', time: '41.3' }],
    ['win 全滅 確保は負け', { winner: 0, reason: '全滅', time: 63.72, scores: [24.4166, 25.1666], dead: [3, 4, 5] }, ['win'], { capture: '24.4/25.1' }],
    ['win 陣地', { winner: 0, reason: '陣地を30秒確保', time: 62.43, scores: [29.999999995, 29.96] }, ['lose', 'win'],
      { reason: REASON.zone, capture: '30.0/29.9', comment: 'やった! チームの しょうり!', record: '○● 1-1' }],
    ['win タイムアップ 1f差', { winner: 0, reason: 'タイムアップ', time: 90, scores: [17.5 + 1 / 60, 17.5], stats: { 0: { kills: 0 } } }, ['win'],
      { reason: REASON.timeup, capture: '17.6/17.5', tip: 'この ちょうしで もう一戦!', time: '90.0' }],
    ['win 最終局面', { winner: 0, reason: '最終局面終了', time: 76.2, scores: [20, 3.3], tank: 0, used: 1104 }, ['win'], { reason: REASON.dry, water: '1104+96+0+0' }],
    ['win 最終局面 HUDと同じ', { winner: 0, reason: '最終局面終了', time: 80.5, scores: [21.333, 0.967] }, ['win'], { capture: '21.3/0.9' }],
    ['lose 全滅 YOU down', { winner: 1, reason: '全滅', time: 33.3, scores: [2, 9.5], dead: [0, 1, 2] }, ['lose'],
      { o: 'lose', sub: SUB.orange[0], comment: 'つぎで とりかえそう!' }],
    ['lose 陣地', { winner: 1, reason: '陣地を30秒確保', time: 80.1, scores: [25.31, 30] }, ['lose'], { comment: 'あと 4.7秒 とどかなかった', capture: '25.3/30.0' }],
    ['lose タイムアップ', { winner: 1, reason: 'タイムアップ', time: 90, scores: [18.6, 25] }, ['win', 'win', 'lose'],
      { comment: '確保タイム 6.4秒の さ…', tip: 'はやめに 陣地へ もどろう', record: '●●○ 2-1' }],
    ['lose タイムアップ 端数', { winner: 1, reason: 'タイムアップ', time: 90, scores: [18.69, 25.01] }, ['lose'], { comment: '確保タイム 6.3秒の さ…', capture: '18.6/25.0' }],
    ['lose 最終局面 1f差', { winner: 1, reason: '最終局面終了', time: 88.4, scores: [3, 3 + 1 / 60] }, ['lose'], { comment: '確保タイム 0.1秒の さ…', capture: '3.0/3.1' }],
    ['draw タイムアップ', { winner: null, reason: 'タイムアップ', time: 90, scores: [17.5, 17.5] }, ['win', 'lose', 'draw'],
      { o: 'draw', sub: SUB.none[0], comment: 'つぎの 一戦で けっちゃくを', title: 'じんちの/まもりて', record: '●○△ 1-1' }],
    ['draw 最終局面', { winner: null, reason: '最終局面終了', time: 79, scores: [0, 0] }, ['draw'], { reason: REASON.dry, record: '△ 0-0' }],
    ['draw 全滅 (両方)', { winner: null, reason: '全滅', time: 50.5, scores: [4, 4], dead: [0, 1, 2, 3, 4, 5] }, ['draw'], { o: 'draw', reason: REASON.wipe }],
    ['0 shot / 0 water', { winner: 1, reason: 'タイムアップ', time: 90, scores: [0, 1 / 60], used: 0, discarded: 0, tank: 0,
      stats: { all: { shots: 0, weakShots: 0, hits: 0, kills: 0, refilled: 0, capture: 0 } } }, ['lose'],
      { title: 'ずぶぬれ/ルーキー', tip: '先に もどる水を きめよう', capture: '0.0/0.1' }],
    ['max values', { winner: 0, reason: '陣地を30秒確保', time: 90, scores: [30, 0], used: 1000, discarded: 200, tank: 0,
      stats: { all: { shots: 450, weakShots: 150, hits: 1234, kills: 3, refilled: 1500, capture: 30 } } }, recOf(10, 1, 1),
      { title: 'しぶきの/めいじん', tip: '3にん たおした! ナイス!', record: '●○△ 10-1' }],
    ['long session', { winner: 1, reason: 'タイムアップ', time: 90, scores: [10, 20], stats: { 0: { refilled: 10.4 } } }, recOf(12, 11, 3),
      { tip: '先に もどる水を きめよう', record: '△△ 12-11' }],
    ['initial 1500, fractions', { winner: 0, reason: '全滅', time: 12.04, scores: [0, 0], dead: [3, 4, 5], initial: 1500, used: 465, discarded: 37.83, tank: 12.345,
      stats: { 0: { refilled: 47.6, capture: 9.96 } } }, ['win'], { total: 1500, capture: '0.0/0.0', time: '12.0', title: 'じんちの/まもりて' }],
  ];
  const SELF_LEAK = ['water not conserved', { winner: 0, reason: 'タイムアップ', time: 90, scores: [20, 10], leak: 7 }, ['win'], { perfect: false }];
  function summary(D) {
    return {
      o: D.o, sub: D.sub, reason: D.reasonText, time: fx1(D.time), capture: fx1(D.capture.blue) + '/' + fx1(D.capture.orange), comment: D.comment, tip: D.tip,
      title: D.titleLines.join('/'), record: D.record.join('') + (D.recordScore ? ' ' + D.recordScore : ''), total: D.total,
      water: D.water.map(w => w.shown).join('+'), px: D.water.map(w => w.px).join('+'), perfect: D.perfect,
    };
  }
  function liveSelfTest() {
    const rows = [], warns = [], KAN = GS.KANJI || '', CJK = /[㐀-鿿豈-﫿]/;
    const ow = console.warn;
    console.warn = function () { warns.push(Array.from(arguments).join(' ')); return ow.apply(console, arguments); };
    const orig = { text8: GS.text8, text16: GS.text16, digits16: GS.digits16, banner: GS.banner };
    let boxes = null;
    Object.keys(orig).forEach(k => {
      GS[k] = function (c, str, x, y, a, b) {
        const o = (k === 'digits16' ? b : a) || {}, s = String(str);
        if (boxes && c && c.canvas && c.canvas.width === 256 && s.trim()) {
          const lines = s.split('\n'), n = Array.from(s).length, big = k === 'banner' && o.size === 32;
          const w = k === 'text16' ? Math.max(...lines.map(GS.measure16)) : n * (k === 'banner' ? (big ? 32 : 16) : 8);
          const h = k === 'text16' ? 16 * lines.length : k === 'text8' ? 8 : big ? 32 : 16;
          const x0 = R(o.align === 'center' ? x - (w >> 1) : o.align === 'right' ? x - w : x), y0 = R(y);
          boxes.push({ s, k, x0, y0, x1: x0 + w, y1: y0 + h });
        }
        return orig[k].apply(this, arguments);
      };
    });
    const run = (name, D, exp, allowWarn) => {
      const issues = [], w0 = warns.length, sm = summary(D);
      for (let p = 1; p <= 3; p++) {
        boxes = p === 3 ? [{ s: '[称号]', k: 'stamp', x0: P3L.stamp[0] - 48, y0: P3L.stamp[1] - 18, x1: P3L.stamp[0] + 48, y1: P3L.stamp[1] + 18 }] : [];
        GS.renderTo(null, L => {
          try { drawPage(L, p, D, finalOf(p, D), 0, p === 3 ? makeMenu() : null); } catch (e) { issues.push('p' + p + ' draw error: ' + e.message); }
        });
        const B = boxes; boxes = null;
        B.forEach((b, i) => {
          if (b.x0 < 8 || b.x1 > 248 || b.y0 < 8 || b.y1 > 216) issues.push('p' + p + ' outside the safe area: ' + JSON.stringify(b.s) + ' x' + b.x0 + '-' + (b.x1 - 1) + ' y' + b.y0 + '-' + (b.y1 - 1));
          if (b.k === 'text16') {
            b.s.split('\n').forEach(l => { if (GS.measure16(l) > 224) issues.push('p' + p + ' J16 over 224px: ' + l); });
            Array.from(b.s).forEach(ch => { if (CJK.test(ch) && KAN.indexOf(ch) < 0) issues.push('p' + p + ' kanji ' + ch + ' in ' + b.s); });
          }
          for (let j = i + 1; j < B.length; j++) {
            const e = B[j];
            if (b.x0 < e.x1 && e.x0 < b.x1 && b.y0 < e.y1 && e.y0 < b.y1) issues.push('p' + p + ' overlap: ' + JSON.stringify(b.s) + ' / ' + JSON.stringify(e.s));
          }
        });
      }
      if (D.water.reduce((a, w) => a + w.shown, 0) !== (D.perfect ? D.total : R(D.water.reduce((a, w) => a + w.v, 0)))) issues.push('water rows do not add up');
      if (D.water.reduce((a, w) => a + w.px, 0) > 192) issues.push('water bar over 192px');
      Object.keys(exp || {}).forEach(k => { if (sm[k] !== exp[k]) issues.push(k + ': got ' + JSON.stringify(sm[k]) + ', expected ' + JSON.stringify(exp[k])); });
      warns.slice(w0).forEach(m => { if (!(allowWarn && allowWarn.test(m))) issues.push('warn: ' + m); });
      rows.push(Object.assign({ case: name }, sm, { issues }));
    };
    try {
      OUTCOMES.forEach(o => run('mock ' + o, data(o)));
      run('mock winWipe', data('win', 'winWipe'));
      SELF_CASES.forEach(([name, c, record, exp]) => { const src = liveSource(synth(c), record); run(name, data(src.outcome, null, src), exp); });
      const [name, c, record, exp] = SELF_LEAK, src = liveSource(synth(c), record);
      run(name, data(src.outcome, null, src), exp, /water parts add up/);
    } finally {
      Object.assign(GS, orig);
      console.warn = ow;
    }
    return { ok: rows.every(r => !r.issues.length), rows };
  }
  GS.screens.result._liveSelfTest = liveSelfTest;
})();
