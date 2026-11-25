import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, distance, clearPath, ZONE } from '../src/game.mjs';

const dt = 1 / 60;
// Only three actors stay alive: bot a with a full tank in the north-west, its ally in the zone and a far enemy.
function firingFixture() {
  const g = new Game(12);
  for (const b of g.actors) b.alive = false;
  const a = g.actors[1], enemy = g.actors[3], anchor = g.actors[2];
  Object.assign(a, { alive: true, x: 260, y: 200, water: 100 });
  Object.assign(enemy, { alive: true, x: 950, y: 140 });
  Object.assign(anchor, { alive: true, x: 600, y: 360, water: 100 });
  a.ai.refill = false;
  g.start();
  return { g, a, enemy, anchor };
}
// Runs only a's controller for n seconds of game time (nothing else moves); returns its last control.
function aimFor(g, a, n) {
  let input;
  for (let i = 0; i < Math.round(n / dt); i++) {
    g.time += dt;
    input = g.botControl(a, dt);
  }
  return input;
}

test('opening does not trigger a long shot in the first second across seeds', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game(seed);
    g.start();
    for (let i = 0; i < 60; i++) {
      g.update(dt, {});
      assert.ok(g.actors.every(a => a.recoil === 0));
    }
  }
});
test('long requires sustained aim and reachable cover, then retreats toward that cover', () => {
  const { g, a, enemy } = firingFixture();
  aimFor(g, a, .2);
  assert.equal(a.weapon, 'normal');
  assert.ok(a.ai.aimTime > 0);
  const input = aimFor(g, a, .6);
  assert.equal(a.weapon, 'long');
  assert.ok(input.shoot);
  const cover = { ...a.ai.longEscape };
  assert.ok(clearPath(a, cover, 14 - .25));
  assert.equal(clearPath(enemy, cover), false);
  // Only a acts: it holds its position until the long shot fires, then follows its own controller.
  const original = g.botControl.bind(g);
  g.botControl = (b, d) => {
    if (b !== a) return { x: 0, y: 0, shoot: false, aim: 0 };
    const c = original(b, d);
    return a.recoil > 0 ? c : { ...c, x: 0, y: 0 };
  };
  for (let i = 0; i < 48; i++) g.update(dt);
  assert.ok(a.recoil > 0);
  const before = distance(a, cover);
  for (let i = 0; i < 60; i++) g.update(dt);
  assert.equal(a.ai.goal.id, 'retreat');
  assert.ok(distance(a, cover) < before - 20);
});
test('damage, lost sight, close enemies, and unavailable teammate cover interrupt aim', () => {
  for (const kind of ['hit', 'sight', 'close', 'ally']) {
    const { g, a, enemy, anchor } = firingFixture();
    aimFor(g, a, .7);
    assert.ok(a.ai.aimTime > .5);
    if (kind === 'hit') a.hp -= 6;
    if (kind === 'sight') Object.assign(enemy, { x: 800, y: 300 });
    if (kind === 'close') Object.assign(enemy, { x: 320, y: 200 });
    if (kind === 'ally') anchor.recoil = 3;
    g.botControl(a, dt);
    assert.equal(a.ai.aimTime, 0);
    assert.notEqual(a.weapon, 'long');
  }
});
test('open ground without a cover route never authorizes a long shot', () => {
  const { g, a, enemy } = firingFixture();
  Object.assign(a, { x: 100, y: 100 });
  Object.assign(enemy, { x: 1050, y: 100 });
  aimFor(g, a, 3);
  assert.equal(a.weapon, 'normal');
  assert.equal(a.ai.aimTime, 0);
});
test('same-team simultaneous long requests are serialized, including the human firing first', () => {
  const g = new Game();
  g.start();
  for (const a of g.actors) Object.assign(a, { water: 100, weapon: 'long' });
  g.botControl = () => ({ x: 0, y: 0, aim: 0, shoot: true });
  for (let i = 0; i < 48; i++) g.update(dt, { shoot: true });
  assert.equal(g.actors.filter(a => a.team === 0 && a.recoil > 0).length, 1);
  assert.equal(g.actors.filter(a => a.team === 1 && a.recoil > 0).length, 1);
  g.reset();
  assert.deepEqual(g.lastTeamLong, [-Infinity, -Infinity]);
  assert.ok(g.actors.every(a => a.ai.aimTime === 0));
});
test('anchor, separate attacking lanes and lowest-water supplier adapt to casualties', () => {
  const g = new Game();
  g.start();
  for (const a of g.actors.filter(a => a.team === 0)) a.alive = false;
  const [a, b, c] = g.actors.slice(3);
  Object.assign(a, { x: 610, y: 360, water: 100 });
  Object.assign(b, { x: 800, y: 320, water: 100 });
  Object.assign(c, { x: 800, y: 400, water: 100 });
  for (const x of [a, b, c]) g.botControl(x, dt);
  assert.equal(a.ai.duty, 'anchor');
  assert.notEqual(b.ai.goal.y, c.ai.goal.y);
  b.water = 5;
  c.water = 15;
  for (const x of [a, b, c]) g.botControl(x, dt);
  assert.equal(b.ai.duty, 'supply');
  assert.notEqual(c.ai.duty, 'supply');
  assert.equal(a.ai.duty, 'anchor');
  a.alive = false;
  c.water = 50;
  g.botControl(c, dt);
  assert.equal(c.ai.duty, 'anchor');
  assert.equal(c.ai.goal.id, 'zone');
});
test('sole objective holder keeps its weapon available rather than taking long recoil', () => {
  const { g, a, enemy, anchor } = firingFixture();
  anchor.alive = false;
  Object.assign(a, { x: ZONE.x, y: ZONE.y });
  Object.assign(enemy, { x: 1000, y: 360 });
  aimFor(g, a, 3);
  assert.notEqual(a.weapon, 'long');
  assert.equal(a.ai.duty, 'anchor');
});
