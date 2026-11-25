import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.mjs';

// Actor 0 at (200, 100) with the given weapon and water; bots stand still.
function setup(weapon, water = 100) {
  const g = new Game(2);
  g.botControl = () => ({ x: 0, y: 0, aim: 0, shoot: false });
  const a = g.actors[0];
  Object.assign(a, { x: 200, y: 100, weapon, water });
  g.start();
  return { g, a };
}
// Holds fire for one shot: 48 ticks to charge a long barrel with water for it, otherwise one tick.
function fire(g, aim = 0) {
  const ticks = g.actors[0].weapon === 'long' && g.actors[0].water >= 25 ? 48 : 1;
  for (let i = 0; i < ticks; i++) g.update(1 / 60, { shoot: true, aim });
}

test('special fire effects keep the fired weapon, aim and true range after switching', () => {
  for (const weapon of ['long', 'splash']) {
    const { g, a } = setup(weapon);
    fire(g, .3);
    const fireFx = g.effects.find(e => e.kind === 'fire');
    assert.equal(fireFx.weapon, weapon);
    assert.equal(fireFx.aim, .3);
    assert.equal(fireFx.range, weapon === 'long' ? 1400 : 120);
    assert.equal(g.bullets.length, weapon === 'long' ? 0 : 5);
    assert.ok(g.bullets.every(b => b.travelled > 0));
    g.selectWeapon(a, 'normal');
    assert.equal(fireFx.weapon, weapon);
  }
});
test('water-starved special weapons keep the restrained weak-shot effects', () => {
  for (const weapon of ['long', 'splash']) {
    const { g } = setup(weapon, 0);
    fire(g);
    assert.ok(!g.effects.some(e => e.kind === 'fire'));
    assert.equal(g.bullets.length, 1);
    assert.equal(g.bullets[0].weak, true);
  }
});
test('impact feedback identifies the actual projectile weapon', () => {
  for (const weapon of ['long', 'splash']) {
    const { g } = setup(weapon);
    Object.assign(g.actors[3], { x: 260, y: 100 });
    fire(g);
    for (let i = 0; i < 12; i++) g.update(1 / 60, {});
    assert.ok(g.combatEvents.length > 0);
    assert.ok(g.combatEvents.every(e => e.weapon === weapon));
    assert.ok(g.effects.some(e => e.kind === 'hit' && e.weapon === weapon));
  }
});
