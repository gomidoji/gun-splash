// Helpers shared by several test files. Not a test file itself: `npm test` runs tests/*.test.mjs only.
import assert from 'node:assert/strict';
import { Game } from '../src/game.mjs';

// Equal within 1e-6. game.test.mjs keeps its own, looser near().
export const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// The stage-less layout (seed 42), started, with every bot standing still, keeping its aim and never firing.
export function quietGame() {
  const g = new Game(42);
  g.botControl = a => ({ x: 0, y: 0, aim: a.aim, shoot: false });
  g.start();
  return g;
}

// Math.round(seconds * 60) updates of 1/60 s, all with the same input.
export function advance(g, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.update(1 / 60, input);
}

// One shot by actor 0: 48 ticks (the full charge) for a ready long barrel with water for a paid shot, else one tick.
export function fire(g, input = { shoot: true }) {
  const a = g.actors[0],
    ticks = a.weapon === 'long' && a.water >= 25 && a.recoil <= 1e-6 && a.weaponCooldowns.long <= 1e-6 ? 48 : 1;
  for (let i = 0; i < ticks; i++) g.update(1 / 60, input);
}

// All water of the match: sources, tanks, water spent on shots and water lost with defeated actors.
export function accountedWater(g) {
  return g.remainingWater() + g.actors.reduce((s, a) => s + a.water, 0) + g.usedWater + g.discardedWater;
}
