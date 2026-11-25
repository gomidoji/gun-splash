import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG } from '../src/game.mjs';

const step = 1 / 60;
// Bots stand still; actor 0 waits at (400, 360).
function fixture() {
  const g = new Game(4);
  g.botControl = a => ({ x: 0, y: 0, aim: a.aim, shoot: false });
  Object.assign(g.actors[0], { x: 400, y: 360 });
  g.start();
  return g;
}
// An enemy bullet (10 damage, or a 4-damage weak shot) that reaches actor 0 during one update.
function hit(g, weak = false) {
  const a = g.actors[0];
  g.bullets.push({ id: g.nextBullet++, owner: 3, team: 1, x: a.x + 18, y: a.y, vx: -470, vy: 0, life: 1,
    damage: weak ? 4 : 10, weak });
  g.update(step);
}

test('normal hits briefly slow movement and lock fire, then allow shooting before movement recovers', () => {
  const g = fixture(), a = g.actors[0];
  hit(g);
  assert.equal(a.flinch, .2);
  assert.equal(a.fireLock, .1);
  const x = a.x;
  for (let i = 0; i < 5; i++) g.update(step, { x: 1, shoot: true, aim: 0 });
  assert.equal(a.stats.shots, 0);
  assert.ok(Math.abs(a.x - x - CONFIG.speed * .8 * 5 * step) < 1e-6);
  g.update(step, { shoot: true });
  assert.equal(a.stats.shots, 1);
  assert.ok(a.flinch > 0);
  for (let i = 0; i < 7; i++) g.update(step);
  assert.ok(a.flinch < 1e-8);
  assert.equal(a.slowFactor, 1);
});
test('additional hits deal damage without extending flinch and immunity expires after 0.8 seconds', () => {
  const g = fixture(), a = g.actors[0];
  hit(g);
  for (let i = 0; i < 6; i++) g.update(step);
  const remaining = a.flinch;
  hit(g);
  assert.equal(a.hp, 80);
  assert.ok(a.flinch < remaining);
  assert.ok(a.fireLock < 1e-8);
  for (let i = 0; i < 30; i++) g.update(step);
  hit(g);
  assert.ok(a.flinch < 1e-8);
  for (let i = 0; i < 12; i++) g.update(step);
  hit(g);
  assert.equal(a.flinch, .2);
  g.reset();
  assert.equal(g.actors[0].flinchGuard, 0);
});
test('weak shots never flinch and mud uses the strongest slowdown without multiplying it', () => {
  const g = fixture(), a = g.actors[0];
  hit(g, true);
  assert.equal(a.hp, 96);
  assert.equal(a.flinch, 0);
  assert.equal(a.fireLock, 0);
  const p = g.puddles[2];
  p.water = p.capacity;
  Object.assign(a, { x: p.x, y: p.y, water: 100 });
  hit(g);
  g.update(step, { x: 1 });
  assert.equal(a.slowFactor, .7);
});
