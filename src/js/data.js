/* ガン・スプラッシュ 復刻版 — data
 * Stage geometry and rules come from src/game.mjs (the single source of truth).
 * game.mjs is an ES module and this is a classic script, so the data is converted at start-up:
 *
 *   GS.setGameData(rules)   rules = the game.mjs module namespace ({ STAGES, CONFIG, ZONE, Game, ... })
 *
 * It is called for you by GS.whenReady (core.js boot gate) when GS.installApp(app) brings app.rules:
 *   - index.html: app.mjs installs GS.app (rules = game.mjs) -> GS.STAGES exists before the first ROM frame.
 *   - manual.html: its inline module loads game.mjs with import() and calls
 *     GS.installApp({ live: false, rules }) (GS.boot({headless:true}) waits for it).
 * Nothing hand-copied is kept: without that call GS.STAGES stays undefined and the first read reports it
 * (console.error; in ?debug=1 also a toast) instead of drawing stale geometry.
 *
 * Only the ROM text (kana + the 44 kanji, <= 224 px), the ground colours and the pool names are ROM data.
 * The mock datasets GS.MOCK.* (scripted play / result for the stills and the manual) stay below.
 * World = CONFIG.width x CONFIG.height (1200 x 720).
 */
(function () {
  'use strict';
  const GS = window.GS;

  // ---- ROM-only text per game.mjs stage id ------------
  // nameRom 2 lines / levelRom / descRom 3 lines: J16, kana + the 44 allowed kanji, each line <= 224 px.
  const ROM_TEXT = {
    tutorial: {
      nameRom: ['はじまりの', '中庭'], levelRom: 'にゅうもん',
      descRom: ['水辺を とおって 中央へ。', 'みじかい かべと ひろい道', 'てきは はじめの 4秒 うたない'],
      ground: ['g1a', 'g1b'],
    },
    lanes: {
      nameRom: ['みっつの', '通り道'], levelRom: 'しょきゅう',
      descRom: ['水は 上と下の 通りだけ', 'くんだら 中央の 陣地へ', 'かべの すきまから せめこめ!'],
      ground: ['g2a', 'g2b'],
      // The pools lie in the corners of the top and bottom lanes, so they are named by corner (the compass rule
      // would call the bottom-left one 西).
      poolNames: { 'home-blue': '南西', 'home-orange': '北東', north: '北西', south: '南東' },
    },
    alleys: {
      nameRom: ['斜めの', '水路'], levelRom: 'ちゅうきゅう',
      descRom: ['斜めに つらなる 水辺と かど', '水辺を わたって', 'べつの かどから せめこもう!'],
      ground: ['g3a', 'g3b'],
      // The 4 pools lie on one diagonal: 2 in the same direction west-north-west of the zone, 2 east-south-east,
      // so the compass rule below would call the inner one 北 although it is south-east of 西. Named by where
      // they are on the map instead (game.mjs pool id -> name): the corner pools and the two next to the zone.
      poolNames: { 'home-blue': '北西', 'home-orange': '南東', north: '中央西', south: '中央東' },
    },
    maze: {
      nameRom: ['いきどまりの', '路地'], levelRom: 'じょうきゅう',
      descRom: ['水は どれも 路地の おく', 'くみに いけば にげ道なし!', 'かべを たてに 陣地を とれ'],
      ground: ['g4a', 'g4b'],
      // Each pool lies in a dead end in one corner; two of them are west of the zone, so named by corner.
      poolNames: { 'home-blue': '南西', 'home-orange': '北東', north: '北西', south: '南東' },
    },
  };

  // ---- pool names from coordinates (seen from the zone centre) ------------
  // p.dir is shown as p.dir + 'の 水たまりが 枯れた' (play.js; J16, <= 224 px: a 3-glyph name gives 208 px).
  // Each stage has 4 pools; by default the 4 compass names are assigned by the permutation that best matches
  // the actual direction (sum of cosines). The game.mjs pool order / label is NOT used (placePools keeps the PUDDLES
  // labels, so "home-blue" is called 西の水たまり wherever a stage puts it).
  // That only works while every pool has its own nearest compass direction. When two pools lie in the same
  // direction, the permutation has to give one of them a wrong name, so such a stage carries its own names in
  // ROM_TEXT[id].poolNames (game.mjs pool id -> name, kana + the 44 kanji). Without them it warns.
  const DIRS = [['西', -1, 0], ['東', 1, 0], ['北', 0, -1], ['南', 0, 1]];
  function perms(a) { return a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x].concat(p))); }
  const dot = (v, d) => v[0] * DIRS[d][1] + v[1] * DIRS[d][2];
  function nearestDir(v) { let b = 0; for (let d = 1; d < DIRS.length; d++) if (dot(v, d) > dot(v, b)) b = d; return b; }
  function setName(p, name) { p.dir = name; p.label = name + 'の水たまり'; }
  function assignCompass(pools, zone, stageId, names) {
    if (names) {
      const got = pools.map(p => names[p.id]);
      if (got.every(n => typeof n === 'string' && n !== '') && new Set(got).size === got.length) { pools.forEach((p, i) => setName(p, got[i])); return; }
      GS.warnOnce('data:poolNames:' + stageId, '[data] ROM_TEXT.' + stageId + '.poolNames must give each pool id (' +
        pools.map(p => p.id).join(', ') + ') its own name; got', JSON.stringify(names), '- using the compass names');
    }
    const v = pools.map(p => { const dx = p.x - zone.x, dy = p.y - zone.y, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; });
    const near = v.map(nearestDir);
    let best = null, bestS = -Infinity;
    for (const p of perms([0, 1, 2, 3])) {
      const s = v.reduce((sum, w, i) => sum + (p[i] != null ? dot(w, p[i]) : 0), 0);
      if (s > bestS) { bestS = s; best = p; }
    }
    pools.forEach((p, i) => setName(p, DIRS[best[i] != null ? best[i] : near[i]][0]));
    // two pools in the same compass direction: at least one name does not match the map
    if (new Set(near).size < near.length) {
      GS.warnOnce('data:compass:' + stageId, '[data] stage ' + stageId + ': pools ' +
        pools.map((p, i) => p.dir + '(' + p.x + ',' + p.y + ' nearest ' + DIRS[near[i]][0] + ')').join(' ') +
        ' share a compass direction from the zone, so the names do not match the map; add ROM_TEXT.' + stageId +
        '.poolNames in js/data.js');
    }
  }

  // fresh objects (core caches the outline on the pool object as p._pts; game.mjs objects stay untouched)
  function pool(src, initial) {
    return { id: src.id, x: src.x, y: src.y, rx: src.rx, ry: src.ry, angle: src.angle, phase: src.phase,
      capacity: src.capacity, initial, slow: src.slow };
  }
  function taps(list) { return list.map(([x, y], i) => ({ x, y, pool: i })); }

  // ---- missing data: loud, never stale --------------------------------------
  let stages = null, complained = false;
  function complain(why) {
    if (complained) return;
    complained = true;
    const msg = '[data] GS.STAGES is not set (' + why + '): call GS.setGameData(rules) with the game.mjs namespace, ' +
      'or GS.installApp({ rules }) (see js/data.js).';
    console.error(msg);
    if (GS.DEBUG) { try { GS.shell.toast('ステージデータ（game.mjs）が読みこまれていません'); } catch (e) { /* ignore */ } }
  }
  // GS.STAGES reads the converted list; a read before GS.setGameData (once the boot gate is open) reports it.
  Object.defineProperty(GS, 'STAGES', {
    configurable: true, enumerable: true,
    get() {
      if (!stages && GS.isReady()) complain('read before GS.setGameData');
      return stages || undefined;
    },
    set(v) { stages = v || null; },
  });
  GS.hasGameData = () => !!stages;

  // ---- converter --------------------------------------------------------------
  // Builds GS.RULES (the CONFIG values the classic scripts read) / GS.ZONE / GS.SPAWN / GS.STAGES from the game.mjs
  // namespace. GS.STAGES keeps the ROM format: { id, no, name, nameRom, level, levelRom, cpu, difficulty, desc,
  // descRom, obstacles, pools: [{ id, x, y, rx, ry, angle, phase, capacity, initial, slow, dir, label }],
  // taps: [{ x, y, pool }], ground }.
  // Initial pool water and the spawn points are read from a fresh probe Game per stage (they live in
  // Game.reset, not in an export).
  GS.setGameData = function (rules) {
    const STAGES = rules && rules.STAGES, CONFIG = rules && rules.CONFIG, ZONE = rules && rules.ZONE;
    if (!Array.isArray(STAGES) || !CONFIG || !ZONE || typeof rules.Game !== 'function') {
      console.error('[data] GS.setGameData: rules must be the game.mjs namespace (STAGES, CONFIG, ZONE, Game)', rules);
      return null;
    }
    if (stages) GS.clearMapCaches(); // called again: core.js drops the map / puddle images built from the old data
    const dbg = (key, ...msg) => { if (GS.DEBUG) GS.warnOnce('data:' + key, '[data]', ...msg); };

    // probe games (one per stage): initial water per pool, spawn points
    const probes = {};
    for (const s of STAGES) probes[s.id] = new rules.Game(1, s.id);
    const initialOf = (stageId, i) => probes[stageId].puddles[i].water;

    const list = STAGES.map((s, i) => {
      let rom = ROM_TEXT[s.id];
      if (!rom) {
        console.error('[data] no ROM text for stage', s.id, '(add it to ROM_TEXT in js/data.js)');
        rom = { nameRom: [String(s.name || s.id), ''], levelRom: String(s.level || ''), descRom: [], ground: ['g1a', 'g1b'] };
      }
      if (!Array.isArray(s.pools) || s.pools.length !== 4) dbg('pools:' + s.id, 'stage', s.id, 'has', s.pools && s.pools.length, 'pools (the compass names expect 4)');
      const pools = (s.pools || []).map((p, k) => pool(p, initialOf(s.id, k)));
      assignCompass(pools, ZONE, s.id, rom.poolNames);
      return {
        id: s.id, no: i + 1, name: s.name, nameRom: rom.nameRom.slice(), level: s.level, levelRom: rom.levelRom,
        cpu: (s.difficulty | 0) + 1, difficulty: s.difficulty,
        desc: s.description, descRom: rom.descRom.slice(),
        obstacles: (s.obstacles || []).map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
        pools,
        taps: taps(s.taps || []),
        ground: rom.ground.slice(),
      };
    });
    if (list.length !== 4) dbg('count', 'game.mjs has', list.length, 'stages; the ROM has stage1..stage4');

    // captureGoal: title.js (the rule line), radius: core.js (the live shoreline). Other rule values are read from
    // GS.app.rules (game.mjs) directly.
    GS.RULES = Object.freeze({ captureGoal: CONFIG.captureGoal, radius: CONFIG.radius });
    GS.ZONE = Object.freeze({ x: ZONE.x, y: ZONE.y, r: ZONE.r });

    const A = probes[list[0].id].actors;
    GS.SPAWN = Object.freeze({
      blue: Object.freeze({ x: A[0].x, ys: Object.freeze([A[0].y, A[1].y, A[2].y]) }),
      orange: Object.freeze({ x: A[3].x, ys: Object.freeze([A[3].y, A[4].y, A[5].y]) }),
    });

    stages = list;
    GS.dirty = true;
    return list;
  };
  // pool index by compass name for a stage: GS.poolByDir('tutorial','北') -> 2
  GS.poolByDir = (stageId, dir) => GS.stage(stageId).pools.findIndex(p => p.dir === dir);

  // core.js boot gate: GS.installApp(app) runs this before the first ROM frame (app.rules = game.mjs; null on
  // manual.html when game.mjs could not be loaded).
  GS.whenReady(app => { if (app && app.rules && !stages) GS.setGameData(app.rules); });

  // =====================================================================
  // GS.MOCK.play — stage 1「はじまりの中庭」
  // The numbers the mock scenes start from. What happens in them (who fires when, the dry pool, the messages,
  // the 480f loop) is play.js's own script. Pools and pumps are matched to the stage by dir (GS.poolByDir).
  // =====================================================================
  // act 'pump': stands at tap `pump` (+ GS.PUMP_LAYOUT.stand) instead of x / y and works that pump
  const actors = [
    { id: 0, name8: 'YOU', team: 'blue', self: true, x: 470, y: 372, hp: 64, water: 35, weapon: 'normal', pose: 'field', faceLeft: false, act: 'fire-normal' },
    { id: 1, name8: 'AO', team: 'blue', x: 585, y: 340, hp: 52, water: 61, weapon: 'splash', pose: 'field', faceLeft: false, act: 'fire-splash' },
    { id: 2, name8: 'MIO', team: 'blue', x: 225, y: 470, hp: 88, water: 70, weapon: 'normal', pose: 'pump', faceLeft: false, act: 'pump', pump: 0 },
    { id: 3, name8: 'KAI', team: 'orange', x: 705, y: 322, hp: 38, water: 0, weapon: 'normal', pose: 'field', faceLeft: true, act: 'fire-weak' },
    { id: 4, name8: 'REN', team: 'orange', x: 780, y: 250, hp: 0, water: 0, weapon: 'normal', pose: 'down', faceLeft: true, alive: false },
    { id: 5, name8: 'NAGI', team: 'orange', x: 1040, y: 300, hp: 76, water: 55, weapon: 'long', pose: 'field', faceLeft: true, act: 'charge-long' },
  ];

  const normal = {
    time: 47,                                  // seconds left (shown rounded up); -1 every 60f, restarts with the loop
    capture: { blue: 18.6, orange: 11.2 },     // BLUE grows 1/60 s per frame while holding
    zone: 'blue',                              // 'neutral' | 'blue' | 'orange' | 'contest'
    attackX2: 'blue',                          // gold ×2 next to BLUE
    camera: { x: 56, y: 40 },                  // fixed (world x168-936, y120-597 visible)
    // pools: level (0-5) and water (consistent with field total 412/900)
    pools: [
      { dir: '西', level: 2, water: 38, capacity: 100 },
      { dir: '東', level: 1, water: 17, capacity: 100 },
      { dir: '北', level: 1, water: 37, capacity: 250 },   // play.js dries it at loop frame 300
      { dir: '南', level: 3, water: 145, capacity: 250 },
    ],
    // pumps: level (0-4, = ceil(water/25)) and water
    pumps: [
      { dir: '西', level: 3, water: 75 },
      { dir: '東', level: 0, water: 0 },
      { dir: '北', level: 0, water: 0 },
      { dir: '南', level: 4, water: 100 },
    ],
    actors,
  };

  GS.MOCK = GS.MOCK || {};
  GS.MOCK.play = {
    normal,
    countdown: { lines: ['STAGE 1 はじまりの中庭', '陣地を 30秒 確保するか', 'あいてを ぜんめつで かち!'] },
    lowhp: { self: { hp: 6 } },
    finale: { time: 12, waters: { 0: 4, 1: 3, 2: 0, 3: 2, 5: 1 } },   // waters: actor id -> tank water
    spectate: { follow: 1, label: 'WATCH AO' },                        // follow: actor id the camera and HUD show
    pause: { frame: 60, stageLine: '1 はじまりの中庭' },                // frame: the normal scene is pre-rolled to it
    end: {
      'end-final': { banner: 'FINAL SPLASH!', set: 'H3', x: 24, sub: 'あいてを ぜんめつ!' },
      'end-set': { banner: 'GAME SET!', set: 'H0', x: 56, sub: '陣地を 30秒 確保!' },
      'end-timeup': { banner: 'TIME UP!', set: 'H0', x: 64, sub: '確保タイムで しょうぶ' },
      'end-draw': { banner: 'DRAW GAME', set: 'H0', x: 56, sub: '確保タイム どうてん', drop: true },
    },
    demo: { tips: ['水たまりで 水を ほきゅう!', '陣地を とると こうげき×2!', 'ぜんめつ させても かち!', '陣地を 30秒 とれば かち!'] },
    // the messages of the mock scenes (the live match has its own list in play.js)
    messages: {
      start: '中央の 陣地を とれ!', blueCapture: 'ブルーが 陣地を 確保!', contest: '陣地を とりあい中!',
      selfDown: 'やられた… なかまを おうえん', dry: '北の 水たまりが 枯れた', hp6: '通常弾 1発で ダウン!',
      blue25: 'ブルー あと5秒で かち!', finale: '水が つきた! のこり15秒',
    },
  };

  // =====================================================================
  // GS.MOCK.result — the mock data of the result pages (result.js data()). result.js works out sub / comment /
  // tip / titleLines by its own rules; the values here are only compared with them (a console warning if they differ).
  // =====================================================================
  const players = [
    { name8: 'YOU', name16: 'YOU', team: 'blue', self: true, ko: 1, hit: 19, shot: 30, weak: 8, refilled: 48, capture: 12.4, alive: true, tank: 35 },
    { name8: 'AO', name16: 'アオ', team: 'blue', ko: 1, hit: 31, shot: 14, weak: 2, refilled: 72, capture: 21.8, alive: true, tank: 61 },
    { name8: 'MIO', name16: 'ミオ', team: 'blue', ko: 0, hit: 3, shot: 6, weak: 0, refilled: 96, capture: 3.1, alive: false, tank: 0 },
    { name8: 'KAI', name16: 'カイ', team: 'orange', ko: 1, hit: 14, shot: 20, weak: 9, refilled: 64, capture: 9.6, alive: true, tank: 24 },
    { name8: 'REN', name16: 'レン', team: 'orange', ko: 0, hit: 5, shot: 10, weak: 2, refilled: 30, capture: 0.0, alive: false, tank: 0 },
    { name8: 'NAGI', name16: 'ナギ', team: 'orange', ko: 0, hit: 2, shot: 3, weak: 0, refilled: 76, capture: 4.0, alive: false, tank: 0 },
  ];
  // lose / draw reuse the win's personal stats, but with 2-2 alive and ORANGE capture 25.0 / 17.5 they cannot
  // match exactly, so three corrections keep the table self-consistent (YOU's row is unchanged, so the title,
  // tip and comment stay the same):
  //  - ナギ is alive with an empty tank (2-2 alive; tank total stays 120).
  //  - ZONE: game.mjs counts capture for every member inside the zone while the team holds it, so the ORANGE
  //    members' sum must be >= the team capture. カイ 9.6 -> 16.4, ナギ 4.0 -> 9.0 (sum 25.4 >= 25.0 / 17.5).
  //  - KO: only レン is down on ORANGE, so BLUE's KO total must be 1. アオ ko 1 -> 0 (YOU keeps 1).
  const FIX22 = { NAGI: { alive: true, tank: 0, capture: 9.0 }, KAI: { capture: 16.4 }, AO: { ko: 0 } };
  const players22 = players.map(p => Object.assign({}, p, FIX22[p.name8] || {}));
  const water = { shot: 470, spilled: 96, tank: 120, left: 514, total: 1200 };
  // record = this session, oldest first, ending with the match just played (draws are shown but not counted)
  const common = { players, water, titleLines: ['じんちの', 'まもりて'] };
  GS.MOCK.result = {
    win: Object.assign({}, common, {
      record: ['lose', 'win', 'win'], recordText: '○●● 2-1',
      reason: 'zone', reasonText: '陣地30秒確保で 決着', time: 62.4,
      capture: { blue: 30.0, orange: 11.2 },
      sub: 'ブルーチームの かち!', comment: 'やった! チームの しょうり!', tip: '1にん たおした! ナイス!', jingle: 'win',
    }),
    lose: Object.assign({}, common, {
      players: players22, record: ['win', 'win', 'lose'], recordText: '●●○ 2-1', reason: 'timeup', reasonText: 'タイムアップで 決着', time: 90.0,
      capture: { blue: 18.6, orange: 25.0 },
      sub: 'オレンジチームの かち…', comment: '確保タイム 6.4秒の さ…', tip: 'はやめに 陣地へ もどろう', jingle: 'lose',
    }),
    draw: Object.assign({}, common, {
      players: players22, record: ['win', 'lose', 'draw'], recordText: '●○△ 1-1', reason: 'timeup', reasonText: 'タイムアップで 決着', time: 90.0,
      capture: { blue: 17.5, orange: 17.5 },
      sub: 'ひきわけ ごかくの しょうぶ', comment: 'つぎの 一戦で けっちゃくを', tip: 'はやめに 陣地へ もどろう', jingle: 'draw',
    }),
  };
})();
