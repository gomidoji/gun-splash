import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, OBSTACLES, CONFIG, ZONE, clearPath, distance } from '../src/game.mjs';

test('cover layout is rotationally fair and keeps pumps and spawns clear', () => {
  const g = new Game();
  for (const o of OBSTACLES) {
    assert.ok(OBSTACLES.some(p => p.x === CONFIG.width - o.x - o.w && p.y === CONFIG.height - o.y - o.h
      && p.w === o.w && p.h === o.h));
  }
  for (const p of [...g.actors, ...g.taps]) assert.ok(clearPath(p, p, CONFIG.radius + 8));
});

test('body-width routes connect both spawns, every pump, pool center and objective', () => {
  // Flood fill on a 10 px grid from beside the blue spawn; every step must leave room for a body.
  const g = new Game(), step = 10, start = { x: 110, y: 360 }, queue = [start], seen = new Set(['110,360']);
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const p = { x: queue[i].x + dx, y: queue[i].y + dy }, key = `${p.x},${p.y}`;
    if (p.x < 50 || p.x > 1150 || p.y < 50 || p.y > 670 || seen.has(key)
      || !clearPath(queue[i], p, CONFIG.radius + 2)) continue;
    seen.add(key);
    queue.push(p);
  }
  for (const target of [...g.actors, ...g.taps, ...g.puddles, ZONE]) {
    assert.ok(queue.some(p => distance(p, target) < 15 && clearPath(p, target, CONFIG.radius + 2)),
      `unreachable ${target.id ?? 'zone'}`);
  }
});
