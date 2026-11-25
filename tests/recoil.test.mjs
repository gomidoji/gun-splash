import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG, WEAPONS, ZONE } from '../src/game.mjs';
import { near, fire } from './helpers.mjs';

const dt = 1 / 60;
// Actor 0 at (100, 100) with a full tank and the long barrel selected; bots stand still.
function setup() {
  const g = new Game(4);
  g.botControl = a => ({ x: 0, y: 0, aim: 0, shoot: false });
  const a = g.actors[0];
  Object.assign(a, { x: 100, y: 100, water: 100 });
  g.start();
  g.selectWeapon(a, 'long');
  return { g, a };
}
// n updates (ticks, not seconds) with the same input.
function advanceTicks(g, n, input = {}) {
  for (let i = 0; i < n; i++) g.update(dt, input);
}

test('new weapon balance: normal six, long forty-five and boosted long ninety', () => {
  assert.equal(WEAPONS[0].damage, 6);
  assert.equal(WEAPONS[2].damage, 45);
  assert.equal(WEAPONS[2].range, 1400);
  assert.ok(WEAPONS[2].range >= Math.hypot(CONFIG.width, CONFIG.height));
  for (const boost of [false, true]) {
    const { g } = setup();
    Object.assign(g.actors[3], { x: 1100, y: 100 });
    if (boost) Object.assign(g.actors[1], ZONE);
    fire(g, { shoot: true, aim: 0 });
    advanceTicks(g, 110);
    assert.equal(g.actors[3].hp, boost ? 10 : 55);
  }
});
test('all weapons and weak shots remain locked until five seconds after firing', () => {
  const { g, a } = setup();
  fire(g);
  assert.equal(a.recoil, 5);
  near(a.water, 75);
  for (let i = 0; i < 299; i++) {
    g.selectWeapon(a, WEAPONS[i % 3].id);
    fire(g);
    assert.equal(a.stats.shots, 1);
  }
  a.water = 0;
  g.selectWeapon(a, 'normal');
  fire(g);
  assert.equal(a.stats.shots, 2);
  assert.equal(a.lastShotWeak, true);
  near(a.recoil, 0);
  near(a.weaponCooldowns.long, 10);
});
test('recoil halves movement, uses strongest slowdown, and recovers at five seconds', () => {
  const { g, a } = setup();
  fire(g);
  const start = a.x;
  advanceTicks(g, 60, { x: 1 });
  near(a.x - start, CONFIG.speed * .5);
  const p = g.puddles[2];
  p.water = p.capacity;
  Object.assign(a, { x: p.x, y: p.y, water: 100, flinch: .2 });
  const x = a.x;
  g.update(dt, { x: 1 });
  near(a.x - x, CONFIG.speed * .5 * dt);
  near(a.slowFactor, .5);
  advanceTicks(g, 239);
  Object.assign(a, { x: 100, y: 100 });
  g.update(dt, { x: 1 });
  near(a.x - 100, CONFIG.speed * dt);
});
test('weak fallback does not trigger heavy recoil; pause and reset handle recoil correctly', () => {
  const { g, a } = setup();
  a.water = 0;
  fire(g);
  assert.equal(a.recoil, 0);
  advanceTicks(g, 36);
  a.water = 100;
  fire(g);
  assert.equal(a.recoil, 5);
  g.state = 'ready';
  g.update(.05);
  assert.equal(a.recoil, 5);
  g.reset();
  assert.equal(g.actors[0].recoil, 0);
});
test('incoming hits and refilling do not extend or clear the recoil lock', () => {
  const { g, a } = setup();
  fire(g);
  const p = g.puddles[0];
  Object.assign(a, { x: p.x, y: p.y });
  g.bullets.push({ id: 999, owner: 3, team: 1, x: a.x + 18, y: a.y, vx: -470, vy: 0, life: 1, damage: 6, weak: false });
  g.update(dt);
  near(a.recoil, 5 - dt);
  assert.ok(a.fireLock > 0);
  advanceTicks(g, 60);
  assert.equal(a.water, 100);
  assert.ok(a.recoil > 3.9 && a.recoil < 4);
});
