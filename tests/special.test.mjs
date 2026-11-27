// The special stage: sand blocks (wear down, break, the long barrel goes through them), items (where they lie, pick-up,
// each effect, a new glowing block after one breaks) and bots that dig the fort open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STAGES, CONFIG, ZONE, SAND, ITEMS, ITEM_RULES, CELL, WEAPONS, distance, longRayEnd } from '../src/game.mjs';
import { advance, accountedWater, fire, floodFill, quietGame } from './helpers.mjs';

// The special stage, started, with every bot standing still, keeping its aim and never firing.
const quietSpecial = (seed = 7) => quietGame(seed, 'special');
const blockAt = (g, c, r) => g.blocks.find(b => b.x === c * CELL && b.y === r * CELL);
const centerOf = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
// Puts actor 0 at p (aim toward q) and every other actor far away in a corner, out of the way.
function place(g, p, q) {
  const [you, ...rest] = g.actors;
  Object.assign(you, { x: p.x, y: p.y, aim: q ? Math.atan2(q.y - p.y, q.x - p.x) : 0 });
  rest.forEach((a, i) => Object.assign(a, { x: 60 + i * 30, y: 650 }));
}

test('the special stage comes last, is marked special and has sand', () => {
  const st = STAGES[STAGES.length - 1];
  assert.equal(st.id, 'special');
  assert.ok(st.special && st.items);
  assert.ok(STAGES.slice(0, -1).every(s => !s.special && !s.blocks && !s.items));
  const g = new Game(3, 'special');
  assert.equal(g.blocks.length, st.blocks.length);
  assert.ok(g.blocks.every(b => b.hp === SAND.hp && g.obstacles.includes(b) && !g.solid.includes(b)));
  // the other stages have no items and use no random numbers for them
  assert.ok(new Game(3, 'maze').blocks.length === 0);
});

test('items lie somewhere new every match: one or two glowing blocks, a few hidden ones', () => {
  const kinds = new Set(ITEMS.map(i => i.id)), layouts = new Set(), counts = new Set();
  let hidden = 0;
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  for (const seed of seeds) {
    const g = new Game(seed, 'special');
    const glowing = g.blocks.filter(b => b.glow);
    assert.ok(glowing.length >= 1 && glowing.length <= ITEM_RULES.glow, `seed ${seed}: ${glowing.length} glowing`);
    assert.ok(g.blocks.every(b => !b.glow || kinds.has(b.item)), 'a glowing block holds an item');
    assert.ok(g.blocks.every(b => b.item === null || kinds.has(b.item)));
    counts.add(glowing.length);
    layouts.add(glowing.map(b => b.id).join(','));
    hidden += g.blocks.filter(b => b.item && !b.glow).length;
    // the same seed, the same items
    assert.deepEqual(new Game(seed, 'special').blocks.map(b => [b.item, b.glow]), g.blocks.map(b => [b.item, b.glow]));
  }
  assert.deepEqual([...counts].sort(), [1, 2], 'sometimes one, sometimes two');
  assert.ok(layouts.size > 30, `glowing blocks move around (${layouts.size} layouts in ${seeds.length} matches)`);
  // hidden: ITEM_RULES.hidden of the other blocks on average (about 3.4 of 34)
  const mean = hidden / seeds.length;
  assert.ok(mean > 1.5 && mean < 6, `about ${mean.toFixed(1)} hidden items a match`);
});

test('the zone sits in a closed fort: no way in from a spawn until sand is dug', () => {
  const g = new Game(1, 'special');
  const reach = () => floodFill(g).some(p => distance(p, ZONE) < ZONE.r);
  assert.equal(reach(), false);
  g.damageBlock(blockAt(g, 10, 7), Infinity);   // the fort's west wall, middle
  assert.equal(reach(), true);
});

test('shots wear sand down and break it; it leaves the obstacles and the routes', () => {
  const g = quietSpecial();
  const b = blockAt(g, 10, 7), c = centerOf(b);
  place(g, { x: c.x - 90, y: c.y }, c);
  const version = g.blockVersion;
  g.update(1 / 60, { shoot: true, aim: 0 });
  for (let i = 0; i < 30 && b.hp === SAND.hp; i++) g.update(1 / 60, {});
  assert.equal(b.hp, SAND.hp - WEAPONS[0].damage);
  assert.ok(b.hitFlash > 0);
  let crumbled = false;
  for (let i = 0; i < 60; i++) {
    g.update(1 / 60, { shoot: true, aim: 0 });
    crumbled ||= g.effects.some(e => e.kind === 'crumble');
  }
  assert.equal(b.hp, 0);
  assert.ok(crumbled);
  assert.ok(!g.obstacles.includes(b));
  assert.ok(g.blockVersion > version);
  // the cell is open ground now: walk through it
  assert.ok(g.validPosition(c.x, c.y));
});

test('the long barrel beam goes through sand, breaking every block on its line, and stops at rock', () => {
  const g = quietSpecial();
  const a = g.actors[0];
  // row 7 from the blue spawn side: the hedge (6,7), the fort's west and east walls (10,7), (14,7), the other hedge
  const row7 = { x: 230, y: 7 * CELL + CELL / 2 };
  place(g, row7, { x: 1100, y: row7.y });
  Object.assign(a, { weapon: 'long', water: 100 });
  assert.ok(Math.abs(longRayEnd(a, 0).x - (1200 - 28)) < 1e-6, 'the warning line runs through sand too');
  fire(g);
  const beam = g.effects.find(e => e.kind === 'beam');
  for (const [c, r] of [[6, 7], [10, 7], [14, 7], [18, 7]]) assert.equal(blockAt(g, c, r).hp, 0, `(${c},${r}) broken`);
  assert.ok(beam && beam.endX > 1100, 'the beam runs on to the arena edge');
  // a rock stops it: (10,5) is the fort's corner, sand (11,5) behind it
  const h = quietSpecial();
  const rock = h.solid.find(o => o.x === 10 * CELL && o.y === 5 * CELL), behind = blockAt(h, 11, 5);
  place(h, { x: 400, y: 5 * CELL + CELL / 2 }, { x: 900, y: 5 * CELL + CELL / 2 });
  Object.assign(h.actors[0], { weapon: 'long', water: 100 });
  fire(h);
  assert.ok(rock && h.effects.some(e => e.kind === 'beam'));
  assert.equal(behind.hp, SAND.hp, 'sand behind a rock stays');
});

test('a block drops the item it hides; walking over it takes it, once', () => {
  const g = quietSpecial();
  const b = blockAt(g, 10, 7), c = centerOf(b);         // the fort's west wall, middle: made to hide a heal
  Object.assign(b, { item: 'heal', glow: false });
  g.damageBlock(b, Infinity);
  assert.deepEqual(g.items.map(it => [it.kind, it.x, it.y]), [['heal', c.x, c.y]]);
  assert.equal(b.item, null);
  assert.ok(g.effects.some(e => e.kind === 'crumble' && e.item === 'heal' && !e.glow));
  place(g, { x: c.x - (CONFIG.radius + ITEM_RULES.reach + 20), y: c.y });
  g.update(1 / 60, {});
  assert.equal(g.items.length, 1, 'out of reach');
  g.actors[0].x = c.x - (CONFIG.radius + ITEM_RULES.reach - 1);
  g.update(1 / 60, {});
  assert.equal(g.items.length, 0);
  const e = g.events.find(e => e.type === 'item');
  assert.ok(e && e.actor === 0 && e.item === 'heal' && e.team === 0);
  // a block with nothing inside drops nothing
  g.damageBlock(blockAt(g, 10, 6).item ? blockAt(g, 10, 8) : blockAt(g, 10, 6), Infinity);
  assert.equal(g.items.length, 0);
});

test('item effects: dash, nozzle, coat, endless, bucket and heal', () => {
  const give = (g, a, kind) => g.applyItem(a, { kind, x: a.x, y: a.y });
  // dash: 1.5x speed, and a puddle does not slow
  {
    const g = quietSpecial(), a = g.actors[0], pool = g.puddles[0];
    place(g, { x: pool.x, y: pool.y });
    const x0 = a.x;
    g.update(1 / 60, { x: 1 });
    const slow = a.x - x0;
    give(g, a, 'dash');
    const x1 = a.x;
    g.update(1 / 60, { x: 1 });
    assert.ok(Math.abs((a.x - x1) - CONFIG.speed * ITEM_RULES.dashSpeed / 60) < 1e-6);
    assert.ok(a.x - x1 > slow * 1.5);
    advance(g, ITEMS.find(i => i.id === 'dash').time);
    assert.equal(a.buffs.dash, 0, 'it wears off');
  }
  // nozzle: x2 damage away from the zone, still x2 (not x4) with the zone held
  {
    const g = quietSpecial(), a = g.actors[0];
    give(g, a, 'nozzle');
    a.firing = true;
    g.fireWeapons([a]);
    assert.equal(g.bullets.at(-1).damage, WEAPONS[0].damage * CONFIG.controlDamageMultiplier);
    g.zoneOwner = 0;
    a.cooldown = a.weaponCooldowns.normal = 0;
    g.fireWeapons([a]);
    assert.equal(g.bullets.at(-1).damage, WEAPONS[0].damage * CONFIG.controlDamageMultiplier);
  }
  // coat: a shot lands but does no damage and no flinch
  {
    const g = quietSpecial(), t = g.actors[3];
    give(g, t, 'coat');
    g.hitBullet({ vx: 1, vy: 0, damage: 12, weak: false, owner: 0, team: 0, weapon: 'normal', id: 1 }, t, t.x, t.y);
    assert.equal(t.hp, CONFIG.health);
    assert.equal(t.flinch, 0);
    assert.ok(g.combatEvents.at(-1).guarded);
  }
  // endless: paid shots without paying, even with an empty tank
  {
    const g = quietSpecial(), a = g.actors[0];
    give(g, a, 'endless');
    a.water = 0;
    a.firing = true;
    g.fireWeapons([a]);
    assert.equal(a.water, 0);
    assert.equal(g.usedWater, 0);
    assert.equal(g.bullets.at(-1).weak, false);
  }
  // bucket: a full tank, and the match's water still adds up
  {
    const g = quietSpecial(), a = g.actors[0];
    give(g, a, 'bucket');
    assert.equal(a.water, CONFIG.capacity);
    assert.equal(g.initialTotalWater, 1200 + CONFIG.capacity - CONFIG.initialWater);
    assert.ok(Math.abs(accountedWater(g) - g.initialTotalWater) < 1e-6);
  }
  // heal: +50, at most full
  {
    const g = quietSpecial(), a = g.actors[0];
    a.hp = 30;
    give(g, a, 'heal');
    assert.equal(a.hp, 80);
    give(g, a, 'heal');
    assert.equal(a.hp, CONFIG.health);
  }
});

test('a broken glowing block passes its glow on: another standing block lights up later', () => {
  const g = quietSpecial();
  const before = g.blocks.filter(o => o.glow);
  for (const b of before) g.damageBlock(b, Infinity);
  assert.equal(g.blocks.filter(o => o.glow).length, 0);
  assert.equal(g.items.length, before.length, 'each glowing block dropped its item');
  advance(g, ITEM_RULES.relight - .5);
  assert.equal(g.blocks.filter(o => o.glow).length, 0, 'not yet');
  advance(g, 1);
  const after = g.blocks.filter(o => o.glow);
  assert.equal(after.length, before.length);
  assert.ok(after.every(o => o.hp > 0 && o.item && !before.includes(o)), 'a standing block elsewhere, with an item');
  // with no sand left, nothing lights up
  const h = quietSpecial();
  for (const b of h.blocks) h.damageBlock(b, Infinity);
  advance(h, ITEM_RULES.relight + 1);
  assert.equal(h.blocks.filter(o => o.glow).length, 0);
});

test('bots dig the fort open and take the zone, with the matches still conserving water', () => {
  for (const seed of [2, 9]) {
    const g = new Game(seed, 'special');
    g.autopilot = true;
    g.start();
    let zoneAt = null;
    for (let i = 0; i < 5500 && g.state === 'playing'; i++) {
      g.update(1 / 60, {});
      if (zoneAt === null && g.zoneOwner !== null) zoneAt = g.time;
      if (i % 60 === 0) for (const a of g.actors) assert.ok(g.validPosition(a.x, a.y), `actor ${a.id} inside a wall`);
    }
    assert.ok(zoneAt !== null && zoneAt < 15, `zone taken at ${zoneAt}`);
    assert.ok(g.blocks.filter(b => b.hp <= 0).length >= 8, 'sand was dug');
    assert.ok(Math.abs(accountedWater(g) - g.initialTotalWater) < .001);
  }
});
