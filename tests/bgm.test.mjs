// BGM data and the MML parser (src/js/bgm.js + src/js/bgm-tracks.js, classic scripts run in a sandbox).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const GS = { state: { sound: 0, bgm: true }, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), warnOnce() {}, current: { id: null, state: null } };
  const sandbox = { window: { GS }, console, setInterval, clearInterval, setTimeout };
  for (const f of ['bgm.js', 'bgm-tracks.js']) {
    vm.runInNewContext(readFileSync(new URL('../src/js/' + f, import.meta.url), 'utf8'), sandbox, { filename: f });
  }
  return GS.bgm;
}
const bgm = load();
const TPQ = bgm.TPQ;
// values made in the sandbox have the sandbox's Array.prototype, which deepStrictEqual tells apart: copy them out
const plain = x => JSON.parse(JSON.stringify(x));

test('MML: lengths, dots, ties, rests and octaves', () => {
  const r = bgm.parse('@lead o4 l8 c c4 c4. r16 c16^8 > c < c', { name: 't' });
  assert.deepEqual(plain(r.errors), []);
  assert.deepEqual(plain(r.ev.map(e => [e.t, e.d, e.n])), [[0, 24, 60], [24, 48, 60], [72, 72, 60], [156, 36, 60], [192, 24, 72], [216, 24, 60]]);
  assert.equal(r.len, 240);
});

test('MML: accidentals, transpose, chords and triplets', () => {
  const r = bgm.parse('@pad o4 c+4 e-4 k2 d4 k0 {c e g >c}2 l12 c d e', { name: 't' });
  assert.deepEqual(plain(r.errors), []);
  assert.deepEqual(plain(r.ev.slice(0, 3).map(e => e.n)), [61, 63, 64]);
  const chord = r.ev.filter(e => e.t === 144);
  assert.deepEqual(plain(chord.map(e => [e.n, e.d])), [[60, 96], [64, 96], [67, 96], [72, 96]]);
  assert.deepEqual(plain(r.ev.slice(-3).map(e => [e.t, e.d])), [[240, 16], [256, 16], [272, 16]]);
});

test('MML: repeats with a first / second ending, loop point and bar checks', () => {
  const r = bgm.parse('@lead o4 l4 c d e f | L [g g g g | : a a a a |]2 b1 |', { name: 't' });
  assert.deepEqual(plain(r.errors), []);
  assert.equal(r.loopAt, 4 * TPQ);
  assert.deepEqual(plain(r.ev.slice(4).map(e => e.n)), [67, 67, 67, 67, 69, 69, 69, 69, 67, 67, 67, 67, 71]);
  assert.equal(r.len, 5 * 4 * TPQ);
  const bad = bgm.parse('@lead o4 l4 c d e | f g |', { name: 'bad' });
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /bar line 144 ticks into bar 1/);
});

test('MML: drum letters only on the kit, unknown things are errors', () => {
  const d = bgm.parse('@drums l8 b h s h j y m n | x z r4 r2 |', { name: 'd' });
  assert.deepEqual(plain(d.errors), []);
  assert.deepEqual(plain(d.ev.map(e => e.dr)), ['kick', 'hat', 'snare', 'hat', 'ohat', 'crash', 'tomh', 'toml', 'clap', 'rim']);
  assert.ok(bgm.parse('@nosuch c', { name: 'x' }).errors.some(e => /unknown instrument/.test(e)));
  assert.ok(bgm.parse('@lead c3. w', { name: 'x' }).errors.some(e => /unexpected "w"/.test(e)));
  assert.ok(bgm.parse('@lead c5', { name: 'x' }).errors.some(e => /bad length 5/.test(e)));
  assert.ok(bgm.parse('c4', { name: 'x' }).errors.some(e => /no instrument/.test(e)));
});

test('the four tracks of the sound test: BGM 01-04 in order, ROM-printable names', () => {
  const tr = bgm.tracks();
  assert.deepEqual(plain(tr.map(t => [t.no, t.id])), [[1, 'title'], [2, 'select'], [3, 'battle'], [4, 'result']]);
  tr.forEach(t => {
    assert.ok(t.name.length >= 2 && t.name.length <= 6, t.id + ' name length');
    assert.match(t.name, /^[ぁ-ゖァ-ヺー]+$/, t.id + ' name is kana (J16)');
  });
});

test('every track: no MML errors, equal channel lengths and loop points, whole bars, 8 channels at most', () => {
  for (const t of bgm.tracks()) {
    const r = bgm.lint(t);
    assert.deepEqual(plain(r.errors), [], t.id);
    assert.ok(Number.isInteger(r.bars) && r.bars >= 8, t.id + ' bars ' + r.bars);
    assert.ok(t.ch.length <= 8, t.id + ' channels');
  }
});

test('every track: notes inside the instruments\' ranges, 8 voices at most, a loop of 20-70 s', () => {
  for (const t of bgm.tracks()) {
    const r = bgm.lint(t);
    assert.deepEqual(plain(r.warnings), [], t.id);
    assert.ok(r.voices <= 8, t.id + ' voices ' + r.voices);
    assert.ok(r.loopSeconds >= 20 && r.loopSeconds <= 70, t.id + ' loop ' + r.loopSeconds.toFixed(1) + ' s');
  }
});
