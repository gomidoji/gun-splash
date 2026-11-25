import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG, insidePuddle, segmentRect, OBSTACLES } from '../src/game.mjs';
import { near, quietGame, advance } from './helpers.mjs';

function place(a, t) {
  a.x = t.x;
  a.y = t.y;
}

test('finite allocation, symmetric dry operating zones and reset', () => {
  const g = quietGame();
  assert.equal(g.puddles.reduce((s, p) => s + p.water, 0), 500);
  assert.equal(g.taps.reduce((s, t) => s + t.water, 0), 400);
  for (const t of g.taps) for (let i = 0; i < 360; i++) {
    const a = { x: t.x + CONFIG.tapRadius * Math.cos(i), y: t.y + CONFIG.tapRadius * Math.sin(i) };
    assert.ok(!g.puddles.some(p => insidePuddle(a, { ...p, water: p.capacity })));
    assert.ok(!OBSTACLES.some(o => segmentRect(a, a, o, CONFIG.radius) !== null));
  }
  for (const [i, j] of [[0, 1], [2, 3]]) {
    near(g.taps[i].x + g.taps[j].x, 1200);
    near(g.taps[i].y + g.taps[j].y, 720);
  }
  g.taps[0].water = 0;
  g.reset();
  assert.equal(g.remainingWater(), 900);
  assert.equal(g.taps[0].water, 100);
});
test('standing fills the puddle, locks both shot types, and movement resumes fire', () => {
  for (const water of [0, 50]) {
    const g = quietGame(), a = g.actors[0], t = g.taps[0], p = g.puddles[0];
    place(a, t);
    a.water = water;
    advance(g, 1, { shoot: true });
    near(p.water, 80);
    near(t.water, 90);
    near(a.water, water);
    assert.equal(a.stats.shots, 0);
    assert.equal(a.tapId, t.id);
    g.update(1 / 60, { x: 1, shoot: true });
    assert.equal(a.tapId, null);
    assert.equal(a.stats.shots, 1);
    near(t.water, 90);
  }
});
test('approach from all directions, cancel immediately, and operate from one fixed position', () => {
  for (const id of [0, 3]) for (let i = 0; i < 8; i++) {
    const g = quietGame(), t = g.taps[0], a = g.actors[id];
    place(a, t);
    a.x += 20 * Math.cos(i * Math.PI / 4);
    a.y += 20 * Math.sin(i * Math.PI / 4);
    g.update(1 / 60);
    near(t.water, 100);
    assert.equal(a.tapId, null);
    if (id === 0) {
      const x = a.x;
      g.update(1 / 60, { x: 1 });
      assert.ok(a.x > x);
      near(t.water, 100);
    }
    advance(g, .5);
    near(a.x, t.x);
    near(a.y, t.y);
    assert.equal(a.tapId, t.id);
    assert.ok(t.water < 100);
  }
});
test('occupied operating position cannot be shared; another team can take over after release', () => {
  const g = quietGame(), t = g.taps[0], a = g.actors[0], b = g.actors[3];
  place(a, t);
  b.x = t.x + 35;
  b.y = t.y;
  advance(g, 1);
  near(t.water, 90);
  assert.equal(a.tapId, t.id);
  assert.equal(b.tapId, null);
  a.x = t.x - 80;
  place(b, t);
  advance(g, 1);
  near(t.water, 80);
  assert.equal(b.tapId, t.id);
});

test('full pools preserve reserve; empty taps unlock fire; dry pools revive', () => {
  const g = quietGame(), a = g.actors[0], t = g.taps[0], p = g.puddles[0];
  place(a, t);
  t.water = 50;
  p.water = 99;
  advance(g, 1);
  near(p.water, 100);
  near(t.water, 49);
  assert.equal(a.tapId, null);
  p.water = 0;
  advance(g, 5);
  near(p.water, 49);
  near(t.water, 0);
  g.update(1 / 60, { shoot: true });
  assert.equal(a.stats.shots, 1);
  assert.equal(a.tapId, null);
  a.alive = false;
  t.water = 50;
  advance(g, 1);
  near(t.water, 50);
});
test('faucet reserves postpone the finale even when all other water is gone', () => {
  const g = quietGame();
  for (const p of g.puddles) p.water = 0;
  for (const a of g.actors) a.water = 0;
  advance(g, 1);
  assert.equal(g.finaleEndsAt, null);
  for (const t of g.taps) t.water = 0;
  g.update(1 / 60);
  near(g.remainingTime(), 15);
});
test('a bot travels to a faucet, pours water and then refills its own tank', () => {
  const g = new Game(7), bot = g.actors[1], original = g.botControl.bind(g);
  g.botControl = (a, dt) => a.id === bot.id ? original(a, dt) : { x: 0, y: 0, aim: 0, shoot: false };
  for (const p of g.puddles) p.water = 0;
  for (const t of g.taps) t.water = 0;
  const t = g.taps[0];
  t.water = 50;
  bot.water = 0;
  bot.x = t.x - 70;
  bot.y = t.y;
  g.start();
  advance(g, 12);
  assert.ok(t.water < 50 && t.water > 0);
  assert.ok(bot.stats.refilled >= 20);
});
