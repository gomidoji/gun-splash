export const CONFIG = Object.freeze({
  width: 1200, height: 720, duration: 90, captureGoal: 30,
  health: 100, capacity: 100, initialWater: 50, damage: 6, controlDamageMultiplier: 2, vulnerableDamageMultiplier: 2,
  shotCost: 5, fireInterval: .2, refillRate: 25, firingRefillRate: 5,
  weakDamage: 4, weakFireInterval: .6, weakRange: 180, finaleDuration: 15,
  recoilDuration: 5, recoilSpeed: .5,
  longChargeDuration: .8, longLockDuration: .2, longChargeSpeed: .7, longTurnRate: Math.PI * .75,
  tapRate: 10, tapCapacity: 100, tapRadius: 22,
  flinchDuration: .2, fireLockDuration: .1, flinchImmunity: .6, flinchSpeed: .8,
  speed: 174, radius: 14, bulletSpeed: 470, bulletLife: 1.25,
});
// Arena edges: actors keep WALK_MARGIN plus their radius inside the frame; shots end BULLET_MARGIN inside it.
const WALK_MARGIN = 30;
const BULLET_MARGIN = 28;
export const WEAPONS = Object.freeze([
  Object.freeze({ id: 'normal', name: 'ノーマル', range: 360, damage: 6, interval: .2, cost: 5, pellets: 1, spread: 0, speed: 470, pierce: false }),
  Object.freeze({ id: 'splash', name: 'スプラッシュ', range: 120, damage: 6, interval: .8, cost: 15, pellets: 5, spread: .56, speed: 470, pierce: false }),
  Object.freeze({ id: 'long', name: 'ロングバレル', range: 1400, damage: 45, interval: 15, cost: 25, pellets: 1, spread: 0, speed: 100000, pierce: true }),
]);
export const selectedWeapon = a => WEAPONS.find(w => w.id === a.weapon) || WEAPONS[0];
export const hasWeaponWater = a => a.water >= selectedWeapon(a).cost - 1e-8;
export const shotRange = a => hasWeaponWater(a) ? selectedWeapon(a).range : CONFIG.weakRange;
export const weaponWait = a => Math.max(a.cooldown, a.weaponCooldowns[a.weapon], a.recoil);
export const OBSTACLES = [
  // Rotational pairs give both teams identical approaches, with staggered crossfire lanes.
  { x: 335, y: 225, w: 110, h: 54 }, { x: 755, y: 441, w: 110, h: 54 },
  { x: 735, y: 195, w: 110, h: 54 }, { x: 355, y: 471, w: 110, h: 54 },
  { x: 535, y: 260, w: 80, h: 30 }, { x: 585, y: 430, w: 80, h: 30 },
  { x: 195, y: 240, w: 38, h: 85 }, { x: 967, y: 395, w: 38, h: 85 },
];
export const ZONE = Object.freeze({ x: 600, y: 360, r: 78 });
const PUDDLES = [
  { id: 'home-blue', label: '西の水たまり', x: 225, y: 402, rx: 84, ry: 51, angle: -.35, phase: .12, capacity: 100, slow: .15 },
  { id: 'home-orange', label: '東の水たまり', x: 975, y: 318, rx: 84, ry: 51, angle: Math.PI - .35, phase: .12, capacity: 100, slow: .15 },
  { id: 'north', label: '北の水たまり', x: 551, y: 144, rx: 132, ry: 83, angle: -.17, phase: 5.5, capacity: 250, slow: .30 },
  { id: 'south', label: '南の水たまり', x: 649, y: 576, rx: 132, ry: 83, angle: Math.PI - .17, phase: 5.5, capacity: 250, slow: .30 },
];
// Each wall gets a partner rotated 180 degrees around the arena center.
const mirrored = blocks => blocks.flatMap(o => [o, {
  x: CONFIG.width - o.x - o.w, y: CONFIG.height - o.y - o.h, w: o.w, h: o.h,
}]);
// Relocate water without changing its capacity, starting volume or movement penalty.
// Each rotational pair shares a shoreline. Its lobes fit the gaps between this stage's walls.
const placePools = (positions, phases, compact = false) => PUDDLES.map((p,i) => ({...p,
  ...(compact && i >= 2 ? {rx:110, ry:55} : {}),
  x:positions[i][0], y:positions[i][1], angle:positions[i][2] ?? p.angle, phase:phases[Math.floor(i / 2)],
}));
export const AI_LEVELS = [
  {reaction: .65, error: 1.5, burst: .55, rest: 1.05, aim: 1.1, longGap: 9, tactics: false, dodge: false, focus: 0},
  {reaction: .45, error: 1.25, burst: .85, rest: .7, aim: .8, longGap: 6, tactics: false, dodge: true, focus: 0},
  {reaction: .22, error: 1, burst: 1.4, rest: .25, aim: .3, longGap: 3, tactics: true, dodge: true, focus: 45},
  {reaction: .14, error: .7, burst: 1.7, rest: .15, aim: .3, longGap: 1.5, tactics: true, dodge: true, focus: 80},
];
export const STAGES = [
  {id:'tutorial', name:'はじまりの中庭', level:'入門', difficulty:0, description:'水辺を通って中央へ。短い壁と広い道の、穏やかな中庭。',
    obstacles:OBSTACLES.map(o => o.w === 38 ? {...o,y:o.x < 600 ? 200 : 435} : o),
    pools:PUDDLES.map((p,i)=>({...p, y:i<2?360:p.y})), taps:[[225,470],[975,250],[370,144],[830,576]]},
  // Two long walls split the field into three lanes: the zone holds the middle one, the water lies only in the top and
  // bottom lanes (each lane has the big pool of one team and the small pool of the other).
  {id:'lanes', name:'みっつの通り道', level:'初級', difficulty:1, description:'長い壁で分かれた三本の通り。水は上下の通りだけ。補給して中央の陣地へ。',
    obstacles:mirrored([{x:280,y:215,w:250,h:30},{x:280,y:475,w:250,h:30},{x:440,y:330,w:30,h:60}]),
    pools:placePools([[330,600,0],[870,120,Math.PI],[400,120,0],[800,600,Math.PI]], [3.2, 1.4], true),
    taps:[[190,600],[1010,120],[215,120],[985,600]]},
  {id:'alleys', name:'斜めの水路', level:'中級', difficulty:2, description:'斜めに連なる水場と曲がり角。水場を渡り、別の角度から攻め込もう。',
    obstacles:mirrored([{x:315,y:80,w:38,h:100},{x:335,y:335,w:120,h:38},{x:535,y:140,w:38,h:100},{x:535,y:365,w:40,h:45},{x:165,y:300,w:110,h:38}]),
    pools:placePools([[235,165,.5],[965,555,Math.PI+.5],[465,280,.5],[735,440,Math.PI+.5]], [5.062, 7.338], true),
    taps:[[110,165],[1090,555],[465,145],[735,575]]},
  // Every pool lies in a dead end with one way in: the big pools at the back of a corner alley whose pump stands
  // outside its mouth (a wall keeps the far half from seeing into the alley, not the pump), the small ones in a
  // pocket beside each spawn. The zone sits in a pinwheel of walls with two corner openings, and no straight lane
  // crosses the field.
  {id:'maze', name:'いきどまりの路地', level:'上級', difficulty:3, description:'水場はどれも行き止まりの奥。補給に入れば逃げ道なし。',
    obstacles:mirrored([{x:490,y:250,w:150,h:28},{x:490,y:278,w:28,h:100},{x:30,y:200,w:390,h:28},{x:420,y:30,w:28,h:95},
      {x:300,y:470,w:28,h:220},{x:30,y:470,w:170,h:28},{x:340,y:290,w:28,h:120},{x:590,y:130,w:28,h:120}]),
    pools:placePools([[165,595,0],[1035,125,Math.PI],[255,112,0],[945,608,Math.PI]], [2.4, 4.1], true),
    taps:[[275,515],[925,205],[470,162],[730,558]]},
];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hasWaterShot = a => a.water >= CONFIG.shotCost - 1e-8;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Positional risk is independent of team ownership and is evaluated for each impact.
export const incomingDamageMultiplier = a => a?.alive && (distance(a, ZONE) <= ZONE.r || a.tapId != null) ? CONFIG.vulnerableDamageMultiplier : 1;
const puddleShapes = new WeakMap();
function puddleShape(p) {
  if (!puddleShapes.has(p)) {
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    const points = Array.from({ length: 64 }, (_, i) => {
      const a = i / 64 * Math.PI * 2;
      const edge = 1 + .17 * Math.sin(a * 3 + p.phase) + .12 * Math.cos(a * 5 - p.phase) + .065 * Math.sin(a * 8 + p.phase);
      const x = Math.cos(a) * p.rx * edge, y = Math.sin(a) * p.ry * edge;
      return { x: x * cos - y * sin, y: x * sin + y * cos };
    });
    puddleShapes.set(p, { points, radius: Math.max(...points.map(v => Math.hypot(v.x, v.y))) });
  }
  return puddleShapes.get(p);
}
export const puddleScale = p => Math.sqrt(Math.max(0, p.water / p.capacity));
export const puddleRadius = p => puddleShape(p).radius * puddleScale(p);
// Rendering and collision share the same shoreline, including its shrinking shape.
export const puddleOutline = (p, scale = puddleScale(p)) => puddleShape(p).points.map(v => ({ x: p.x + v.x * scale, y: p.y + v.y * scale }));
export function insidePuddle(a, p) {
  if (!(p.water > 0) || distance(a, p) > puddleRadius(p) + CONFIG.radius) return false;
  const scale = puddleScale(p), x = (a.x - p.x) / scale, y = (a.y - p.y) / scale;
  const reach2 = (CONFIG.radius / scale) ** 2, points = puddleShape(p).points;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const v = points[i], w = points[j];
    if ((v.y > y) !== (w.y > y) && x < (w.x - v.x) * (y - v.y) / (w.y - v.y) + v.x) inside = !inside;
    const dx = w.x - v.x, dy = w.y - v.y;
    const t = clamp(((x - v.x) * dx + (y - v.y) * dy) / (dx * dx + dy * dy), 0, 1);
    if ((x - v.x - t * dx) ** 2 + (y - v.y - t * dy) ** 2 <= reach2 + 1e-8) return true;
  }
  return inside;
}
export function randomGenerator(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function segmentRect(a, b, r, pad = 0) {
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, r.x - pad, r.x + r.w + pad], [a.y, b.y - a.y, r.y - pad, r.y + r.h + pad]]) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return null; }
    else { let u = (min - start) / delta, v = (max - start) / delta; if (u > v) [u, v] = [v, u]; lo = Math.max(lo, u); hi = Math.min(hi, v); if (lo > hi) return null; }
  }
  return lo;
}
function segmentCircle(a, b, c, radius) {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
  const aa = dx * dx + dy * dy, cc = fx * fx + fy * fy - radius * radius;
  if (cc <= 0) return 0;
  if (aa < 1e-9) return null;
  const bb = 2 * (fx * dx + fy * dy), disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
export const clearPath = (a, b, pad = 0, obstacles = OBSTACLES) => !obstacles.some(o => segmentRect(a, b, o, pad) !== null);
export function longRayEnd(a, aim, obstacles = a.obstacles || OBSTACLES) {
  const dx = Math.cos(aim) * WEAPONS[2].range, dy = Math.sin(aim) * WEAPONS[2].range;
  const end = { x: a.x + dx, y: a.y + dy }; let fraction = 1;
  for (const o of obstacles) { const hit = segmentRect(a, end, o, 2); if (hit !== null) fraction = Math.min(fraction, hit); }
  for (const [start, delta, min, max] of [[a.x, dx, BULLET_MARGIN, CONFIG.width - BULLET_MARGIN],
    [a.y, dy, BULLET_MARGIN, CONFIG.height - BULLET_MARGIN]]) {
    if (delta > 0) fraction = Math.min(fraction, (max - start) / delta);
    else if (delta < 0) fraction = Math.min(fraction, (min - start) / delta);
  }
  return { x: a.x + dx * fraction, y: a.y + dy * fraction };
}
function validPosition(x, y, radius = CONFIG.radius, obstacles = OBSTACLES) {
  if (x < WALK_MARGIN + radius || x > CONFIG.width - WALK_MARGIN - radius
    || y < WALK_MARGIN + radius || y > CONFIG.height - WALK_MARGIN - radius) return false;
  return !obstacles.some(o => x > o.x - radius && x < o.x + o.w + radius && y > o.y - radius && y < o.y + o.h + radius);
}
// A small navigation graph around the covers keeps the bots from walking into walls.
const NAV_PADDING = CONFIG.radius - .25;
function navigation(obstacles) {
  const NAV = obstacles.flatMap(o => {
    const m = CONFIG.radius + 7;
    return [{ x: o.x - m, y: o.y - m }, { x: o.x + o.w + m, y: o.y - m }, { x: o.x - m, y: o.y + o.h + m }, { x: o.x + o.w + m, y: o.y + o.h + m }];
  }).filter(p => validPosition(p.x, p.y, CONFIG.radius, obstacles));
  const EDGES = NAV.map(a => NAV.map((b, i) => ({ i, d: distance(a, b) })).filter(e => e.d > 0 && clearPath(a, NAV[e.i], NAV_PADDING, obstacles)));
  return { NAV, EDGES };
}
function nextWaypoint(start, target, nav, obstacles) {
  const {NAV, EDGES} = nav;
  const path = (a,b,pad) => clearPath(a,b,pad,obstacles);
  if (path(start, target, NAV_PADDING)) return target;
  const costs = NAV.map(p => path(start, p, NAV_PADDING) ? distance(start, p) : Infinity);
  const previous = NAV.map(() => -1), done = new Set();
  let end = -1, best = Infinity;
  for (let step = 0; step < NAV.length; step++) {
    let u = -1;
    for (let i = 0; i < NAV.length; i++) if (!done.has(i) && (u === -1 || costs[i] < costs[u])) u = i;
    if (u === -1 || !Number.isFinite(costs[u])) break;
    done.add(u);
    if (path(NAV[u], target, NAV_PADDING) && costs[u] + distance(NAV[u], target) < best) { best = costs[u] + distance(NAV[u], target); end = u; }
    for (const edge of EDGES[u]) if (costs[u] + edge.d < costs[edge.i]) { costs[edge.i] = costs[u] + edge.d; previous[edge.i] = u; }
  }
  if (end < 0) return start;
  while (previous[end] !== -1) end = previous[end];
  return NAV[end];
}

export class Game {
  // new Game(seed) without a stage id is the stage-less test layout (OBSTACLES, PUDDLES, default taps, no AI
  // profile, no terrain planner) that most tests use. The app always passes a stage id.
  constructor(seed = 1, stageId = null) { this.seed = seed; this.reset(seed, stageId); }
  reset(seed = this.seed, stageId = this.stage?.id ?? null) {
    this.stage = STAGES.find(s => s.id === stageId) || null;
    this.aiProfile = this.stage ? AI_LEVELS[this.stage.difficulty] : null;
    this.obstacles = this.stage?.obstacles || OBSTACLES; this.nav = navigation(this.obstacles);
    this.seed = seed; this.random = randomGenerator(seed);
    this.state = 'ready'; this.time = 0; this.scores = [0, 0]; this.winner = null; this.reason = ''; this.finaleEndsAt = null;
    this.puddles = (this.stage?.pools || PUDDLES).map(p => ({ ...p, water: p.capacity === 100 ? 70 : 180 }));
    this.taps = (this.stage?.taps || [[225, 510], [975, 210], [370, 144], [830, 576]]).map(([x, y], i) => ({
      id: `tap-${this.puddles[i].id}`, puddleId: this.puddles[i].id, x, y, water: CONFIG.tapCapacity, flow: 0,
    }));
    // Each orange actor starts where its blue counterpart (same role) would be after the stages' 180° rotation, so
    // the role that goes for water first (role 1) is as near to its team's water as the other team's on every map.
    this.actors = Array.from({ length: 6 }, (_, id) => {
      const team = id < 3 ? 0 : 1, role = id % 3;
      return { obstacles: this.obstacles, id, team, role, human: id === 0, name: ['YOU', 'アオ', 'ミオ', 'カイ', 'レン', 'ナギ'][id],
        x: team ? 1092 : 108, y: (team ? [360, 418, 302] : [360, 302, 418])[role], vx: 0, vy: 0, aim: team ? Math.PI : 0,
        hp: CONFIG.health, water: CONFIG.initialWater, alive: true, cooldown: 0, hitFlash: 0, hitDirectionX: 0, hitDirectionY: 0,
        firing: false, lastShotWeak: false, lastShotWeapon: 'normal', weapon: 'normal', weaponCooldowns: { normal: 0, splash: 0, long: 0 }, refilling: false, refillAmount: 0, puddleId: null, slowFactor: 1,
        flinch: 0, fireLock: 0, flinchGuard: 0, recoil: 0, recoilAim: 0, charge: 0, chargeAim: 0, tapId: null,
        ai: { refill: role === 1, goal: null, think: 0, waypoint: null, pathTime: 0, avoidSupplyUntil: 0, lastHp: CONFIG.health, mode: 'objective', duty: 'advance', aimTime: 0, aimTarget: null, aimAngle: 0, longEscape: null, phase: this.random() * Math.PI * 2 },
        stats: { shots: 0, weakShots: 0, hits: 0, kills: 0, refilled: 0, capture: 0 } };
    });
    this.bullets = []; this.effects = []; this.events = []; this.nextBullet = 0;
    this.combatEvents = []; this.combatSequence = 0;
    this.zoneOwner = null; this.contested = false; this.usedWater = 0; this.discardedWater = 0;
    this.lastTeamLong = [-Infinity, -Infinity];
    this.initialTotalWater = this.actors.reduce((s, a) => s + a.water, 0) + this.remainingWater();
    this.teamSightings = [new Map(), new Map()];
    this.terrainCosts = [null, null];
    // Stage AI graph: the cover navigation points, every pool center and four points around the objective.
    const nodes = [...this.nav.NAV, ...this.puddles.map(p => ({ x: p.x, y: p.y })),
      ...[-1, 1].flatMap(x => [-1, 1].map(y => ({ x: ZONE.x + x * 150, y: ZONE.y + y * 150 })))]
      .filter(p => this.validPosition(p.x, p.y));
    this.terrainGraph = {
      nodes,
      edges: nodes.map(a => nodes
        .map((b, i) => ({ i, d: distance(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }))
        .filter(e => e.d > 0 && this.clearPath(a, nodes[e.i], NAV_PADDING)))
    };
  }
  clearPath(a, b, pad = 0) { return clearPath(a, b, pad, this.obstacles); }
  validPosition(x, y) { return validPosition(x, y, CONFIG.radius, this.obstacles); }
  nextWaypoint(a, b) { return nextWaypoint(a, b, this.nav, this.obstacles); }
  knownThreats(a, visible, allies) {
    const memory = this.teamSightings[a.team];
    for (const b of visible) memory.set(b.id, {
      id: b.id, x: b.x, y: b.y, time: this.time, charge: b.charge, aim: b.chargeAim
    });
    for (const [id, b] of memory) if (this.time - b.time > 2) memory.delete(id);
    // Basic bots use their own sight. Advanced teams share sightings, never hidden live positions.
    return this.stage.difficulty >= 2 ? [...memory.values()] : visible;
  }
  // Exposure of p (0-3): open sight lines to known threats within 410 px, more inside a charging long barrel's lane.
  terrainRisk(p, threats) {
    let risk = 0;
    for (const b of threats) {
      const d = distance(p, b);
      if (d < 410 && this.clearPath(p, b)) risk += 1.5 * (1 - d / 410);
      if (b.charge > .4 && this.clearPath(p, b)
        && Math.abs((p.x - b.x) * Math.sin(b.aim || 0) - (p.y - b.y) * Math.cos(b.aim || 0)) < 50) risk += 1.5;
    }
    return Math.min(3, risk);
  }
  terrainPaths(a, threats, allies = [], urgent = false) {
    const { nodes, edges } = this.terrainGraph;
    // Edge risk and mud are cached per team for .7 s, or until the known threats change (who, 30 px cell, charging).
    const signature = threats.map(b => `${b.id}:${Math.round(b.x / 30)}:${Math.round(b.y / 30)}:${b.charge > .4}`)
      .join('|');
    let cache = this.terrainCosts[a.team];
    if (!cache || this.time - cache.time > .7 || cache.signature !== signature) {
      const risk = nodes.map(p => this.terrainRisk(p, threats));
      const mud = p => this.puddles
        .reduce((cost, w) => cost + (insidePuddle(p, w) ? w.slow * w.water / w.capacity : 0), 0);
      cache = {
        time: this.time, signature, risk,
        edges: edges.map((list, i) => list.map(e => ({
          ...e,
          risk: (risk[i] + risk[e.i] + this.terrainRisk(e.mid, threats) * 2) / 4,
          mud: mud(e.mid)
        })))
      };
      this.terrainCosts[a.team] = cache;
    }
    const caution = urgent ? .2 : a.water < 25 || a.hp < 35 ? 2.2 : 1.1;
    const crowd = nodes.map(p => allies.filter(b => b.ai.route?.points?.some(q => distance(p, q) < 65)
      && distance(p, ZONE) > 100).length * .35);
    const cost = (u, v) => distance(u, v)
      * (1 + caution * this.terrainRisk({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 }, threats));
    const costs = nodes.map(p => this.clearPath(a, p, NAV_PADDING) ? cost(a, p) : Infinity),
      previous = nodes.map(() => -1),
      done = new Set();
    // Dijkstra from a: edges cost more when exposed or muddy and, unless urgent, where allies' routes already run.
    for (let step = 0; step < nodes.length; step++) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
      if (u < 0 || !Number.isFinite(costs[u])) break;
      done.add(u);
      for (const e of cache.edges[u]) {
        const value = costs[u] + e.d * (1 + caution * e.risk + e.mud + (urgent ? 0 : crowd[e.i]));
        if (value < costs[e.i]) {
          costs[e.i] = value;
          previous[e.i] = u;
        }
      }
    }
    // to(target): the cheapest route from a (straight or through graph nodes), its cost and its walking length.
    return {
      to: target => {
        if (!this.validPosition(target.x, target.y)) return { cost: Infinity, points: [], length: Infinity };
        let best = this.clearPath(a, target, NAV_PADDING) ? cost(a, target) : Infinity, end = -1;
        for (let i = 0; i < nodes.length; i++) if (costs[i] < best && this.clearPath(nodes[i], target, NAV_PADDING)) {
          const value = costs[i] + cost(nodes[i], target);
          if (value < best) {
            best = value;
            end = i;
          }
        }
        const points = [{ x: target.x, y: target.y }];
        while (end >= 0) {
          points.unshift(nodes[end]);
          end = previous[end];
        }
        let length = 0, last = a;
        for (const p of points) {
          length += distance(last, p);
          last = p;
        }
        return { cost: best, points: Number.isFinite(best) ? points : [], length };
      }
    };
  }
  // Best water source for a: a safe point inside a pool's shoreline, or a safe free pump for a nearly empty pool.
  supplyPlan(a, threats, allies, paths) {
    const options = [];
    for (const p of this.puddles) {
      const others = allies.filter(b => b.ai.refill && (b.ai.goal?.id === p.id || b.ai.goal?.puddleId === p.id));
      const available = p.water - others.reduce((n, b) => n + Math.max(0, Math.min(30, 60 - b.water)), 0);
      if (available > 2) {
        const outline = puddleOutline(p);
        // Approach the safe side of the current shoreline rather than always its center.
        for (const i of [0, 16, 32, 48]) {
          const point = { x: p.x + (outline[i].x - p.x) * .58, y: p.y + (outline[i].y - p.y) * .58 };
          if (!this.validPosition(point.x, point.y) || this.terrainRisk(point, threats) > .75) continue;
          const route = paths.to(point), shortfall = Math.max(0, Math.min(40, 60 - a.water) - available);
          const cost = route.cost + this.terrainRisk(point, threats) * 260 + others.length * 170 + shortfall * 9
            - (a.ai.goal?.id === p.id ? 65 : 0);
          options.push({ source: p, point, route, cost });
        }
      }
      const t = this.taps.find(t => t.puddleId === p.id);
      if (!t || !this.usableTap(t) || p.water >= (a.ai.goal?.id === t.id ? 30 : 12)
        || this.terrainRisk(t, threats) > .2) continue;
      if (allies.some(b => b.tapId === t.id || b.ai.goal?.id === t.id
        || distance(b, t) < CONFIG.tapRadius + CONFIG.radius)) continue;
      if (others.length) continue;
      const route = paths.to(t),
        cost = route.cost + 220 + this.terrainRisk(t, threats) * 400 - (a.ai.goal?.id === t.id ? 100 : 0);
      options.push({ source: t, point: t, route, cost });
    }
    return options.filter(o => Number.isFinite(o.cost)).sort((b, c) => b.cost - c.cost)[0] || null;
  }
  // Stage goal for a non-anchor bot: escort a teammate's source, detour through water, or head for the zone.
  terrainObjective(a, threats, allies, anchor, paths, zoneGoal) {
    const ai = a.ai;
    if (a === anchor || this.stage.difficulty === 0) return zoneGoal;
    // From difficulty 2, cover a nearby teammate who works a source close to the objective.
    const worker = allies.find(b => b.tapId || b.ai.refill && b.ai.goal);
    if (worker && this.stage.difficulty >= 2) {
      const source = this.taps.find(t => t.id === worker.tapId) || worker.ai.goal;
      if (source && distance(source, ZONE) < 420 && distance(a, source) < 380) {
        const spots = this.nav.NAV.filter(p => distance(p, source) > 65 && distance(p, source) < 190
          && this.clearPath(p, source) && !allies.some(b => b !== worker && distance(b, p) < 45));
        const best = spots
          .map(p => ({ p, cost: paths.to(p).cost + distance(p, ZONE) * .45 + this.terrainRisk(p, threats) * 140 }))
          .sort((b, c) => b.cost - c.cost)[0];
        if (best && Number.isFinite(best.cost)) return { id: 'escort', x: best.p.x, y: best.p.y, sourceId: source.id };
      }
    }
    // Keep a water-route approach until it is reached, expires or turns risky, then wait 4 s before the next one.
    if (ai.approach) {
      if (distance(a, ai.approach) < 35 || this.time > ai.approach.until
        || this.terrainRisk(ai.approach, threats) > 1) {
        ai.approach = null;
        ai.approachAfter = this.time + 4;
      } else return ai.approach;
    }
    if (this.time < (ai.approachAfter || 0) || distance(a, ZONE) < 100) return zoneGoal;
    // Detour through a pool when that route is not much longer or costlier than going straight to the zone.
    const direct = paths.to(zoneGoal);
    const options = this.puddles.filter(p => p.water > 15).map(p => {
      const point = { x: p.x, y: p.y }, route = paths.to(point);
      const assigned = allies.filter(b => b.ai.baseGoal?.sourceId === p.id || b.ai.goal?.id === p.id).length;
      const waterBenefit = Math.min(p.water, Math.max(0, 65 - a.water)) * 3;
      return { p, route, cost: route.cost + distance(p, zoneGoal) * .7 + assigned * 240 - waterBenefit
        + this.terrainRisk(p, threats) * 180 };
    }).filter(o => o.route.length + distance(o.p, zoneGoal) < direct.length + 300
      && this.terrainRisk(o.p, threats) < .9)
      .sort((b, c) => b.cost - c.cost);
    if (!options[0] || options[0].cost > direct.cost + 100) return zoneGoal;
    const p = options[0].p;
    ai.approach = { id: 'water-route', sourceId: p.id, x: p.x, y: p.y, until: this.time + 4 };
    return ai.approach;
  }
  start() { if (this.state === 'ready') { this.state = 'playing'; this.emit('中央の陣地を確保しよう', 'start'); } }
  selectWeapon(a, id) {
    if (this.state !== 'playing' || !a.alive || !WEAPONS.some(w => w.id === id)) return false;
    if (a.weapon !== id) this.cancelCharge(a);
    a.weapon = id; return true;
  }
  emit(text, type = 'info', team = null) { this.events.push({ text, type, team, time: this.time }); if (this.events.length > 15) this.events.shift(); }
  remainingWater() { return [...this.puddles, ...this.taps].reduce((s, p) => s + p.water, 0); }
  // The pool that tap t pours into.
  puddleOf(t) { return this.puddles.find(p => p.id === t.puddleId); }
  usableTap(t) { return t.water > 1e-7 && this.puddleOf(t).water < this.puddleOf(t).capacity - 1e-7; }
  remainingTime() { return Math.max(0, Math.min(CONFIG.duration, this.finaleEndsAt ?? CONFIG.duration) - this.time); }
  advanceEffects(dt) {
    this.effects = this.effects.filter(e => (e.life -= dt) > 0);
    for (const a of this.actors) a.hitFlash = Math.max(0, a.hitFlash - dt);
  }
  longEscape(a, enemy, threats) {
    // Only reachable cover counts: a nearby point behind a wall is not a retreat route.
    return this.nav.NAV.filter(p => distance(a, p) >= 25 && distance(a, p) <= 180
      && this.clearPath(a, p, NAV_PADDING) && !this.clearPath(enemy, p)
      && !threats.some(b => distance(b, p) < 260 && this.clearPath(b, p))
      && !this.actors.some(b => b.alive && b.id !== a.id && distance(b, p) < 32))
      .sort((b, c) => distance(a, b) - distance(a, c))[0] || null;
  }
  combatPlan(a, enemy, allies, threats, dt, hurt) {
    const ai = a.ai;
    const partners = allies.filter(b => b.recoil <= 0 && !b.ai.refill);
    const attackers = [a, ...partners.filter(b => !b.human && b.ai.duty !== 'anchor')].sort((b, c) => b.id - c.id);
    const slot = Math.max(0, attackers.indexOf(a));
    const d = distance(a, enemy);
    // Commit briefly to a route, but reconsider immediately after damage or target movement.
    ai.tacticWait = (ai.tacticWait || 0) - dt;
    if (ai.tactic && (ai.tactic.target !== enemy.id || distance(ai.tactic.enemy, enemy) > 100 || (hurt && !ai.tactic.hide))) ai.tactic = null;
    if (ai.tactic?.hide) {
      const plan = ai.tactic;
      if (threats.some(b => this.clearPath(b, plan.hide) && distance(b, plan.hide) < 300)) ai.tactic = null;
      else {
        if (plan.phase === 'peek' && (hurt || a.stats.shots - plan.shots >= (a.weapon === 'splash' ? 1 : 3) || this.time > plan.until)) {
          plan.phase = 'hide'; plan.until = this.time + .7; plan.deadline = this.time + 2;
        }
        if (plan.phase === 'hide' && this.time >= plan.until && distance(a, plan.hide) < 20) {
          plan.phase = 'peek'; plan.shots = a.stats.shots; plan.until = this.time + 1.4;
        }
        if (plan.phase === 'hide' && this.time > plan.deadline) ai.tactic = null;
        if (ai.tactic) return { id: plan.phase === 'hide' ? 'cover-hide' : 'cover-peek', ...plan[plan.phase] };
      }
    }
    if (ai.tactic && ai.tacticWait > 0) return ai.tactic.goal;
    ai.tacticWait = .6;
    const nearbyAllies = partners.filter(b => distance(b, enemy) < 330 && this.clearPath(b, enemy));
    const nearbyThreats = threats.filter(b => distance(b, a) < 300).length;
    const rush = a.hp > 50 && a.water >= 20 && d < 260 && nearbyThreats <= 1 + nearbyAllies.length
      && (enemy.recoil > .8 || enemy.hp <= 25 || (d < 150 && nearbyAllies.length > 0));
    const ranged = !rush && slot === 0 && partners.length > 0 && a.water >= 35 && a.weaponCooldowns.long <= 0 && d > 400;
    const range = rush ? 65 : a.water < 5 ? 130 : ranged ? 500 : 240;
    const reserved = p => allies.some(b => b.ai.tactic?.goal && distance(b.ai.tactic.goal, p) < 65);
    let goal;
    // A peek position must have a short, unobstructed escape behind solid cover.
    if (!rush) {
      const pairs = [];
      for (const peek of this.nav.NAV) {
        const pd = distance(peek, enemy);
        if (distance(a, peek) > (ranged ? 300 : 180) || pd < (ranged ? 410 : 140) || pd > (ranged ? 750 : 330)
          || !this.clearPath(peek, enemy) || reserved(peek)) continue;
        const hide = this.nav.NAV.filter(p => distance(peek, p) < 130 && this.clearPath(peek, p, NAV_PADDING)
          && !threats.some(b => this.clearPath(b, p)) && !reserved(p))
          .sort((b, c) => distance(peek, b) - distance(peek, c))[0];
        if (hide) pairs.push({ peek, hide, cost: distance(a, peek) + Math.abs(pd - range) * .5 });
      }
      pairs.sort((b, c) => b.cost - c.cost);
      if (pairs[0]) {
        const {peek, hide} = pairs[0];
        goal = {id: ranged ? 'snipe' : 'cover-peek', ...peek};
        // Long shots already have their own charge/retreat cycle.
        ai.tactic = ranged ? {goal} : {goal, peek, hide, phase: 'peek', shots: a.stats.shots, until: this.time + 2.5};
      }
    }
    if (!goal) {
      const partner = [...partners].sort((b, c) => distance(b, enemy) - distance(c, enemy))[0];
      const base = partner ? Math.atan2(partner.y - enemy.y, partner.x - enemy.x) : Math.atan2(a.y - enemy.y, a.x - enemy.x);
      const side = slot % 2 ? 1 : -1;
      const candidates = [side * 1.4, -side * 1.4, side * .8, -side * .8, 0].map((offset, i) => {
        const angle = base + (rush ? offset * .45 : offset);
        const p = {x: enemy.x + Math.cos(angle) * range, y: enemy.y + Math.sin(angle) * range};
        const exposure = threats.filter(b => b.id !== enemy.id && distance(b, p) < 350 && this.clearPath(b, p)).length;
        const sameAngle = partner && !rush ? Math.max(0, Math.cos(offset) - .25) * 280 : 0;
        return {...p, cost: distance(a, p) + distance(p, ZONE) * .25 + exposure * 220 + sameAngle + i * 12 + (reserved(p) ? 350 : 0)};
      }).filter(p => this.validPosition(p.x, p.y) && this.clearPath(p, enemy) && distance(a, this.nextWaypoint(a, p)) > 1);
      candidates.sort((b, c) => b.cost - c.cost);
      if (!candidates[0]) { ai.tactic = null; return null; }
      goal = {id: rush ? 'rush' : 'pincer', x: candidates[0].x, y: candidates[0].y};
      ai.tactic = {goal};
    }
    ai.tactic.target = enemy.id; ai.tactic.enemy = {x: enemy.x, y: enemy.y};
    return goal;
  }
  // One bot decision per tick. The steps run in this order and share their working values through ctx.
  botControl(a, dt) {
    const ctx = this.perceive(a, dt);
    this.assignDuties(ctx);
    this.planGoal(ctx);
    this.tacticalOverride(ctx);
    this.commitGoal(ctx);
    this.updateWaypoint(ctx);
    this.steer(ctx);
    this.aimAndChooseWeapon(ctx);
    this.applyProfileLimits(ctx);
    this.dodgeLockedBeam(ctx);
    return { x: ctx.mx, y: ctx.my, aim: ctx.aim, shoot: ctx.shoot };
  }
  // Sight, shared sightings, the target and the pressure on this bot; a stage bot also resumes its planned goal.
  perceive(a, dt) {
    const ai = a.ai;
    const profile = this.aiProfile;
    const foes = this.actors.filter(b => b.alive && b.team !== a.team);
    const visible = foes.filter(b => distance(a, b) < WEAPONS[2].range && this.clearPath(a, b));
    visible.sort((b, c) => distance(a, b) - distance(a, c));
    const allies = this.actors.filter(b => b.alive && b.team === a.team && b.id !== a.id);
    const threats = this.stage ? this.knownThreats(a, visible, allies) : foes;
    // React to immediate threats first; otherwise focus exposed objective threats together.
    const priority = b => distance(a, b) + b.hp * 1.3 - (distance(b, ZONE) < ZONE.r ? 220 : 0)
      - allies.filter(c => c.ai.targetId === b.id && distance(c, b) < 500).length * (profile?.focus ?? 45)
      - (this.stage?.difficulty === 3 && (b.recoil > 0 || b.tapId) ? 150 : 0);
    const enemy = visible[0] && distance(a, visible[0]) < 300 ? visible[0]
      : [...visible].sort((b, c) => priority(b) - priority(c))[0];
    if (ai.targetId !== (enemy?.id ?? null)) ai.reactionUntil = this.time + (profile?.reaction || 0);
    ai.targetId = enemy?.id ?? null;
    if (enemy) ai.sighting = { id: enemy.id, x: enemy.x, y: enemy.y, time: this.time };
    const previousGoal = ai.goal;
    if (this.stage && ai.baseGoal) ai.goal = ai.baseGoal;
    const hurt = a.hp < ai.lastHp;
    ai.lastHp = a.hp;
    // React every frame, even while travelling to or operating a faucet.
    const danger = hurt || (enemy && distance(a, enemy) < 300);
    if (danger) ai.avoidSupplyUntil = this.time + 1.5;
    const unsafe = this.time < ai.avoidSupplyUntil;
    const urgent = this.scores[1 - a.team] >= 24
      || (this.remainingTime() <= 20 && this.scores[a.team] <= this.scores[1 - a.team]);
    const retreat = !!enemy && (a.recoil > 1e-8 || a.hp <= 30 || a.water < 15
      || visible.filter(b => distance(a, b) < 280).length > 1 + allies.filter(b => distance(a, b) < 240).length);
    return { a, ai, dt, profile, foes, visible, allies, threats, enemy, previousGoal, hurt, unsafe, urgent, retreat };
  }
  // Roles: the anchor holds the objective, at most one supplier fetches water, everyone else flanks.
  assignDuties(ctx) {
    const { a, ai, allies, unsafe, urgent } = ctx;
    const anchor = [a, ...allies].filter(b => !b.human && b.water >= 25 && b.hp > 30 && b.recoil <= 1e-8)
      .sort((b, c) => (distance(b, ZONE) - (b.ai.duty === 'anchor' ? 80 : 0))
        - (distance(c, ZONE) - (c.ai.duty === 'anchor' ? 80 : 0)) || b.id - c.id)[0];
    const supplyWorkers = allies.filter(b => b.tapId
      || (!b.human && b.ai.refill && b.ai.goal && b.ai.goal.id !== 'zone'));
    const supplier = [a, ...allies].filter(b => !b.human && b !== anchor && b.hp > 30 && b.recoil <= 1e-8
      && (!this.stage || this.time >= (b.ai.supplyRetryAt || 0))
      && this.time >= b.ai.avoidSupplyUntil && (b.water < 25 || b.ai.refill && b.water < 60))
      .sort((b, c) => (b.water - (b.ai.duty === 'supply' ? 8 : 0))
        - (c.water - (c.ai.duty === 'supply' ? 8 : 0)) || b.id - c.id)[0];
    const waterAvailable = this.remainingWater() > 1e-7;
    if (!waterAvailable) {
      ai.refill = false;
      if (ai.goal?.id !== 'zone') ai.think = 0;
    } else {
      if (a.water < 25) ai.refill = true;
      if (a.water >= 60) ai.refill = false;
    }
    // Keep a combat-capable bot on the objective and limit support to one bot.
    if (unsafe || urgent || anchor === a || supplier !== a
      || (!this.stage && supplyWorkers.some(b => b.human))) ai.refill = false;
    ai.duty = ai.refill ? 'supply' : anchor === a ? 'anchor' : 'flank';
    ctx.anchor = anchor;
    ctx.waterAvailable = waterAvailable;
  }
  // Replan when the situation changed, otherwise every `think` seconds: water first if assigned, else the objective.
  planGoal(ctx) {
    const { a, ai, dt, allies, threats, hurt, urgent, waterAvailable } = ctx;
    if (!this.stage && !ai.refill && ai.goal?.id !== 'zone') ai.think = 0;
    if (this.stage && (ai.plannedRefill !== ai.refill || ai.plannedUrgent !== urgent || ai.plannedDuty !== ai.duty
      || hurt || (ai.refill && ai.goal && !ai.goal.puddleId && ai.goal.water <= 1e-7))) ai.think = 0;
    if (ai.refill && ai.goal?.id === 'zone') ai.think = 0;
    if (ai.goal?.puddleId && (!this.usableTap(ai.goal) || this.puddleOf(ai.goal).water >= 30)) ai.think = 0;
    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = this.stage ? .8 + a.role * .08 : .35 + this.random() * .2;
      const paths = this.stage ? this.terrainPaths(a, threats, allies, urgent) : null;
      if (ai.refill && waterAvailable) this.chooseSupplyGoal(ctx, paths);
      if (!ai.refill || !ai.goal) this.chooseObjectiveGoal(ctx, paths);
      if (this.stage) {
        ai.baseGoal = ai.goal;
        ai.plannedRefill = ai.refill;
        ai.plannedUrgent = urgent;
        ai.plannedDuty = ai.duty;
        if (!ai.refill) ai.supplyPoint = null;
      }
    }
  }
  // Water source: the terrain planner on a stage, otherwise a cost over distance, claims and nearby foes.
  chooseSupplyGoal(ctx, paths) {
    const { a, ai, foes, allies, threats } = ctx;
    if (this.stage) {
      const supply = this.supplyPlan(a, threats, allies, paths);
      ai.goal = supply?.source || null;
      ai.supplyPoint = supply?.point || null;
      if (!supply) ai.supplyRetryAt = this.time + 1.2;
    } else {
      const safe = (p, range) => !foes.some(b => distance(b, p) < range && this.clearPath(b, p));
      const sources = this.puddles.filter(p => p.water > 1e-7 && safe(p, 220));
      sources.push(...this.taps.filter(t => this.usableTap(t) && safe(t, 350)
        && this.puddleOf(t).water < (ai.goal?.id === t.id ? 30 : 12)
        && !this.actors.some(b => b.alive && b.id !== a.id && (distance(b, t) <= CONFIG.tapRadius + CONFIG.radius
          || (b.team === a.team && !b.human && b.ai.goal?.id === t.id && (ai.goal?.id !== t.id || b.id < a.id))))));
      const options = sources.map(p => {
        const assigned = allies.filter(b => b.ai.goal?.id === p.id).length;
        const threat = foes.filter(b => distance(b, p) < 180).length;
        const side = a.role === 1 ? 'north' : 'south';
        const openingBonus = p.id === side ? 130 : 0;   // (this branch only runs without a stage)
        return { p, cost: distance(a, p) + assigned * 180 + threat * 85 + (p.puddleId ? 180 : p.water < 20 ? 100 : 0)
          - (ai.goal?.id === p.id ? 70 : 0) - (this.time < 6 ? openingBonus : 0) };
      }).sort((b, c) => b.cost - c.cost);
      ai.goal = options[0]?.p || null;
    }
  }
  // The objective lane (anchor near the middle, flankers alternating above and below), a stage escort or detour,
  // or a retreat to safe water or cover.
  chooseObjectiveGoal(ctx, paths) {
    const { a, ai, allies, threats, anchor, urgent, retreat } = ctx;
    ai.refill = false;
    const flankers = [a, ...allies].filter(b => !b.human && b !== anchor && !b.ai.refill).sort((b, c) => b.id - c.id);
    const lane = flankers.indexOf(a) % 2 === 0 ? -1 : 1;
    ai.goal = { id: 'zone', x: ZONE.x + (a.team ? 1 : -1) * (anchor === a ? 18 : 40),
      y: ZONE.y + (anchor === a ? 0 : lane * 43) };
    if (this.stage && !urgent && !retreat) ai.goal = this.terrainObjective(a, threats, allies, anchor, paths, ai.goal);
    if (retreat && !urgent && this.finaleEndsAt === null) {
      // Head for safe water or cover using navigation, not straight into a wall.
      const escapes = [...this.puddles.filter(p => p.water >= 5), ...this.nav.NAV]
        .filter(p => distance(a, p) > 35 && !threats.some(b => distance(b, p) < 240 && this.clearPath(b, p)))
        .map(p => ({ p, cost: (paths ? paths.to(p).cost : distance(a, p)) + (p.water ? 0 : 160) }))
        .filter(o => Number.isFinite(o.cost)).sort((b, c) => b.cost - c.cost).map(o => o.p);
      if (escapes[0]) ai.goal = { id: 'retreat', x: escapes[0].x, y: escapes[0].y };
    }
  }
  // Tactical goals (peek from cover, pincer, rush, snipe, guard a recovering ally, retreat after a long shot)
  // override the planned goal.
  tacticalOverride(ctx) {
    const { a, ai, dt, profile, visible, allies, enemy, hurt, urgent, retreat, anchor } = ctx;
    let tacticalGoal = null;
    if ((!profile || profile.tactics) && !ai.refill && !urgent && !retreat && anchor !== a && a.recoil <= 0
      && this.finaleEndsAt === null
      && (!this.stage || !['water-route', 'escort'].includes(ai.goal?.id) || enemy && distance(a, enemy) < 140)) {
      if (enemy) tacticalGoal = this.combatPlan(a, enemy, allies, visible, dt, hurt);
      else if (ai.tactic?.hide && ai.sighting && this.time - ai.sighting.time < 2) {
        // Use the last seen position only; hidden opponents are not tracked through walls.
        tacticalGoal = this.combatPlan(a, ai.sighting, allies, [], dt, hurt);
      } else ai.tactic = null;
      if (tacticalGoal) ai.goal = tacticalGoal;
    } else ai.tactic = null;
    if (this.stage?.difficulty === 3 && !ai.refill && !urgent && !retreat && anchor !== a && enemy) {
      const recovering = allies.find(b => b.recoil > 1 && distance(a, b) < 260);
      if (recovering && distance(recovering, enemy) > 250) {
        const angle = Math.atan2(enemy.y - recovering.y, enemy.x - recovering.x);
        const guard = { id: 'guard', x: recovering.x + Math.cos(angle) * 100, y: recovering.y + Math.sin(angle) * 100 };
        if (this.validPosition(guard.x, guard.y) && this.clearPath(a, guard, NAV_PADDING)) {
          tacticalGoal = guard;
          ai.goal = guard;
        }
      }
    }
    if (a.recoil > 1e-8 && ai.longEscape) {
      const escape = ai.longEscape;
      if (!visible.some(b => distance(b, escape) < 240
        && this.clearPath(b, escape))) ai.goal = { id: 'retreat', ...escape };
      else ai.longEscape = null;
    }
    ctx.tacticalGoal = tacticalGoal;
  }
  // Reset the path when the goal moved, set the mode label, and fix this tick's goal and travel target.
  commitGoal(ctx) {
    const { ai, previousGoal, enemy, urgent, retreat, tacticalGoal } = ctx;
    if (ai.goal?.id !== previousGoal?.id || (previousGoal && ai.goal && distance(previousGoal, ai.goal) > 30)) {
      ai.waypoint = null;
      ai.pathTime = 0;
    }
    ai.mode = ai.refill ? ai.goal?.puddleId ? 'watering' : 'refill'
      : retreat && !urgent ? 'retreat' : enemy ? 'combat' : 'objective';
    if (this.stage && ['water-route', 'escort'].includes(ai.goal?.id)) ai.mode = ai.goal.id;
    if (tacticalGoal) ai.mode = tacticalGoal.id;
    const goal = ai.goal || ZONE;
    const travelGoal = this.stage && ai.refill && ai.supplyPoint ? ai.supplyPoint : goal;
    ctx.goal = goal;
    ctx.travelGoal = travelGoal;
  }
  // Next waypoint. On a stage: the risk-aware terrain route, replanned about every second, when the travel target
  // moves, on damage or when its next point is blocked. Otherwise: the cover navigation graph.
  updateWaypoint(ctx) {
    const { a, ai, dt, allies, threats, hurt, urgent, travelGoal } = ctx;
    ai.pathTime -= dt;
    if (this.stage) {
      const route = ai.route;
      if (!route || ai.pathTime <= 0 || distance(route.target, travelGoal) > 30 || hurt
        || route.points[0] && !this.clearPath(a, route.points[0], NAV_PADDING)) {
        const plan = this.terrainPaths(a, threats, allies, urgent).to(travelGoal);
        ai.route = { points: plan.points, target: { x: travelGoal.x, y: travelGoal.y } };
        ai.pathTime = .9 + a.role * .07;
      }
      while (ai.route.points.length > 1 && distance(a, ai.route.points[0]) < 14) ai.route.points.shift();
      ai.waypoint = ai.route.points[0] || this.nextWaypoint(a, travelGoal);
    } else if (!ai.waypoint || ai.pathTime <= 0 || distance(a, ai.waypoint) < 12) {
      ai.pathTime = .35;
      ai.waypoint = this.nextWaypoint(a, travelGoal);
    }
  }
  // Movement toward the waypoint, adjusted for supply work, combat spacing and strafing, and ally separation.
  steer(ctx) {
    const { a, ai, enemy, allies, anchor, urgent, retreat, tacticalGoal, goal } = ctx;
    let mx = ai.waypoint.x - a.x, my = ai.waypoint.y - a.y;
    const len = Math.hypot(mx, my);
    if (len > (ai.refill ? .2 : 6)) {
      mx /= len;
      my /= len;
    } else {
      mx = 0;
      my = 0;
    }
    if (ai.refill && goal.puddleId && distance(a, goal) <= CONFIG.tapRadius - 7) {
      mx = 0;
      my = 0;
    }
    if (ai.refill && !goal.puddleId && insidePuddle(a, goal)) {
      mx *= .15;
      my *= .15;
    }
    if (enemy && !ai.refill) {
      const d = Math.max(distance(a, enemy), 1e-6), ex = (enemy.x - a.x) / d, ey = (enemy.y - a.y) / d;
      const strafe = Math.sin(this.time * 1.9 + ai.phase) * (this.finaleEndsAt === null ? 1 : .35);
      // Hold room to dodge instead of converging into point-blank focus fire.
      if (retreat && d < 180 && goal.id !== 'retreat' && !urgent && this.finaleEndsAt === null) {
        mx = -ex * .85;
        my = -ey * .85;
      }
      if (!tacticalGoal && !this.stage && goal.id !== 'retreat' && this.clearPath(a, goal, NAV_PADDING)) {
        mx += -ey * strafe * .35;
        my += ex * strafe * .35;
      }
      if (goal.id === 'zone' && distance(a, ZONE) < 65) {
        if (anchor === a && !retreat) {
          mx = (goal.x - a.x) * .04;
          my = (goal.y - a.y) * .04;
        } else {
          mx += (goal.x - a.x) * .012;
          my += (goal.y - a.y) * .012;
        }
      }
    }
    if (!ai.refill && goal.id !== 'retreat') for (const b of allies) {
      const d = distance(a, b);
      if (d > .01 && d < 46) {
        mx += (a.x - b.x) / d * (1 - d / 46);
        my += (a.y - b.y) / d * (1 - d / 46);
      }
    }
    // Never stand still at a faucet while trying to fight or escape.
    if (!ai.refill && this.taps.some(t => distance(a, t) <= CONFIG.tapRadius) && Math.hypot(mx, my) < .1) {
      mx = enemy ? a.x - enemy.x : ZONE.x - a.x;
      my = enemy ? a.y - enemy.y : ZONE.y - a.y;
      const d = Math.hypot(mx, my);
      mx = d ? mx / d : 1;
      my = d ? my / d : 0;
    }
    ctx.mx = mx;
    ctx.my = my;
    ctx.len = len;
  }
  // Aim with lead at the target and pick splash, long or normal. A long shot needs a safe moment, a far target and
  // a reachable cover to retreat to; lining it up slows the bot down.
  aimAndChooseWeapon(ctx) {
    const { a, ai, dt, profile, visible, allies, enemy, hurt, urgent, retreat, anchor, goal, len } = ctx;
    let { mx, my } = ctx;
    let aim = a.aim, shoot = false;
    let liningUp = false;
    if (enemy) {
      const d = distance(a, enemy);
      const longLead = d / WEAPONS[2].speed * .65;
      const predicted = { x: enemy.x + enemy.vx * longLead, y: enemy.y + enemy.vy * longLead };
      const angle = Math.atan2(predicted.y - a.y, predicted.x - a.x);
      const turning = Math.abs(Math.atan2(Math.sin(angle - ai.aimAngle), Math.cos(angle - ai.aimAngle)));
      const incoming = this.bullets.some(b => b.team !== a.team && distance(a, b) < 180
        && (a.x - b.x) * b.vx + (a.y - b.y) * b.vy > 0);
      const coveredByTeam = !allies.some(b => b.recoil > 1e-8)
        && this.time - this.lastTeamLong[a.team] > (profile?.longGap ?? 1.5);
      const holdZone = anchor === a && distance(a, ZONE) < ZONE.r
        && !allies.some(b => distance(b, ZONE) < ZONE.r && b.recoil <= 1e-8);
      const escape = !urgent && !ai.refill && !hurt && !incoming && !retreat && !holdZone && coveredByTeam
        && (!this.stage || ai.goal?.id !== 'water-route')
        && a.hp > 35 && a.water >= 35 && a.recoil <= 1e-8 && a.weaponCooldowns.long <= 1e-8
        && d > 400 && d < 1100 && !visible.some(b => distance(a, b) < 280) && this.clearPath(a, predicted)
        && (this.stage?.difficulty !== 0 || (this.time > 12 && a.role === 2 && this.longEscape(enemy, a, [a])))
        ? this.longEscape(a, enemy, visible) : null;
      if (escape) {
        ai.aimTime = ai.aimTarget === enemy.id && turning < .12 ? ai.aimTime + dt : 0;
        ai.aimTarget = enemy.id;
        ai.aimAngle = angle;
        ai.longEscape = { x: escape.x, y: escape.y };
        liningUp = true;
      } else {
        ai.aimTime = 0;
        ai.aimTarget = null;
      }
      const longReady = liningUp && (a.charge > 0 || ai.aimTime >= (profile?.aim ?? .3) + a.role * .1);
      a.weapon = d < WEAPONS[1].range * .75 && a.water >= 15 && a.weaponCooldowns.splash <= 1e-8 ? 'splash'
        : longReady ? 'long' : 'normal';
      const lead = d / selectedWeapon(a).speed * .65;
      aim = Math.atan2(enemy.y + enemy.vy * lead - a.y, enemy.x + enemy.vx * lead - a.x);
      aim += (Math.sin(this.time * 2.7 + ai.phase) * .36 + Math.sin(this.time * 5 + ai.phase) * .17)
        * (a.weapon === 'long' ? .25 : 1) * (profile?.error ?? 1);
      shoot = (!ai.refill || d < 180) && d <= shotRange(a) + CONFIG.radius;
      if (goal.id === 'cover-hide') shoot = false;
    } else {
      ai.aimTime = 0;
      ai.aimTarget = null;
      if (a.weapon === 'long') a.weapon = 'normal';
      if (len > 6) aim = Math.atan2(my, mx);
    }
    if (liningUp) {
      if (a.charge <= 0) {
        mx *= .3;
        my *= .3;
      }
      ai.mode = 'aiming';
    }
    ctx.mx = mx;
    ctx.my = my;
    ctx.aim = aim;
    ctx.shoot = shoot;
  }
  // Difficulty profile: reaction delay, burst / rest firing rhythm and the tutorial's opening grace period.
  applyProfileLimits(ctx) {
    const { a, ai, profile } = ctx;
    let { mx, my, shoot } = ctx;
    if (profile) {
      const firingWindow = (this.time + a.id * .31) % (profile.burst + profile.rest) < profile.burst;
      if (this.time < (ai.reactionUntil || 0) || (a.weapon !== 'long' && !firingWindow)) shoot = false;
      // Let the player discover the water and join the first exchange before pressure arrives.
      if (this.stage.difficulty === 0 && a.team === 1 && this.time < 4) {
        mx *= .35;
        my *= .35;
        shoot = false;
      }
    }
    ctx.mx = mx;
    ctx.my = my;
    ctx.shoot = shoot;
  }
  // The same visible, locked warning that the player sees can be sidestepped by bots.
  dodgeLockedBeam(ctx) {
    const { a, ai, profile, visible } = ctx;
    let { mx, my, shoot } = ctx;
    const warning = visible.find(b => b.charge >= CONFIG.longChargeDuration - CONFIG.longLockDuration - 1e-8
      && (a.x - b.x) * Math.cos(b.chargeAim) + (a.y - b.y) * Math.sin(b.chargeAim) > 0
      && Math.abs((a.x - b.x) * Math.sin(b.chargeAim) - (a.y - b.y) * Math.cos(b.chargeAim)) < CONFIG.radius + 18);
    if (warning && (!profile || profile.dodge)) {
      const px = -Math.sin(warning.chargeAim), py = Math.cos(warning.chargeAim);
      const escapes = [-1, 1].map(sign => ({ x: a.x + px * sign * 50, y: a.y + py * sign * 50, sign }))
        .filter(p => this.validPosition(p.x, p.y) && this.clearPath(a, p, NAV_PADDING))
        .sort((b, c) => distance(c, ZONE) - distance(b, ZONE));
      if (escapes[0]) {
        mx = px * escapes[0].sign;
        my = py * escapes[0].sign;
        shoot = false;
        ai.aimTime = 0;
        ai.mode = 'evade';
      }
    }
    ctx.mx = mx;
    ctx.my = my;
    ctx.shoot = shoot;
  }
  cancelCharge(a) { a.charge = 0; }
  updateCharge(a, desiredAim, dt) {
    if (!a.firing || a.weapon !== 'long' || !hasWeaponWater(a) || weaponWait(a) > 1e-6 || a.fireLock > 1e-8) {
      this.cancelCharge(a); return;
    }
    if (a.charge <= 0) a.chargeAim = desiredAim;
    else if (a.charge < CONFIG.longChargeDuration - CONFIG.longLockDuration - 1e-8) {
      const angle = Math.atan2(Math.sin(desiredAim - a.chargeAim), Math.cos(desiredAim - a.chargeAim));
      a.chargeAim += clamp(angle, -CONFIG.longTurnRate * dt, CONFIG.longTurnRate * dt);
    }
    a.charge = Math.min(CONFIG.longChargeDuration, a.charge + dt); a.aim = a.chargeAim;
  }
  move(a, dx, dy) {
    const nx = clamp(a.x + dx, WALK_MARGIN + CONFIG.radius, CONFIG.width - WALK_MARGIN - CONFIG.radius);
    if (this.validPosition(nx, a.y)) a.x = nx;
    const ny = clamp(a.y + dy, WALK_MARGIN + CONFIG.radius, CONFIG.height - WALK_MARGIN - CONFIG.radius);
    if (this.validPosition(a.x, ny)) a.y = ny;
  }
  update(dt, input = {}) {
    // Autopilot (title demo / testing): actor 0 is a bot for this step, judged exactly like the others.
    // Additive only: with autopilot unset every rule below runs unchanged.
    if (this.autopilot && this.actors[0].human) {
      this.actors[0].human = false;
      try { return this.update(dt, input); } finally { this.actors[0].human = true; }
    }
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05);
    this.time = Math.min(CONFIG.duration, this.finaleEndsAt ?? CONFIG.duration, this.time + dt);
    const oldOwner = this.zoneOwner;
    this.advanceEffects(dt);
    this.moveActors(dt, input);
    const live = this.actors.filter(a => a.alive);
    this.separateBodies(live);
    // Resolve ownership after every actor moves, before any actor fires.
    this.updateZonePresence();
    this.fireWeapons(live);
    this.operateTaps(live, dt);
    this.refillFromPuddles(live, dt);
    this.advanceBullets(dt);
    // Hits during bullet travel can defeat actors, so ownership is resolved again before scoring.
    this.updateZonePresence();
    this.scoreZone(oldOwner, dt);
    this.checkEnd();
  }
  // In actor order: tick timers, read the control (player input or botControl), charge and move. Standing still
  // within reach of a usable, unoccupied faucet walks the actor onto its operating position instead of firing.
  moveActors(dt, input) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      a.recoil = Math.max(0, a.recoil - dt);
      a.flinch = Math.max(0, a.flinch - dt);
      a.fireLock = Math.max(0, a.fireLock - dt);
      a.flinchGuard = Math.max(0, a.flinchGuard - dt);
      const control = a.human ? { x: input.x || 0, y: input.y || 0, aim: input.aim ?? a.aim, shoot: !!input.shoot }
        : this.botControl(a, dt);
      const tap = Math.hypot(control.x, control.y) < 1e-8
        ? this.taps.find(t => this.usableTap(t) && distance(a, t) <= CONFIG.tapRadius
          && !this.actors.some(b => b.alive && b.id !== a.id && distance(b, t) < CONFIG.radius * 2)) : null;
      a.tapId = null;
      a.aim = control.aim;
      a.firing = control.shoot && !tap && a.recoil <= 1e-8;
      this.updateCharge(a, control.aim, dt);
      a.refilling = false;
      a.refillAmount = 0;
      const puddle = this.puddles.find(p => insidePuddle(a, p));
      a.slowFactor = puddle ? 1 - puddle.slow * puddle.water / puddle.capacity : 1;
      if (a.flinch > 1e-8) a.slowFactor = Math.min(a.slowFactor, CONFIG.flinchSpeed);
      if (a.recoil > 1e-8) a.slowFactor = Math.min(a.slowFactor, CONFIG.recoilSpeed);
      if (a.charge > 0) a.slowFactor = Math.min(a.slowFactor, CONFIG.longChargeSpeed);
      const norm = Math.max(1, Math.hypot(control.x, control.y));
      const old = { x: a.x, y: a.y };
      this.move(a, control.x / norm * CONFIG.speed * a.slowFactor * dt,
        control.y / norm * CONFIG.speed * a.slowFactor * dt);
      if (tap) {
        const d = distance(a, tap), step = Math.min(d, 90 * a.slowFactor * dt);
        if (d > 1e-8) this.move(a, (tap.x - a.x) / d * step, (tap.y - a.y) / d * step);
        if (distance(a, tap) < 1e-6) a.tapId = tap.id;
      }
      a.vx = (a.x - old.x) / dt;
      a.vy = (a.y - old.y) / dt;
      a.cooldown = Math.max(0, a.cooldown - dt);
      for (const id of Object.keys(a.weaponCooldowns)) a.weaponCooldowns[id] = Math.max(0, a.weaponCooldowns[id] - dt);
    }
  }
  // Resolve body overlap without pushing an actor through a cover.
  separateBodies(live) {
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j], d = distance(a, b);
      if (d < CONFIG.radius * 2 && d > .001) {
        const push = (CONFIG.radius * 2 - d) / 2, dx = (a.x - b.x) / d * push, dy = (a.y - b.y) / d * push;
        this.move(a, dx, dy);
        this.move(b, -dx, -dy);
      }
    }
  }
  // Every ready shooter fires in actor order: pay water and timers, take long-barrel recoil, spawn effect and pellets.
  fireWeapons(live) {
    for (const a of live) {
      if (a.firing && weaponWait(a) <= 1e-6 && a.fireLock <= 1e-8) {
        const w = selectedWeapon(a), weak = !hasWeaponWater(a), boosted = !weak && this.zoneOwner === a.team;
        if (w.id === 'long' && !weak && a.charge < CONFIG.longChargeDuration - 1e-8) continue;
        // Recheck here: several bots can finish aiming during the same simulation tick.
        if (!a.human && w.id === 'long' && !weak && (this.time - this.lastTeamLong[a.team] <= 1.5
          || live.some(b => b.id !== a.id && b.team === a.team && b.recoil > 1e-8))) continue;
        if (!weak) {
          a.water = Math.max(0, a.water - w.cost);
          this.usedWater += w.cost;
        }
        a.cooldown = weak ? CONFIG.weakFireInterval : CONFIG.fireInterval;
        a.weaponCooldowns[w.id] = weak ? CONFIG.weakFireInterval : w.interval;
        if (!weak && w.id === 'long') {
          a.recoil = CONFIG.recoilDuration;
          a.recoilAim = a.aim;
          a.slowFactor = Math.min(a.slowFactor, CONFIG.recoilSpeed);
          this.lastTeamLong[a.team] = this.time;
          a.ai.aimTime = 0;
        }
        this.cancelCharge(a);
        a.lastShotWeak = weak;
        a.lastShotWeapon = w.id;
        a.stats.shots++;
        if (weak) a.stats.weakShots++;
        const pellets = weak ? 1 : w.pellets, range = weak ? CONFIG.weakRange : w.range,
          speed = weak ? CONFIG.bulletSpeed : w.speed;
        if (!weak && w.id !== 'normal') {
          const duration = w.id === 'long' ? .42 : .32;
          this.effects.push({ kind: 'fire', weapon: w.id, x: a.x, y: a.y, aim: a.aim, team: a.team, owner: a.id,
            range, spread: w.spread, speed, seed: this.nextBullet, life: duration, total: duration });
        }
        for (let i = 0; i < pellets; i++) {
          const angle = a.aim + (pellets === 1 ? 0 : (i / (pellets - 1) - .5) * w.spread);
          this.bullets.push({ id: this.nextBullet++, owner: a.id, team: a.team, x: a.x, y: a.y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: range / speed, remaining: range,
            travelled: 0, weapon: w.id, pierce: !weak && w.pierce, hitIds: [], weak, boosted,
            damage: weak ? CONFIG.weakDamage : w.damage * (boosted ? CONFIG.controlDamageMultiplier : 1) });
        }
      }
    }
  }
  // Supply starts only at the fixed operating position, after collision resolution.
  operateTaps(live, dt) {
    for (const t of this.taps) {
      t.flow = 0;
      for (const a of live) if (a.tapId === t.id && distance(a, t) > 1e-6) a.tapId = null;
      if (!live.some(a => a.tapId === t.id)) continue;
      const p = this.puddleOf(t);
      const amount = Math.min(CONFIG.tapRate * dt, t.water, p.capacity - p.water);
      t.water = Math.max(0, t.water - amount);
      p.water += amount;
      t.flow = amount / dt;
    }
  }
  // Share the final drops proportionally; update all refill requests together.
  refillFromPuddles(live, dt) {
    for (const p of this.puddles) {
      if (p.water <= 0) continue;
      const requests = live.filter(a => !a.tapId && insidePuddle(a, p)).map(a => ({
        a, amount: Math.min(CONFIG.capacity - a.water, (a.firing ? CONFIG.firingRefillRate : CONFIG.refillRate) * dt)
      }));
      const wanted = requests.reduce((s, r) => s + r.amount, 0), ratio = wanted > p.water ? p.water / wanted : 1;
      for (const r of requests) {
        const amount = r.amount * ratio;
        r.a.water += amount;
        r.a.stats.refilled += amount;
        r.a.refillAmount = amount / dt;
        r.a.refilling = amount > .00001;
      }
      p.water = Math.max(0, p.water - wanted * ratio);
      if (wanted > 0 && p.water < 1e-7) {
        p.water = 0;
        this.emit(`${p.label}が枯れた`, 'dry');
      }
    }
    // The pool each actor stands in, after this tick's refills.
    for (const a of live) a.puddleId = this.puddles.find(p => insidePuddle(a, p))?.id ?? null;
  }
  // Move every shot one tick: a wall, a hit (the first unless piercing) or its range ends it; off-arena shots vanish.
  advanceBullets(dt) {
    const kept = [];
    for (const b of this.bullets) {
      const speed = Math.hypot(b.vx, b.vy);
      const instant = b.weapon === 'long' && !b.weak;
      const travel = instant ? b.remaining : Math.min(speed * dt, b.remaining ?? speed * b.life, speed * b.life);
      if (travel <= 1e-8 || speed <= 0) continue;
      const end = { x: b.x + b.vx / speed * travel, y: b.y + b.vy / speed * travel };
      let wall = 2;
      for (const o of this.obstacles) {
        const t = segmentRect(b, end, o, 2);
        if (t !== null) wall = Math.min(wall, t);
      }
      if (instant) {
        for (const [start, delta, min, max] of [[b.x, end.x - b.x, BULLET_MARGIN, CONFIG.width - BULLET_MARGIN],
          [b.y, end.y - b.y, BULLET_MARGIN, CONFIG.height - BULLET_MARGIN]]) {
          if (delta > 0) wall = Math.min(wall, (max - start) / delta);
          else if (delta < 0) wall = Math.min(wall, (min - start) / delta);
        }
        const fraction = Math.min(1, wall);
        this.effects.push({ kind: 'beam', x: b.x, y: b.y,
          endX: b.x + (end.x - b.x) * fraction, endY: b.y + (end.y - b.y) * fraction, team: b.team, owner: b.owner,
          weapon: 'long', damage: b.damage, pierce: true, boosted: b.boosted, life: .24, total: .24 });
      }
      b.hitIds ||= [];
      const hits = this.actors.filter(a => a.alive && a.team !== b.team && !b.hitIds.includes(a.id))
        .map(a => ({ a, t: segmentCircle(b, end, a, CONFIG.radius + 3) }))
        .filter(h => h.t !== null && h.t < wall).sort((a, b) => a.t - b.t);
      let stopped = false;
      for (const h of hits) {
        this.hitBullet(b, h.a, b.x + (end.x - b.x) * h.t, b.y + (end.y - b.y) * h.t);
        b.hitIds.push(h.a.id);
        if (!b.pierce) {
          stopped = true;
          break;
        }
      }
      if (stopped) continue;
      if (wall <= 1) {
        this.hitBullet(b, null, b.x + (end.x - b.x) * wall, b.y + (end.y - b.y) * wall);
        continue;
      }
      b.x = end.x;
      b.y = end.y;
      b.travelled = (b.travelled || 0) + travel;
      b.life = Math.max(0, b.life - travel / speed);
      b.remaining = Math.max(0, (b.remaining ?? travel + speed * b.life) - travel);
      if (b.remaining <= 1e-7 || b.life <= 1e-7) {
        this.hitBullet(b, null, b.x, b.y);
        continue;
      }
      if (b.x > BULLET_MARGIN && b.x < CONFIG.width - BULLET_MARGIN
        && b.y > BULLET_MARGIN && b.y < CONFIG.height - BULLET_MARGIN) kept.push(b);
    }
    this.bullets = kept;
  }
  // The team holding the zone alone gains capture time; its members inside it earn the capture stat.
  scoreZone(oldOwner, dt) {
    if (this.zoneOwner !== null) {
      this.scores[this.zoneOwner] = Math.min(CONFIG.captureGoal, this.scores[this.zoneOwner] + dt);
      for (const a of this.actors) if (a.alive && a.team === this.zoneOwner
        && distance(a, ZONE) <= ZONE.r) a.stats.capture += dt;
      if (oldOwner !== this.zoneOwner) this.emit(this.zoneOwner === 0 ? 'ブルーチームが確保中' : 'オレンジチームが確保中',
        'capture', this.zoneOwner);
    }
  }
  // Elimination, a full capture or the time limit ends the round; once all water is gone a short finale starts.
  checkEnd() {
    const living = [0, 0];
    for (const a of this.actors) if (a.alive) living[a.team]++;
    if (!living[0] || !living[1]) this.finish(!living[0] && !living[1] ? null : living[0] ? 0 : 1, '全滅');
    else if (this.scores.some(s => s >= CONFIG.captureGoal - 1e-8))
      this.finish(this.scores[0] >= CONFIG.captureGoal - 1e-8 ? 0 : 1, '陣地を30秒確保');
    else if (this.time >= CONFIG.duration - 1e-8) {
      this.time = CONFIG.duration;
      this.finishByScore('タイムアップ');
    } else {
      // Start once, even with shots in flight. Free weak shots cannot postpone the deadline.
      if (this.finaleEndsAt === null && this.remainingWater() <= 1e-7
        && this.actors.filter(a => a.alive).every(a => !hasWaterShot(a))) {
        this.finaleEndsAt = Math.min(CONFIG.duration, this.time + CONFIG.finaleDuration);
        this.emit(`水が尽きた！ 最後の${Math.ceil(this.remainingTime() - 1e-8)}秒、陣地を奪え`, 'finale');
      }
      if (this.finaleEndsAt !== null && this.time >= this.finaleEndsAt - 1e-8) {
        this.time = this.finaleEndsAt;
        this.finishByScore('最終局面終了');
      }
    }
  }
  hitBullet(b, target, x, y) {
    const speed = Math.hypot(b.vx, b.vy), dx = b.vx / speed, dy = b.vy / speed;
    const duration = target ? .38 : .23;
    const damage = b.damage * incomingDamageMultiplier(target);
    this.effects.push({ x, y, team: b.team, owner: b.owner, seed: b.id, dx, dy, damage, weapon: b.weapon, weak: b.weak, life: duration, total: duration, kind: target ? 'hit' : 'splash' });
    if (target) {
      target.hp = Math.max(0, target.hp - damage); target.hitFlash = .13;
      if (!b.weak && target.hp > 0 && target.flinchGuard <= 1e-8) {
        this.cancelCharge(target);
        target.flinch = CONFIG.flinchDuration; target.fireLock = CONFIG.fireLockDuration;
        target.flinchGuard = CONFIG.flinchDuration + CONFIG.flinchImmunity;
      }
      target.hitDirectionX = dx; target.hitDirectionY = dy;
      this.actors[b.owner].stats.hits++;
      this.combatEvents.push({ id: ++this.combatSequence, owner: b.owner, target: target.id, targetName: target.name, x, y, dx, dy, damage, weapon: b.weapon, weak: b.weak, killed: target.hp === 0 });
      if (this.combatEvents.length > 64) this.combatEvents.shift();
      if (target.hp === 0) {
        target.alive = false; target.vx = target.vy = 0; target.tapId = null; this.cancelCharge(target);
        this.discardedWater += target.water; target.water = 0;
        this.actors[b.owner].stats.kills++;
        this.emit(`${this.actors[b.owner].name} が ${target.name} を倒した`, 'kill', b.team);
        this.effects.push({ x: target.x, y: target.y, team: target.team, owner: b.owner, seed: b.id, dx, dy, life: .95, total: .95, kind: 'out' });
      }
    }
  }
  updateZonePresence() {
    const presence = [0, 0];
    for (const a of this.actors) if (a.alive && distance(a, ZONE) <= ZONE.r) presence[a.team]++;
    this.contested = presence[0] > 0 && presence[1] > 0;
    this.zoneOwner = this.contested || presence[0] + presence[1] === 0 ? null : presence[0] ? 0 : 1;
  }
  finishByScore(reason) { const d = this.scores[0] - this.scores[1]; this.finish(Math.abs(d) < 1e-7 ? null : d > 0 ? 0 : 1, reason); }
  finish(winner, reason) { if (this.state !== 'playing') return; this.state = 'ended'; this.winner = winner; this.reason = reason; for (const a of this.actors) this.cancelCharge(a); }
}
