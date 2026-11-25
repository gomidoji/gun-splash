import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ZONE, distance } from '../src/game.mjs';

const dt = 1 / 60;

// Bot 1 stands on the first faucet with an empty tank and dry pools, assigned to pump there.
function fixture() {
  const g = new Game(8);
  for (const p of g.puddles) p.water = 0;
  const a = g.actors[1], t = g.taps[0];
  Object.assign(a, { x: t.x, y: t.y, water: 0 });
  a.ai.refill = true;
  a.ai.goal = t;
  a.ai.think = 1;
  g.start();
  return { g, a, t };
}

test('nearby enemy immediately interrupts watering and bot returns fire', () => {
  const { g, a, t } = fixture();
  a.water = 20;
  Object.assign(g.actors[3], { x: t.x + 120, y: t.y });
  const input = g.botControl(a, dt);
  assert.equal(a.ai.refill, false);
  assert.notEqual(a.ai.goal.id, t.id);
  assert.ok(Math.hypot(input.x, input.y) > 0);
  assert.ok(input.shoot);
  g.update(dt);
  assert.equal(a.tapId, null);
  assert.equal(t.water, 100);
  assert.ok(a.stats.shots > 0);
});

test('being hit cancels supply even without a visible attacker and prevents immediate return', () => {
  const { g, a, t } = fixture();
  a.hp -= 10;
  g.botControl(a, dt);
  assert.equal(a.ai.refill, false);
  assert.ok(a.ai.avoidSupplyUntil > g.time);
  g.time += .5;
  g.botControl(a, dt);
  assert.notEqual(a.ai.goal?.id, t.id);
  assert.equal(a.ai.refill, false);
});

test('one support bot reserves a faucet; teammates keep moving toward the objective', () => {
  const { g, a, t } = fixture();
  for (const enemy of g.actors.filter(b => b.team !== a.team)) enemy.alive = false;
  a.x -= 60;
  a.ai.think = 0;
  g.botControl(a, dt);
  assert.equal(a.ai.goal.id, t.id);
  const b = g.actors[2];
  Object.assign(b, { x: a.x - 30, y: a.y, water: 0 });
  b.ai.refill = true;
  g.botControl(b, dt);
  assert.equal(b.ai.refill, false);
  assert.equal(b.ai.goal.id, 'zone');
});

test('human-operated faucet is not claimed by a bot', () => {
  const { g, a, t } = fixture();
  Object.assign(g.actors[0], { x: t.x, y: t.y, tapId: t.id });
  a.x -= 70;
  a.ai.think = 0;
  g.botControl(a, dt);
  assert.notEqual(a.ai.goal?.id, t.id);
});

test('a threatened source is rejected before travelling there', () => {
  const { g, a, t } = fixture();
  a.x = 90;
  a.y = 510;
  a.ai.think = 0;
  Object.assign(g.actors[3], { x: 420, y: 580 });
  g.botControl(a, dt);
  assert.notEqual(a.ai.goal?.id, t.id);
});

test('enough water ends faucet work even when its reserve remains', () => {
  const { g, a, t } = fixture();
  g.puddles[0].water = 30;
  g.botControl(a, dt);
  assert.notEqual(a.ai.goal?.id, t.id);
  assert.equal(t.water, 100);
});

test('imminent capture loss and late losing rounds override supply', () => {
  for (const late of [false, true]) {
    const { g, a } = fixture();
    if (late) {
      g.time = 75;
      g.scores = [1, 2];
    } else g.scores[1] = 24;
    g.botControl(a, dt);
    assert.equal(a.ai.refill, false);
    assert.equal(a.ai.goal.id, 'zone');
  }
});

test('healthy objective defender stays assigned while a low-ammo teammate seeks water', () => {
  const { g, a } = fixture();
  const defender = g.actors[2];
  Object.assign(defender, { x: ZONE.x, y: ZONE.y, water: 30 });
  defender.ai.refill = true;
  g.botControl(defender, dt);
  assert.equal(defender.ai.goal.id, 'zone');
  assert.equal(defender.ai.refill, false);
  a.ai.think = 0;
  g.botControl(a, dt);
  assert.equal(a.ai.refill, true);
});

test('low-health bot navigates away from a faucet toward safe water or cover', () => {
  const { g, a, t } = fixture();
  a.hp = 20;
  a.ai.lastHp = 20;
  Object.assign(g.actors[3], { x: t.x + 130, y: t.y });
  const start = { x: a.x, y: a.y };
  const original = g.botControl.bind(g);
  g.botControl = (b, d) => b.id === a.id ? original(b, d) : { x: 0, y: 0, aim: 0, shoot: false };
  for (let i = 0; i < 120; i++) g.update(dt);
  assert.ok(distance(a, start) > 40);
  assert.equal(t.water, 100);
  assert.equal(a.tapId, null);
});
