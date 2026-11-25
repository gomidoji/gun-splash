import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ZONE, distance, insidePuddle } from '../src/game.mjs';

const dt = 1 / 60;
// a's supply plan, given the known threats and allies.
function supply(g, a, threats = [], allies = []) {
  return g.supplyPlan(a, threats, allies, g.terrainPaths(a, threats, allies));
}
test('opening supply adapts to each map and enters the real shoreline on a safe side', () => {
  for (const [id, source] of [['tutorial', 'home-blue'], ['waterside', 'north'], ['alleys', 'home-blue'],
    ['reservoir', 'home-blue']]) {
    const g = new Game(1, id), a = g.actors[1];
    a.water = 10;
    const plan = supply(g, a);
    assert.equal(plan.source.id, source);
    assert.ok(insidePuddle(plan.point, plan.source));
    assert.ok(distance(plan.point, plan.source) > 10);
    let last = a;
    for (const p of plan.route.points) {
      assert.ok(g.clearPath(last, p, 13.75));
      last = p;
    }
  }
});
test('visible threat and exhausted supplies change the source instead of forcing the nearest water', () => {
  const g = new Game(1, 'reservoir'), a = g.actors[1];
  Object.assign(a, { x: 230, y: 360, water: 10 });
  assert.equal(supply(g, a).source.id, 'home-blue');
  const threatened = supply(g, a, [{ id: 9, x: 230, y: 360 }]);
  assert.notEqual(threatened?.source.id, 'home-blue');
  g.puddles[0].water = 0;
  g.taps[0].water = 0;
  assert.notEqual(supply(g, a).source.id, 'home-blue');
});
test('water demand reservations spread suppliers and human pump work is not duplicated', () => {
  const g = new Game(1, 'waterside'), a = g.actors[1], b = g.actors[2];
  a.water = 10;
  const first = supply(g, a);
  first.source.water = 25;
  b.water = 0;
  b.ai.refill = true;
  b.ai.goal = first.source;
  assert.notEqual(supply(g, a, [], [b]).source.id, first.source.id);
  for (const p of g.puddles) p.water = 0;
  const human = g.actors[0];
  human.tapId = g.taps[0].id;
  assert.notEqual(supply(g, a, [], [human]).source.id, human.tapId);
});
test('known fire lanes cause a detour whose every segment remains body-passable', () => {
  const g = new Game(1, 'alleys'), a = g.actors[1];
  Object.assign(a, { x: 260, y: 400, water: 90 });
  const target = { x: 900, y: 360 }, plain = g.terrainPaths(a, [], []).to(target),
    safe = g.terrainPaths(a, [{ id: 9, x: 600, y: 360 }], []).to(target);
  assert.notDeepEqual(safe.points, plain.points);
  assert.ok(safe.length < plain.length + 300);
  let last = a;
  for (const p of safe.points) {
    assert.ok(g.clearPath(last, p, 13.75));
    last = p;
  }
});
test('advanced teams share expiring sightings rather than tracking hidden positions', () => {
  const g = new Game(1, 'reservoir'), a = g.actors[1], b = g.actors[2], enemy = g.actors[3];
  const observed = { x: enemy.x, y: enemy.y };
  g.knownThreats(a, [enemy], []);
  enemy.x = 100;
  const shared = g.knownThreats(b, [], []);
  assert.equal(shared[0].x, observed.x);
  g.time += 2.1;
  assert.deepEqual(g.knownThreats(b, [], []), []);
  const easy = new Game(1, 'waterside');
  easy.knownThreats(easy.actors[1], [easy.actors[3]], []);
  assert.deepEqual(easy.knownThreats(easy.actors[2], [], []), []);
});
test('support guards a central supplier from a separate position while anchor stays in the zone', () => {
  const g = new Game(1, 'reservoir'), a = g.actors[1], worker = g.actors[2];
  Object.assign(a, { x: 500, y: 260, water: 100 });
  worker.ai.refill = true;
  worker.ai.goal = g.puddles[2];
  worker.water = 10;
  const paths = g.terrainPaths(a, [], [worker]);
  const goal = g.terrainObjective(a, [], [worker], g.actors[0], paths, { id: 'zone', ...ZONE });
  assert.equal(goal.id, 'escort');
  assert.ok(distance(goal, worker.ai.goal) > 65);
  assert.equal(g.terrainObjective(a, [], [worker], a, paths, { id: 'zone', ...ZONE }).id, 'zone');
});
test('approach plans are bounded, retain routes between decisions, and yield to urgent capture', () => {
  const g = new Game(1, 'waterside'), a = g.actors[1];
  for (const b of g.actors.filter(b => b.team !== a.team)) b.alive = false;
  g.start();
  g.botControl(a, dt);
  const route = a.ai.route;
  for (let i = 0; i < 5; i++) g.botControl(a, dt);
  assert.equal(a.ai.route, route);
  g.scores[1] = 25;
  g.botControl(a, dt);
  assert.equal(a.ai.goal.id, 'zone');
  assert.equal(a.ai.refill, false);
  a.ai.approach = { id: 'water-route', x: 200, y: 100, until: 0 };
  g.time = 1;
  const goal = g.terrainObjective(a, [], [], g.actors[0], g.terrainPaths(a, [], []), { id: 'zone', ...ZONE });
  assert.equal(goal.id, 'zone');
});
