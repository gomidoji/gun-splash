import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, distance, clearPath } from '../src/game.mjs';

// Only three actors stay alive: bot a with a full tank, its anchor ally in the zone and one enemy to the east.
function fixture() {
  const g = new Game(32);
  g.start();
  for (const b of g.actors) b.alive = false;
  const a = g.actors[1], ally = g.actors[2], enemy = g.actors[3];
  Object.assign(a, { alive: true, x: 500, y: 330, water: 100 });
  a.ai.refill = false;
  Object.assign(ally, { alive: true, x: 600, y: 360, water: 100 });
  ally.ai.duty = 'anchor';
  Object.assign(enemy, { alive: true, x: 800, y: 360 });
  return { g, a, ally, enemy };
}
test('peek route offers a reachable concealed return, hides after burst, then reappears', () => {
  const { g, a, ally, enemy } = fixture();
  const plan = () => g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, false);
  assert.equal(plan().id, 'cover-peek');
  const hide = { ...a.ai.tactic.hide }, peek = { ...a.ai.tactic.peek };
  assert.ok(clearPath(peek, enemy));
  assert.ok(!clearPath(hide, enemy));
  assert.ok(clearPath(peek, hide, 13.75));
  a.stats.shots += 3;
  assert.equal(plan().id, 'cover-hide');
  Object.assign(a, hide);
  g.time += .8;
  assert.equal(plan().id, 'cover-peek');
});
test('damage interrupts a burst and exposed cover is abandoned', () => {
  const { g, a, ally, enemy } = fixture();
  g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, false);
  assert.equal(g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, true).id, 'cover-hide');
  const old = a.ai.tactic;
  const threat = { id: 5, x: old.hide.x, y: old.hide.y - 60 };
  g.combatPlan(a, enemy, [ally], [enemy, threat], 1 / 60, false);
  assert.notEqual(a.ai.tactic, old);
});
test('ranged position has line of fire and cover; vulnerable close target invites splash approach', () => {
  const { g, a, ally, enemy } = fixture();
  Object.assign(a, { x: 250, y: 360 });
  const goal = g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, false);
  assert.equal(goal.id, 'snipe');
  assert.ok(distance(goal, enemy) > 400);
  assert.ok(clearPath(goal, enemy));
  assert.ok(g.longEscape(goal, enemy, [enemy]));
  a.ai.tactic = null;
  Object.assign(a, { x: 650, y: 360 });
  enemy.recoil = 3;
  const rush = g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, false);
  assert.equal(rush.id, 'rush');
  assert.ok(distance(rush, enemy) < 90);
  Object.assign(a, rush);
  a.weaponCooldowns.splash = 0;
  g.botControl(a, 1 / 60);
  assert.equal(a.weapon, 'splash');
});
test('open-ground attacker creates a crossfire angle instead of following partner', () => {
  const { g, a, ally, enemy } = fixture();
  Object.assign(a, { x: 200, y: 100 });
  Object.assign(ally, { x: 700, y: 100 });
  Object.assign(enemy, { x: 1000, y: 100 });
  a.weaponCooldowns.long = 10;
  const goal = g.combatPlan(a, enemy, [ally], [enemy], 1 / 60, false);
  assert.equal(goal.id, 'pincer');
  const cos = ((goal.x - enemy.x) * (ally.x - enemy.x) + (goal.y - enemy.y) * (ally.y - enemy.y)) /
    (distance(goal, enemy) * distance(ally, enemy));
  assert.ok(cos < .8);
  assert.ok(clearPath(goal, enemy));
});
test('urgent capture and low health cancel tactical plans; hidden targets are forgotten', () => {
  for (const urgent of [true, false]) {
    const { g, a } = fixture();
    g.botControl(a, 1 / 60);
    if (urgent) g.scores[1] = 24;
    else a.hp = 20;
    g.botControl(a, 1 / 60);
    assert.equal(a.ai.tactic, null);
    assert.ok(urgent ? a.ai.goal.id === 'zone' : a.ai.mode === 'retreat');
  }
  const { g, a, enemy } = fixture();
  g.botControl(a, 1 / 60);
  Object.assign(enemy, { x: 800, y: 175 });
  g.time += 3;
  g.botControl(a, 1 / 60);
  assert.equal(a.ai.tactic, null);
});
