import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Game, STAGES, AI_LEVELS, CONFIG, ZONE, distance, longRayEnd, insidePuddle, puddleOutline, segmentRect,
} from '../src/game.mjs';
import { accountedWater } from './helpers.mjs';

for (const stage of STAGES) {
  test(`${stage.id}: symmetric geometry and connected supply / objective routes`, () => {
    const g = new Game(20, stage.id);
    for (const o of g.obstacles) {
      assert.ok(g.obstacles.some(p => p.x === 1200 - o.x - o.w && p.y === 720 - o.y - o.h && p.w === o.w && p.h === o.h));
    }
    for (const target of [...g.actors, ...g.taps, ...g.puddles, ZONE]) {
      assert.ok(g.validPosition(target.x, target.y), `blocked ${target.id}`);
    }
    // Flood fill on a 10 px grid from beside the blue spawn; every step must leave room for a body.
    const queue = [{ x: 110, y: 360 }], seen = new Set(['110,360']);
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      const p = { x: queue[i].x + dx, y: queue[i].y + dy }, key = `${p.x},${p.y}`;
      if (seen.has(key) || !g.validPosition(p.x, p.y) || !g.clearPath(queue[i], p, CONFIG.radius + 2)) continue;
      seen.add(key);
      queue.push(p);
    }
    for (const target of [...g.actors, ...g.taps, ...g.puddles, ZONE]) {
      assert.ok(queue.some(p => distance(p, target) < 15 && g.clearPath(p, target, CONFIG.radius + 2)),
        `unreachable ${target.id}`);
    }
    assert.equal(g.initialTotalWater, 1200);
    assert.equal(g.actors.length, 6);
  });
  test(`${stage.id}: preserves all water, mirrored supplies and unobstructed pump flow`, () => {
    const g = new Game(20, stage.id);
    assert.equal(g.puddles.length, 4);
    assert.deepEqual(g.puddles.map(p => p.water), [70, 70, 180, 180]);
    assert.deepEqual(g.puddles.map(p => p.capacity), [100, 100, 250, 250]);
    assert.deepEqual(g.taps.map(t => t.water), [100, 100, 100, 100]);
    for (const [i, j] of [[0, 1], [2, 3]]) {
      assert.equal(g.puddles[i].x + g.puddles[j].x, 1200);
      assert.equal(g.puddles[i].y + g.puddles[j].y, 720);
      assert.equal(g.taps[i].x + g.taps[j].x, 1200);
      assert.equal(g.taps[i].y + g.taps[j].y, 720);
    }
    for (const p of g.puddles) {
      const full = { ...p, water: p.capacity }, outline = puddleOutline(full), t = g.taps.find(t => t.puddleId === p.id);
      assert.ok(!insidePuddle(t, full), 'pump position must stay dry at full capacity');
      assert.ok(g.clearPath(t, p), 'water flow must not cross a wall');
      for (const o of g.obstacles) {
        assert.ok(!outline.some((v, i) => segmentRect(v, outline[(i + 1) % outline.length], o) !== null),
          `wall overlaps ${p.id}`);
      }
      assert.ok(outline.every(v => v.x > 28 && v.x < 1172 && v.y > 28 && v.y < 692), 'water stays inside arena');
    }
  });
  test(`${stage.id}: full round has finite positions, water conservation and no wall entry`, () => {
    for (const seed of [4, 17]) {
      const g = new Game(seed, stage.id);
      g.start();
      for (let i = 0; i < 5500 && g.state === 'playing'; i++) {
        g.update(1 / 60, {});
        if (i % 60 === 0) for (const a of g.actors) {
          assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && g.validPosition(a.x, a.y), `${stage.id} actor ${a.id}`);
        }
      }
      assert.equal(g.state, 'ended');
      const total = accountedWater(g);
      assert.ok(Math.abs(total - g.initialTotalWater) < .001);
      g.reset();
      assert.equal(g.stage.id, stage.id);
      assert.equal(g.time, 0);
    }
  });
}
test('multiple games keep independent walls, navigation and ray endpoints after stage switches', () => {
  const a = new Game(1, 'tutorial'), b = new Game(1, 'waterside');
  const p = { x: 250, y: 250, obstacles: a.obstacles };
  const before = longRayEnd(p, 0);
  b.reset(2, 'reservoir');
  assert.deepEqual(longRayEnd(p, 0), before);
  assert.notDeepEqual(a.obstacles, b.obstacles);
  assert.equal(a.stage.id, 'tutorial');
});
test('tutorial naturally refills the forward path and gives the opening exchange breathing room', () => {
  const g = new Game(4, 'tutorial');
  g.start();
  let touched = false;
  for (let i = 0; i < 120; i++) {
    g.update(1 / 60, { x: 1 });
    touched ||= insidePuddle(g.actors[0], g.puddles[0]);
  }
  assert.ok(touched);
  assert.ok(g.actors[0].water > 50);
  assert.ok(g.actors.slice(3).every(a => a.stats.shots === 0));
  assert.ok(AI_LEVELS[0].reaction > AI_LEVELS[3].reaction);
  assert.ok(AI_LEVELS[0].rest > AI_LEVELS[3].rest);
});
test('stage difficulty changes tactics and reaction without changing actor or weapon power', () => {
  for (const stage of STAGES) {
    const g = new Game(4, stage.id);
    assert.equal(g.aiProfile, AI_LEVELS[stage.difficulty]);
    assert.ok(g.actors.every(a => a.hp === 100 && a.water === 50));
  }
});
test('terrain identities separate safe supply, diagonal circulation and contested central supply', () => {
  const easy = new Game(1, 'waterside'), medium = new Game(1, 'alleys'), hard = new Game(1, 'reservoir');
  assert.ok(easy.puddles[2].x < 300 && easy.puddles[3].x > 900);
  assert.ok(easy.puddles.slice(0, 2).every(p => p.x === 600));
  const diagonal = [medium.puddles[0], medium.puddles[2], medium.puddles[3], medium.puddles[1]];
  for (let i = 1; i < diagonal.length; i++) {
    assert.ok(diagonal[i].x > diagonal[i - 1].x && diagonal[i].y > diagonal[i - 1].y);
  }
  for (const p of hard.puddles.slice(2)) {
    assert.equal(p.x, ZONE.x);
    assert.ok(distance(p, ZONE) < 200);
    assert.ok(puddleOutline({ ...p, water: p.capacity }).every(v => distance(v, ZONE) > ZONE.r + CONFIG.radius),
      'capture and large-pool refill must be separate');
  }
});
