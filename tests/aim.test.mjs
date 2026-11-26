import test from 'node:test';
import assert from 'node:assert/strict';
import { AimAssist } from '../src/aim.mjs';

// A minimal stand-in for Game: a shooter at the origin, one enemy at (200, 30) and no walls.
const fixture = () => {
  const a = { id: 0, team: 0, x: 0, y: 0, aim: 0, alive: true, weapon: 'normal', water: 100, charge: 0 };
  const b = { id: 1, team: 1, x: 200, y: 30, alive: true };
  return { a, b, g: { actors: [a, b], clearPath: () => true }, assist: new AimAssist() };
};

test('light assistance stays bounded and never accumulates into auto-turning', () => {
  const { a, b, g, assist } = fixture();
  let aim;
  for (let i = 0; i < 180; i++) {
    aim = assist.resolve(g, a, { direction: i ? null : 0, shooting: true }, 1 / 60);
    a.aim = aim;
  }
  assert.ok(aim > 0 && aim <= Math.PI / 30);
  b.y = 100;
  assert.equal(assist.resolve(g, a, { shooting: true }, 1 / 60), 0);
});

test('walls, range, allies, dead targets and cursor distance exclude targets', () => {
  for (const type of ['wall', 'range', 'ally', 'dead', 'cursor']) {
    const { a, b, g, assist } = fixture();
    if (type === 'wall') g.clearPath = () => false;
    if (type === 'range') b.x = 500;
    if (type === 'ally') b.team = 0;
    if (type === 'dead') b.alive = false;
    assert.equal(assist.resolve(g, a, { direction: 0, shooting: true, cursor: type === 'cursor' ? { x: 0, y: 0 } : null },
      1 / 60), 0);
  }
});

test('PC cursor proximity and release use manual aim', () => {
  const { a, b, g, assist } = fixture();
  assert.ok(assist.resolve(g, a, { direction: 0, shooting: true, cursor: { x: 200, y: 25 } }, 1 / 60) > 0);
  assert.equal(assist.resolve(g, a, { direction: .1, shooting: false }, 1 / 60), .1);
});

test('long barrel keeps the assisted angle of the charge start while the input holds still, even if the enemy moves', () => {
  const { a, b, g, assist } = fixture();
  a.weapon = 'long';
  a.chargeAim = assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60);
  assert.ok(a.chargeAim > 0 && a.chargeAim <= Math.PI / 60);
  a.charge = .1;
  b.y = -30;
  assert.equal(assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60), a.chargeAim);
  assert.equal(assist.resolve(g, a, { direction: null, shooting: true }, 1 / 60), a.chargeAim, 'stick let go');
});

test('long barrel follows the input while charging, without assistance once the input moves', () => {
  const { a, g, assist } = fixture();
  a.weapon = 'long';
  a.chargeAim = assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60);
  a.charge = .1;
  assert.equal(assist.resolve(g, a, { direction: -.2, shooting: true }, 1 / 60), -.2);
  // back where it started: still the plain input (the correction is not picked up again during this charge)
  assert.equal(assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60), 0);
  assert.equal(assist.visibleTarget(g, a, true), null);
});

test('stable candidate preference, weak range and reset', () => {
  const { a, b, g, assist } = fixture();
  assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60);
  g.actors.push({ ...b, id: 2, y: 29 });
  assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60);
  assert.equal(assist.target, 1);
  a.water = 0;
  assert.equal(assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60), 0);
  assist.reset();
  a.aim = 1;
  assert.equal(assist.resolve(g, a, { shooting: false }, 1 / 60), 1);
});

test('target marker disappears immediately on release, wall, range, defeat or charge', () => {
  for (const reason of ['release', 'wall', 'range', 'defeat', 'charge', 'end']) {
    const { a, b, g, assist } = fixture();
    g.state = 'playing';
    assist.resolve(g, a, { direction: 0, shooting: true }, 1 / 60);
    assert.equal(assist.visibleTarget(g, a, true), 1);
    if (reason === 'wall') g.clearPath = () => false;
    if (reason === 'range') b.x = 500;
    if (reason === 'defeat') b.alive = false;
    if (reason === 'charge') a.charge = .01;
    if (reason === 'end') g.state = 'ended';
    assert.equal(assist.visibleTarget(g, a, reason !== 'release'), null);
  }
});
