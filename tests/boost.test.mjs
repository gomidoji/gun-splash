import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ZONE } from '../src/game.mjs';

// Bots stand still; actor 0 waits at (300, 360), west of the zone.
function fixture() {
  const g = new Game();
  g.botControl = a => ({ x: 0, y: 0, aim: 0, shoot: false });
  Object.assign(g.actors[0], { x: 300, y: 360 });
  g.start();
  return g;
}
// Actor 0 fires once to the right with its timers cleared; returns the newest bullet.
function fire(g) {
  g.actors[0].cooldown = 0;
  g.actors[0].weaponCooldowns.normal = 0;
  g.update(1 / 60, { shoot: true, aim: 0 });
  return g.bullets.at(-1);
}

test('exclusive control boosts teammates outside the zone, but not weak shots', () => {
  const g = fixture();
  Object.assign(g.actors[1], ZONE);
  let b = fire(g);
  assert.equal(b.damage, 12);
  assert.equal(b.boosted, true);
  assert.equal(g.actors[0].water, 45);
  g.actors[0].water = 0;
  b = fire(g);
  assert.equal(b.damage, 4);
  assert.equal(b.boosted, false);
});
test('enemy entry cancels boost on the same tick regardless of actor order', () => {
  const g = fixture();
  Object.assign(g.actors[1], ZONE);
  fire(g);
  Object.assign(g.actors[3], { x: ZONE.x + ZONE.r + 1, y: ZONE.y });
  g.botControl = a => ({ x: a.id === 3 ? -1 : 0, y: 0, aim: 0, shoot: false });
  const b = fire(g);
  assert.equal(b.damage, 6);
  assert.equal(g.contested, true);
});
test('leaving, defeat and exclusive orange presence update the bonus', () => {
  const g = fixture();
  Object.assign(g.actors[1], ZONE);
  fire(g);
  g.actors[1].x = 200;
  assert.equal(fire(g).damage, 6);
  Object.assign(g.actors[1], ZONE);
  g.actors[1].alive = false;
  assert.equal(fire(g).damage, 6);
  Object.assign(g.actors[4], ZONE);
  g.botControl = a => ({ x: 0, y: 0, aim: Math.PI, shoot: a.id === 3 });
  g.update(1 / 60);
  assert.equal(g.bullets.find(b => b.owner === 3).damage, 12);
  assert.equal(g.zoneOwner, 1);
  g.reset();
  assert.equal(g.zoneOwner, null);
});
test('damage is frozen at firing time and boosted impacts deal twelve', () => {
  const g = fixture();
  Object.assign(g.actors[1], ZONE);
  Object.assign(g.actors[3], { x: 400, y: 360 });
  const b = fire(g);
  g.actors[1].x = 200;
  for (let i = 0; i < 12; i++) g.update(1 / 60);
  assert.equal(b.damage, 12);
  assert.equal(g.actors[3].hp, 88);
  const h = fixture();
  const normal = fire(h);
  Object.assign(h.actors[1], ZONE);
  h.update(1 / 60);
  assert.equal(normal.damage, 6);
});
