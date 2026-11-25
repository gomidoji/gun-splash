// The bundled fonts (src/fonts/, made by fonts.mjs): they cover every character src/ shows, each face's files are
// real subsets, every font has its license text, and the pages load nothing from the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { FACES, mustHave, usedChars, woff2Chars } from '../fonts.mjs';

const FONTS = new URL('../src/fonts/', import.meta.url);
const text = name => readFile(new URL(name, FONTS), 'utf8');

test('the font subsets were made for every character used in src/', async () => {
  const made = new Set((await text('chars.txt')).replace(/\n$/, ''));
  const missing = [...await usedChars()].filter(c => !made.has(c));
  assert.deepEqual(missing, [], 'new characters in src/: run `npm run fonts`');
});

test('fonts.css serves every face from WOFF2 subsets that hold its characters', async () => {
  const css = await text('fonts.css');
  const rules = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, r]) => ({
    family: /font-family:\s*"([^"]+)"/.exec(r)[1], weight: +/font-weight:\s*(\d+)/.exec(r)[1],
    file: /src:\s*url\(([\w.-]+\.woff2)\)/.exec(r)[1], range: /unicode-range:\s*([^;]+);/.exec(r)[1],
  }));
  const used = new Set(), asked = mustHave((await text('chars.txt')).replace(/\n$/, ''));
  for (const face of FACES) {
    const mine = rules.filter(r => r.family === face.family && r.weight === face.weight);
    assert.ok(mine.length, `${face.family} ${face.weight} in fonts.css`);
    const has = new Set();
    for (const r of mine) {
      used.add(r.file);
      for (const c of woff2Chars(await readFile(new URL(r.file, FONTS)))) has.add(c);
    }
    for (const c of asked) assert.ok(has.has(c), `${face.name} has U+${c.toString(16)}`);   // ASCII and kana asked for
  }
  assert.equal(rules.length, used.size, 'one rule per file');
  const files = (await readdir(FONTS)).filter(f => f.endsWith('.woff2')).sort();
  assert.deepEqual(files, [...used].sort(), 'every .woff2 in src/fonts/ is in fonts.css, and the other way round');
});

test('every bundled font comes with its OFL license text', async () => {
  for (const face of FACES) {
    const license = await text(face.license);
    assert.match(license, /^Copyright /, face.license);
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/, face.license);
  }
});

test('the pages use the bundled fonts and load nothing from the network', async () => {
  for (const page of ['index.html', 'manual.html']) {
    const html = await readFile(new URL('../src/' + page, import.meta.url), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="(?:\.\/)?fonts\/fonts\.css">/, page);
    assert.doesNotMatch(html, /\s(?:src|href)="(?:https?:)?\/\//, page);
  }
  for (const sheet of ['style.css', 'manual.css', 'fonts/fonts.css']) {
    assert.doesNotMatch(await readFile(new URL('../src/' + sheet, import.meta.url), 'utf8'), /url\(\s*["']?(?:https?:)?\/\//, sheet);
  }
});
