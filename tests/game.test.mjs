import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG, OBSTACLES, ZONE, puddleRadius, puddleOutline, insidePuddle } from '../src/game.mjs';
import { quietGame, advance, accountedWater } from './helpers.mjs';

// This file's own tolerance (1e-5) and message, not the shared near() from helpers.mjs.
function near(a, b, epsilon = 1e-5) { assert.ok(Math.abs(a - b) < epsilon, `${a} should equal ${b}`); }

test('one human and five bots start with the agreed finite resources', () => {
  const g = new Game();
  assert.equal(g.actors.filter(a => a.human).length, 1);
  assert.equal(g.actors.length, 6); assert.equal(g.remainingWater(), 900);
  assert.equal(g.initialTotalWater, 1200); assert.equal(g.state, 'ready');
  g.update(1 / 60, { shoot: true }); assert.equal(g.usedWater, 0);
});
test('automatic refill transfers exactly 25 per second and shrinks the puddle', () => {
  const g = quietGame(), a = g.actors[0], p = g.puddles[0];
  const fullRadius = puddleRadius(p);
  a.x = p.x; a.y = p.y; a.water = 0;
  advance(g, 1); near(a.water, 25); near(p.water, 45);
  near(puddleRadius(p), fullRadius * Math.sqrt(45 / 70));
  advance(g, 3); near(a.water, 70); near(p.water, 0);
  assert.equal(g.events.filter(e => e.type === 'dry').length, 1);
});
test('a full tank never drains a puddle', () => {
  const g = quietGame(), a = g.actors[0], p = g.puddles[0];
  Object.assign(a, { x: p.x, y: p.y, water: 95 });
  advance(g, 2); near(a.water, 100); near(p.water, 65);
});
test('firing drains 25 per second but refills only 5 per second', () => {
  const g = quietGame(), a = g.actors[0], p = g.puddles[0];
  Object.assign(a, { x: p.x, y: p.y, water: 50 });
  advance(g, 1, { shoot: true, aim: Math.PI / 2 });
  assert.equal(a.stats.shots, 5); near(a.water, 30); near(p.water, 65);
  near(accountedWater(g), g.initialTotalWater);
});
test('the last drops are shared without overdraw or actor-order bias', () => {
  const g = quietGame(), p = g.puddles[0];
  p.capacity = .2; p.water = .2;
  for (let i = 0; i < 2; i++) Object.assign(g.actors[i], { x: p.x + (i ? 15 : -15), y: p.y, water: 0 });
  g.update(1 / 60); near(g.actors[0].water, .1); near(g.actors[1].water, .1); near(p.water, 0);
});
test('movement uses the puddle penalty and normalized diagonal speed', () => {
  const g = quietGame(), a = g.actors[0];
  Object.assign(a, { x: 600, y: 143, water: 100 });
  g.update(1 / 60, { x: 1 }); near(a.x - 600, CONFIG.speed * (1 - .3 * 180 / 250) / 60);
  Object.assign(a, { x: 140, y: 170 });
  g.update(1 / 60, { x: 1, y: 1 }); near(Math.hypot(a.x - 140, a.y - 170), CONFIG.speed / 60);
});
test('projectiles pass teammates, damage enemies, and stop at cover', () => {
  const g = quietGame();
  Object.assign(g.actors[0], { x: 300, y: 360 });
  Object.assign(g.actors[1], { x: 350, y: 360 });
  Object.assign(g.actors[3], { x: 400, y: 360 });
  g.update(1 / 60, { shoot: true, aim: 0 }); advance(g, .4);
  assert.equal(g.actors[1].hp, 100); assert.equal(g.actors[3].hp, 94);
  assert.equal(g.combatEvents.length, 1);
  near(g.combatEvents[0].dx, 1); near(g.combatEvents[0].dy, 0);
  assert.deepEqual({ owner: g.combatEvents[0].owner, target: g.combatEvents[0].target, damage: g.combatEvents[0].damage, killed: g.combatEvents[0].killed }, { owner: 0, target: 3, damage: 6, killed: false });
  near(g.actors[3].x, 400); near(g.actors[3].y, 360);
  Object.assign(g.actors[0], { x: 300, y: 250 });
  Object.assign(g.actors[3], { x: 500, y: 250, hp: 100 });
  g.update(1 / 60, { shoot: true, aim: 0 }); advance(g, .5);
  assert.equal(g.actors[3].hp, 100); assert.equal(g.actors[0].stats.hits, 1);
  assert.equal(g.combatEvents.length, 1, 'walls and teammates must not trigger hit confirmation');
});
test('a defeated actor loses remaining water and never respawns', () => {
  const g = quietGame();
  Object.assign(g.actors[0], { x: 300, y: 360 });
  Object.assign(g.actors[3], { x: 400, y: 360, hp: 6 });
  g.update(1 / 60, { shoot: true, aim: 0 }); advance(g, 1);
  assert.equal(g.actors[3].alive, false); assert.equal(g.actors[3].water, 0);
  assert.equal(g.discardedWater, 50); assert.equal(g.actors[0].stats.kills, 1);
  assert.equal(g.combatEvents.filter(e => e.killed).length, 1);
  assert.equal(g.combatEvents[0].targetName, 'カイ');
  near(accountedWater(g), g.initialTotalWater);
});
test('capture is cumulative, contested capture pauses, and 30 seconds wins', () => {
  const g = quietGame(); Object.assign(g.actors[0], { x: ZONE.x, y: ZONE.y });
  advance(g, 4); near(g.scores[0], 4);
  Object.assign(g.actors[3], { x: ZONE.x + 40, y: ZONE.y });
  advance(g, 3); near(g.scores[0], 4); assert.equal(g.contested, true);
  Object.assign(g.actors[3], { x: 1000, y: 360 });
  advance(g, 26); assert.equal(g.state, 'ended'); assert.equal(g.winner, 0);
  near(g.scores[0], 30);
});
test('time limit resolves by score and a tie is a draw', () => {
  const g = quietGame(); g.scores = [8, 12]; advance(g, 90.1);
  assert.equal(g.state, 'ended'); assert.equal(g.winner, 1); assert.equal(g.reason, 'タイムアップ');
  assert.equal(g.time, 90); assert.equal(g.remainingTime(), 0);
  const h = quietGame(); advance(h, 90.1); assert.equal(h.state, 'ended'); assert.equal(h.winner, null);
});
test('elimination resolves the round and reset restores all resources', () => {
  const g = quietGame(); for (const a of g.actors.filter(a => a.team === 1)) a.alive = false;
  g.update(1 / 60); assert.equal(g.winner, 0); assert.equal(g.reason, '全滅');
  g.reset(8); assert.equal(g.state, 'ready'); assert.equal(g.actors.filter(a => a.alive).length, 6);
  assert.equal(g.remainingWater(), 900); assert.deepEqual(g.scores, [0, 0]); assert.equal(g.bullets.length, 0);
});
test('empty water starts one fixed finale even with flying bullets and continuous weak fire', () => {
  const g = quietGame(); for (const p of [...g.puddles, ...g.taps]) p.water = 0; for (const a of g.actors) a.water = 2;
  g.scores = [3, 1];
  g.bullets.push({ id: 99, owner: 0, team: 0, x: 400, y: 100, vx: 100, vy: 0, life: .1, damage: 10, weak: false });
  g.update(1 / 60); assert.equal(g.state, 'playing');
  const deadline = g.finaleEndsAt; near(g.remainingTime(), 15);
  advance(g, 14.8, { shoot: true, aim: 0 }); assert.equal(g.state, 'playing');
  assert.equal(g.finaleEndsAt, deadline); assert.ok(g.actors[0].stats.weakShots > 20);
  advance(g, .3, { shoot: true, aim: 0 });
  assert.equal(g.state, 'ended'); assert.equal(g.winner, 0); assert.equal(g.reason, '最終局面終了');
  near(g.time, deadline); assert.equal(g.remainingTime(), 0); assert.equal(g.events.filter(e => e.type === 'finale').length, 1);
  g.reset(); assert.equal(g.finaleEndsAt, null); assert.equal(g.remainingTime(), 90); assert.equal(g.actors[0].stats.weakShots, 0);
});

test('weak shots cost no water and do four damage at 0.6-second intervals', () => {
  const g = quietGame(), a = g.actors[0], target = g.actors[3];
  Object.assign(a, { x: 400, y: 360, water: 2 }); Object.assign(target, { x: 500, y: 360 });
  const waterBefore = accountedWater(g);
  advance(g, 1.2, { shoot: true, aim: 0 });
  assert.equal(a.stats.shots, 2); assert.equal(a.stats.weakShots, 2); assert.equal(target.hp, 92);
  assert.equal(a.water, 2); assert.equal(g.usedWater, 0); near(accountedWater(g), waterBefore);
  assert.ok(g.combatEvents.every(e => e.damage === 4 && e.weak));
  assert.equal(g.finaleEndsAt, null, 'one empty tank cannot start the finale');
});

test('the last normal shot retains its base damage after switching to weak shots', () => {
  const g = quietGame(), a = g.actors[0];
  Object.assign(a, { x: 400, y: 360, water: 5 }); Object.assign(g.actors[3], { x: 560, y: 360 });
  g.update(1 / 60, { shoot: true, aim: 0 });
  assert.equal(a.water, 0); assert.equal(g.bullets[0].damage, 6); assert.equal(g.bullets[0].weak, false);
  const speed = Math.hypot(g.bullets[0].vx, g.bullets[0].vy), life = g.bullets[0].life;
  advance(g, .2, { shoot: true, aim: 0 });
  const weak = g.bullets.find(b => b.weak); assert.ok(weak);
  near(Math.hypot(weak.vx, weak.vy), speed); assert.ok(weak.life < life);
  advance(g, .5);
  // Both projectiles hit inside the center; incoming risk doubles their distinct base damage.
  assert.equal(g.actors[3].hp, 80); assert.deepEqual(g.combatEvents.map(e => e.damage), [12, 8]);
  assert.equal(g.usedWater, 5);
});

test('refilling restores normal shots without upgrading weak bullets in flight or resetting cooldown', () => {
  const g = quietGame(), a = g.actors[0], p = g.puddles[0];
  Object.assign(a, { x: 300, y: 360, water: 0 }); Object.assign(g.actors[3], { x: 470, y: 360 });
  g.update(1 / 60, { shoot: true, aim: 0 });
  Object.assign(a, { x: p.x, y: p.y }); advance(g, .3);
  assert.ok(a.water >= 5); assert.ok(a.cooldown > .2);
  g.update(1 / 60, { shoot: true, aim: 0 }); assert.equal(a.stats.shots, 1);
  advance(g, .4); assert.equal(g.actors[3].hp, 96);
  g.update(1 / 60, { shoot: true, aim: 0 });
  assert.equal(a.lastShotWeak, false); assert.equal(a.stats.shots, 2); assert.equal(g.usedWater, 5);
  assert.equal(g.bullets.at(-1).damage, 6);
});

test('weak firing still slows refill, so releasing fire restores supply faster', () => {
  const g = quietGame(), a = g.actors[0], p = g.puddles[0];
  Object.assign(a, { x: p.x, y: p.y, water: 0 });
  const before = accountedWater(g);
  advance(g, .6, { shoot: true, aim: Math.PI / 2 });
  near(a.water, 3); near(p.water, 67); assert.equal(a.stats.weakShots, 1);
  advance(g, .2); near(a.water, 8); near(p.water, 62); near(accountedWater(g), before);
});

test('remaining sources and any living water-loaded actor postpone the finale', () => {
  const g = quietGame(); for (const p of [...g.puddles, ...g.taps]) p.water = 0; for (const a of g.actors) a.water = 0;
  g.actors[1].water = 5; g.update(1 / 60); assert.equal(g.finaleEndsAt, null);
  g.actors[1].water = 0; g.puddles[0].water = .005; g.update(1 / 60); assert.equal(g.finaleEndsAt, null);
  g.puddles[0].water = 0; g.actors[1].alive = false; g.actors[1].water = 50;
  g.update(1 / 60); assert.ok(g.finaleEndsAt !== null, 'unusable tanks on defeated actors are ignored');
});

test('capture, last normal projectile and weak knockout can still win the finale early', () => {
  const capture = quietGame(); for (const p of [...capture.puddles, ...capture.taps]) p.water = 0; for (const a of capture.actors) a.water = 0;
  Object.assign(capture.actors[0], { x: ZONE.x, y: ZONE.y }); capture.scores[0] = 29.9;
  capture.update(1 / 60); assert.ok(capture.finaleEndsAt !== null); advance(capture, .2);
  assert.equal(capture.winner, 0); assert.equal(capture.reason, '陣地を30秒確保');
  for (const [water, hp] of [[5, 6], [0, 4]]) {
    const g = quietGame(); for (const p of [...g.puddles, ...g.taps]) p.water = 0; for (const a of g.actors) a.water = 0;
    Object.assign(g.actors[0], { x: 300, y: 360, water }); Object.assign(g.actors[3], { x: 400, y: 360, hp });
    g.actors[4].alive = g.actors[5].alive = false;
    g.update(1 / 60, { shoot: true, aim: 0 }); assert.ok(g.finaleEndsAt !== null);
    advance(g, .4); assert.equal(g.winner, 0); assert.equal(g.reason, '全滅');
    assert.ok(g.combatEvents[0].killed); assert.equal(g.combatEvents[0].damage, hp);
  }
});

test('the finale allows a draw and never extends the 90-second match limit', () => {
  for (const start of [0, 85]) {
    const g = quietGame(); for (const p of [...g.puddles, ...g.taps]) p.water = 0; for (const a of g.actors) a.water = 0;
    g.time = start; g.update(1 / 60);
    near(g.finaleEndsAt, Math.min(90, g.time + 15)); advance(g, 15.1);
    assert.equal(g.state, 'ended'); assert.equal(g.winner, null); assert.ok(g.time <= 90);
    assert.equal(g.reason, start ? 'タイムアップ' : '最終局面終了');
  }
});

test('dry bots fire weak shots and head for the objective instead of empty sources', () => {
  const g = new Game(2), bot = g.actors[3];
  for (const p of [...g.puddles, ...g.taps]) p.water = 0; for (const a of g.actors) a.water = 0;
  Object.assign(bot, { x: 690, y: 360 }); Object.assign(g.actors[0], { x: 580, y: 360 });
  bot.ai.refill = true; bot.ai.goal = g.puddles[1]; bot.ai.think = 1;
  g.finaleEndsAt = 15;
  const input = g.botControl(bot, 1 / 60);
  assert.equal(bot.ai.refill, false); assert.equal(bot.ai.goal.id, 'zone'); assert.equal(input.shoot, true); assert.ok(input.x < 0);
  g.start(); g.update(1 / 60); assert.equal(bot.stats.weakShots, 1);
});
test('a bot touching cover can navigate away from the corner', () => {
  const g = new Game(2), bot = g.actors[1];
  const originalControl = g.botControl.bind(g);
  g.botControl = (a, dt) => a.id === bot.id ? { ...originalControl(a, dt), shoot: false } : { x: 0, y: 0, aim: 0, shoot: false };
  Object.assign(bot, { x: 552, y: 466, water: 100 }); bot.ai.refill = false;
  g.start(); advance(g, 3);
  assert.ok(Math.hypot(bot.x - ZONE.x, bot.y - ZONE.y) < ZONE.r, 'bot must leave cover and reach the objective');
});
test('irregular shorelines preserve equal resources and rotational access', () => {
  const g = new Game();
  for (const [i, j] of [[0, 1], [2, 3]]) {
    const a = g.puddles[i], b = g.puddles[j], first = puddleOutline(a), second = puddleOutline(b);
    assert.equal(a.capacity, b.capacity);
    for (let n = 0; n < first.length; n++) {
      near(first[n].x + second[n].x, CONFIG.width);
      near(first[n].y + second[n].y, CONFIG.height);
      assert.ok(first[n].x >= 30 && first[n].x <= CONFIG.width - 30);
      assert.ok(first[n].y >= 30 && first[n].y <= CONFIG.height - 30);
    }
    const before = puddleOutline(a);
    a.water *= .25;
    const after = puddleOutline(a);
    for (let n = 0; n < before.length; n++) { near(after[n].x - a.x, (before[n].x - a.x) / 2); near(after[n].y - a.y, (before[n].y - a.y) / 2); }
  }
});
test('refill follows the long and narrow shoreline rather than an invisible circle', () => {
  const p = new Game().puddles[0]; p.water = p.capacity;
  const local = (x, y) => ({ x: p.x + x * Math.cos(p.angle) - y * Math.sin(p.angle), y: p.y + x * Math.sin(p.angle) + y * Math.cos(p.angle) });
  const tip = local(p.rx + 10, 0), drySide = local(0, p.ry + 20);
  assert.ok(insidePuddle(tip, p), 'a body touching the elongated tip can refill');
  assert.ok(!insidePuddle(drySide, p), 'the dry ground beside the narrow side cannot refill');
  p.water *= .25; assert.ok(!insidePuddle(tip, p), 'receding water stops refilling the old shoreline');
  p.water = 0; assert.ok(!insidePuddle({ x: p.x, y: p.y }, p));
});
test('the final knockout splash finishes without advancing the ended match', () => {
  const g = quietGame();
  Object.assign(g.actors[0], { x: 300, y: 360 });
  Object.assign(g.actors[3], { x: 400, y: 360, hp: 6 });
  g.actors[4].alive = g.actors[5].alive = false;
  g.update(1 / 60, { shoot: true, aim: 0 }); advance(g, .4);
  assert.equal(g.state, 'ended');
  const splash = g.effects.find(e => e.kind === 'out'); assert.ok(splash);
  const before = JSON.stringify({ time: g.time, scores: g.scores, puddles: g.puddles, actors: g.actors.map(a => ({ x: a.x, y: a.y, water: a.water, hp: a.hp })) });
  const life = splash.life; g.advanceEffects(.2); near(splash.life, life - .2);
  assert.equal(JSON.stringify({ time: g.time, scores: g.scores, puddles: g.puddles, actors: g.actors.map(a => ({ x: a.x, y: a.y, water: a.water, hp: a.hp })) }), before);
  g.reset(); assert.equal(g.combatEvents.length, 0); assert.equal(g.effects.length, 0);
});
test('seeded full matches finish, conserve water, and keep bots out of cover', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game(seed); g.actors[0].human = false; g.start();
    for (let tick = 0; tick < 5500 && g.state === 'playing'; tick++) {
      g.update(1 / 60);
      if (tick % 60 === 0) {
        near(accountedWater(g), g.initialTotalWater);
        for (const a of g.actors) {
          assert.ok(a.water >= -1e-7 && a.water <= CONFIG.capacity + 1e-7);
          assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
          assert.ok(!OBSTACLES.some(o => a.x > o.x - CONFIG.radius + .001 && a.x < o.x + o.w + CONFIG.radius - .001 && a.y > o.y - CONFIG.radius + .001 && a.y < o.y + o.h + CONFIG.radius - .001), `bot ${a.id} entered cover`);
        }
      }
    }
    assert.equal(g.state, 'ended'); assert.ok(g.time <= CONFIG.duration);
    assert.ok(g.actors.reduce((s, a) => s + a.stats.refilled, 0) > 0);
  }
});
