import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WEAPONS, weaponWait, shotRange, ZONE } from '../src/game.mjs';
import { near, advance, fire } from './helpers.mjs';

const dt = 1 / 60;
// Actor 0 at (200, 100) with a full tank and the given weapon; bots stand still, keeping their aim.
function setup(weapon = 'normal') {
  const g = new Game(5);
  g.botControl = a => ({ x: 0, y: 0, aim: a.aim, shoot: false });
  const a = g.actors[0];
  Object.assign(a, { x: 200, y: 100, water: 100 });
  g.start();
  g.selectWeapon(a, weapon);
  return { g, a };
}

test('weapon specs produce the expected pellets, water cost and independent timers', () => {
  for (const w of WEAPONS) {
    const { g, a } = setup(w.id);
    fire(g, { shoot: true, aim: 0 });
    assert.equal(g.bullets.length, w.id === 'long' ? 0 : w.pellets);
    if (w.id === 'long') assert.equal(g.effects.find(e => e.kind === 'beam').damage, w.damage);
    near(a.water, 100 - w.cost);
    near(g.usedWater, w.cost);
    near(a.weaponCooldowns[w.id], w.interval);
    assert.ok(g.bullets.every(b => b.damage === w.damage && b.pierce === w.pierce));
    assert.equal(a.stats.shots, 1);
  }
});
test('normal projectiles expire exactly at range, with no damage beyond it', () => {
  for (const w of [WEAPONS[0]]) {
    const { g, a } = setup(w.id);
    Object.assign(g.actors[3], { x: a.x + w.range + 25, y: 100 });
    fire(g, { shoot: true, aim: 0 });
    advance(g, 1.5);
    assert.equal(g.actors[3].hp, 100);
    assert.equal(g.bullets.length, 0);
  }
});
test('expiration clips the last movement segment and produces a splash at the endpoint', () => {
  const { g, a } = setup();
  g.update(.05, { shoot: true, aim: 0 });
  const b = g.bullets[0];
  for (let i = 0; i < 15; i++) g.update(.05);
  near(b.x, a.x + 360);
  assert.ok(g.effects.some(e => e.kind === 'splash' && Math.abs(e.x - 560) < 1e-6));
});
test('splash delivers thirty at close range and fewer pellets at distance', () => {
  const damage = [];
  for (const d of [45, 110, 160]) {
    const { g } = setup('splash');
    Object.assign(g.actors[3], { x: 200 + d, y: 100 });
    fire(g, { shoot: true, aim: 0 });
    advance(g, .5);
    damage.push(100 - g.actors[3].hp);
  }
  assert.equal(damage[0], 30);
  assert.ok(damage[1] > 0 && damage[1] < 30);
  assert.equal(damage[2], 0);
});
test('long barrel hits each enemy only once and continues through multiple enemies', () => {
  const { g } = setup('long');
  for (let i = 3; i < 6; i++) Object.assign(g.actors[i], { x: 280 + (i - 3) * 65, y: 100 });
  fire(g, { shoot: true, aim: 0 });
  advance(g, .6);
  assert.deepEqual(g.actors.slice(3).map(a => a.hp), [55, 55, 55]);
  assert.equal(g.actors[0].stats.hits, 3);
});
test('long barrel stops at cover, including cover immediately against its muzzle', () => {
  for (const x of [300, 321]) {
    const { g, a } = setup('long');
    Object.assign(a, { x, y: 250 });
    Object.assign(g.actors[3], { x: 500, y: 250 });
    fire(g, { shoot: true, aim: 0 });
    advance(g, .6);
    assert.equal(g.actors[3].hp, 100);
    assert.equal(g.bullets.length, 0);
  }
});
test('switching away permits another weapon after recoil, but never resets the long cooldown', () => {
  const { g, a } = setup('long');
  fire(g);
  g.selectWeapon(a, 'normal');
  advance(g, 5, { shoot: true });
  assert.equal(a.stats.shots, 2);
  g.selectWeapon(a, 'long');
  const wait = weaponWait(a);
  assert.ok(wait > 9.9);
  advance(g, 1, { shoot: true });
  assert.equal(a.stats.shots, 2);
  a.water = 100;
  advance(g, 9);
  fire(g);
  assert.equal(a.stats.shots, 3);
  near(a.weaponCooldowns.long, 15);
});
test('water shortage produces one common weak shot and switching cannot bypass its interval', () => {
  for (const w of WEAPONS) {
    const { g, a } = setup(w.id);
    a.water = w.cost - 1;
    fire(g);
    assert.equal(g.bullets.length, 1);
    const b = g.bullets[0];
    assert.equal(b.damage, 4);
    assert.equal(b.pierce, false);
    assert.ok(b.weak);
    near(a.water, w.cost - 1);
    assert.equal(shotRange(a), 180);
    g.selectWeapon(a, 'normal');
    advance(g, .3, { shoot: true });
    assert.equal(a.stats.shots, 1);
  }
});
test('cooling long barrel cannot fire free weak rounds; pause and reset preserve expected timing', () => {
  const { g, a } = setup('long');
  a.water = 25;
  fire(g);
  advance(g, 1, { shoot: true });
  assert.equal(a.stats.shots, 1);
  const cd = a.weaponCooldowns.long;
  g.state = 'ready';
  g.update(.05);
  near(a.weaponCooldowns.long, cd);
  assert.equal(g.selectWeapon(a, 'normal'), false);
  g.reset();
  assert.equal(g.actors[0].weapon, 'normal');
  assert.deepEqual(g.actors[0].weaponCooldowns, { normal: 0, splash: 0, long: 0 });
});
test('all paid weapons receive control bonus, weak shots do not', () => {
  for (const w of WEAPONS) {
    const { g, a } = setup(w.id);
    Object.assign(g.actors[1], ZONE);
    fire(g);
    assert.ok(g.bullets.every(b => b.damage === w.damage * 2));
    if (w.id === 'long') assert.equal(g.effects.find(e => e.kind === 'beam').damage, w.damage * 2);
    const h = setup(w.id);
    Object.assign(h.g.actors[1], ZONE);
    h.a.water = 0;
    fire(h.g);
    assert.equal(h.g.bullets[0].damage, 4);
  }
});
test('faucet operation blocks all weapons, and bots select according to range and readiness', () => {
  for (const w of WEAPONS) {
    const { g, a } = setup(w.id), t = g.taps[0];
    Object.assign(a, { x: t.x, y: t.y });
    fire(g);
    assert.equal(a.stats.shots, 0);
  }
  const g = new Game(2), a = g.actors[3], enemy = g.actors[0];
  Object.assign(a, { x: 800, y: 100, water: 100 });
  Object.assign(enemy, { x: 720, y: 100 });
  g.botControl(a, dt);
  assert.equal(a.weapon, 'splash');
  enemy.x = 300;
  g.botControl(a, dt);
  assert.equal(a.weapon, 'normal');
  a.weaponCooldowns.long = 5;
  assert.equal(g.botControl(a, dt).shoot, false);
  assert.equal(a.weapon, 'normal');
});
