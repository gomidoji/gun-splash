import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STAGES } from '../src/game.mjs';
import { accountedWater } from './helpers.mjs';

const dt = 1 / 60;
const pose = g => g.actors.map(a => [a.x, a.y, a.hp, a.water, a.alive, a.weapon, a.stats.shots]);

test('autopilot is off by default: the player only follows the given input', () => {
  const g = new Game(5, 'tutorial');
  g.start();
  const you = g.actors[0], start = { x: you.x, y: you.y };
  assert.ok(!g.autopilot);
  for (let i = 0; i < 30; i++) g.update(dt, {});
  assert.equal(you.x, start.x);
  assert.equal(you.y, start.y);
  assert.equal(you.stats.shots, 0);
  assert.equal(you.human, true);
});
test('autopilot unset or false leaves every rule and bot decision unchanged', () => {
  const a = new Game(11, 'lanes'), b = new Game(11, 'lanes');
  b.autopilot = false;
  a.start();
  b.start();
  for (let i = 0; i < 600; i++) {
    a.update(dt, { x: .4, y: -.2, aim: .3, shoot: i % 40 < 20 });
    b.update(dt, { x: .4, y: -.2, aim: .3, shoot: i % 40 < 20 });
  }
  assert.deepEqual(pose(a), pose(b));
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.time, b.time);
});
test('autopilot drives actor 0 with the bot controller and keeps it marked as the player', () => {
  const g = new Game(5, 'tutorial');
  g.autopilot = true;
  g.start();
  const you = g.actors[0], start = { x: you.x, y: you.y };
  let moved = false, shot = false;
  for (let i = 0; i < 1800 && g.state === 'playing'; i++) {
    g.update(dt, { x: -1, y: 0, shoot: false });   // player input is ignored while the bot drives
    moved ||= Math.hypot(you.x - start.x, you.y - start.y) > 40;
    shot ||= you.stats.shots > 0;
    assert.equal(you.human, true);
  }
  assert.ok(moved, 'actor 0 walks toward an objective');
  assert.ok(shot, 'actor 0 fires at visible enemies');
  assert.notEqual(you.ai.goal, null);
});
test('autopilot matches are deterministic for a seed', () => {
  const run = () => {
    const g = new Game(23, 'alleys');
    g.autopilot = true;
    g.start();
    for (let i = 0; i < 900; i++) g.update(dt, {});
    return g;
  };
  const a = run(), b = run();
  assert.deepEqual(pose(a), pose(b));
  assert.deepEqual(a.scores, b.scores);
});
test('autopilot can be switched off again: the player regains control', () => {
  const g = new Game(5, 'tutorial');
  g.autopilot = true;
  g.start();
  for (let i = 0; i < 60; i++) g.update(dt, {});
  g.autopilot = false;
  const you = g.actors[0], x = you.x, y = you.y, shots = you.stats.shots;
  for (let i = 0; i < 30; i++) g.update(dt, {});
  // only body pushes from teammates could move an idle player a little
  assert.ok(Math.hypot(you.x - x, you.y - y) < 15);
  assert.equal(you.stats.shots, shots);
  for (let i = 0; i < 30; i++) g.update(dt, { x: 0, y: 1 });
  assert.ok(you.y > y + 30, 'the given input moves the player again');
});
for (const stage of STAGES) {
  test(`${stage.id}: a full autopilot round ends and conserves water`, () => {
    const g = new Game(7, stage.id);
    g.autopilot = true;
    g.start();
    for (let i = 0; i < 5600 && g.state === 'playing'; i++) g.update(dt, {});
    assert.equal(g.state, 'ended');
    assert.ok(['全滅', '陣地を30秒確保', 'タイムアップ', '最終局面終了'].includes(g.reason));
    const total = accountedWater(g);
    assert.ok(Math.abs(total - g.initialTotalWater) < .001);
    assert.ok(g.actors[0].stats.shots > 0);
    assert.equal(g.actors[0].human, true);
  });
}
