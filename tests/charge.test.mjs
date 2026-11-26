import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG, longRayEnd } from '../src/game.mjs';
import { AimAssist } from '../src/aim.mjs';
import { near } from './helpers.mjs';

const dt = 1 / 60;
// Actor 0 at (200, 100) with a full tank and the long barrel selected; bots stand still.
function setup() {
  const g = new Game(2);
  g.botControl = () => ({ x: 0, y: 0, aim: 0, shoot: false });
  const a = g.actors[0];
  Object.assign(a, { x: 200, y: 100, weapon: 'long', water: 100 });
  g.start();
  return { g, a };
}
// n updates with the same input (by default: hold fire, aiming right).
function step(g, n, input = { shoot: true, aim: 0 }) {
  for (let i = 0; i < n; i++) g.update(dt, input);
}

test('0.8-second charge reserves no water or cooldown and then hits the far target in the firing tick', () => {
  const { g, a } = setup();
  Object.assign(g.actors[3], { x: 1100, y: 100 });
  step(g, 47);
  near(a.water, 100);
  near(a.weaponCooldowns.long, 0);
  assert.equal(a.stats.shots, 0);
  assert.equal(g.actors[3].hp, 100);
  step(g, 1);
  assert.equal(a.stats.shots, 1);
  assert.equal(g.actors[3].hp, 55);
  near(a.water, 75);
  near(a.recoil, 5);
  near(a.weaponCooldowns.long, 15);
  assert.equal(g.bullets.length, 0);
  assert.ok(g.effects.some(e => e.kind === 'beam'));
});
test('release and switch cancel freely; returning to long restarts the full charge', () => {
  for (const cancel of ['release', 'switch']) {
    const { g, a } = setup();
    step(g, 30);
    if (cancel === 'release') g.update(dt, {});
    else {
      g.selectWeapon(a, 'normal');
      g.selectWeapon(a, 'long');
    }
    near(a.charge, 0);
    near(a.water, 100);
    near(a.weaponCooldowns.long, 0);
    step(g, 47);
    assert.equal(a.stats.shots, 0);
    step(g, 1);
    assert.equal(a.stats.shots, 1);
  }
});
test('charge slows movement, limits rotation, and locks the final 0.2 seconds', () => {
  const { g, a } = setup();
  step(g, 1);
  const x = a.x;
  step(g, 1, { shoot: true, aim: Math.PI / 2, x: 1 });
  near(a.x - x, CONFIG.speed * .7 * dt);
  assert.ok(a.aim > 0 && a.aim <= CONFIG.longTurnRate * dt + 1e-8);
  step(g, 34, { shoot: true, aim: Math.PI / 2 });
  const angle = a.aim;
  step(g, 11, { shoot: true, aim: -Math.PI / 2 });
  near(a.aim, angle);
  step(g, 1, { shoot: true, aim: -Math.PI / 2 });
  near(a.recoilAim, angle);
});
test('the player re-aims a charge through the aim assist: the barrel turns toward the input until the lock', () => {
  const { g, a } = setup(), assist = new AimAssist();
  // what js/play.js does every frame: the input direction through AimAssist, then the game step
  const frame = direction => g.update(dt, { shoot: true, aim: assist.resolve(g, a, { direction, shooting: true }, dt) });
  frame(0);
  const start = a.chargeAim;
  for (let i = 0; i < 35; i++) frame(Math.PI / 2);
  const turned = a.aim - start;
  assert.ok(turned > CONFIG.longTurnRate * dt * 30 && turned <= CONFIG.longTurnRate * dt * 36 + 1e-8, `turned ${turned}`);
  const locked = a.aim;
  for (let i = 0; i < 11; i++) frame(-Math.PI / 2);
  near(a.aim, locked);
  frame(-Math.PI / 2);
  assert.equal(a.stats.shots, 1);
  near(a.recoilAim, locked);
});
test('warning endpoint and instant piercing beam stop at the same wall', () => {
  const { g, a } = setup();
  Object.assign(a, { x: 250, y: 250 });
  Object.assign(g.actors[3], { x: 270, y: 250 });
  Object.assign(g.actors[4], { x: 310, y: 250 });
  Object.assign(g.actors[5], { x: 500, y: 250 });
  const end = longRayEnd(a, 0);
  step(g, 48);
  assert.deepEqual(g.actors.slice(3).map(a => a.hp), [55, 55, 100]);
  const beam = g.effects.find(e => e.kind === 'beam');
  near(beam.endX, end.x);
  near(beam.endY, end.y);
});
test('bots and player use identical charge timing and consumption', () => {
  const { g, a } = setup(), b = g.actors[3];
  Object.assign(b, { x: 1000, y: 150, weapon: 'long', water: 100 });
  g.botControl = x => ({ x: 0, y: 0, aim: Math.PI, shoot: x === b });
  step(g, 47);
  near(a.charge, b.charge);
  near(b.water, 100);
  step(g, 1);
  near(b.water, 75);
  near(a.recoil, b.recoil);
  assert.equal(b.stats.shots, 1);
});
test('firing lock, pump operation, defeat and reset clear the charge', () => {
  for (const mode of ['lock', 'pump', 'death', 'reset']) {
    const { g, a } = setup();
    step(g, 20);
    if (mode === 'lock') {
      a.fireLock = .1;
      step(g, 1);
    }
    if (mode === 'pump') {
      Object.assign(a, { x: g.taps[0].x, y: g.taps[0].y });
      step(g, 1);
    }
    if (mode === 'death') g.hitBullet({ id: 999, owner: 3, team: 1, vx: 1, vy: 0, damage: 100, weak: false }, a, a.x, a.y);
    if (mode === 'reset') g.reset();
    assert.equal(g.actors[0].charge, 0);
  }
});
test('visible locked enemy charge triggers a sideways dodge', () => {
  const { g, a } = setup(), b = g.actors[3];
  Object.assign(a, { x: 200, y: 100, charge: .65, chargeAim: 0 });
  Object.assign(b, { x: 700, y: 100 });
  const control = Game.prototype.botControl.call(g, b, dt);
  assert.equal(b.ai.mode, 'evade');
  assert.ok(Math.abs(control.y) > .9);
  assert.equal(control.shoot, false);
});
