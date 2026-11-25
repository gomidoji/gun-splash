/* Makes the bundled web fonts in src/fonts/: the four OFL fonts the game and the manual use, each cut down to the
 * characters src/ can show: those of its text with the comments stripped (strip.mjs), plus printable ASCII. (The full
 * Japanese fonts are about 17 MB together.)
 *
 *   npm run fonts
 *
 * Needs the network. Run it again after adding text with characters the subsets do not have yet
 * (tests/fonts.test.mjs fails until then). The subsets come from the Google Fonts API (css2 with text=…), which
 * serves these same fonts as WOFF2 trimmed to the requested characters. It takes about 5 KB of text= per request
 * (more, and it silently returns a near-empty font), so each face is fetched in parts, and fonts.css gives every
 * part its unicode-range: the browser puts the parts of a face back together, character by character.
 *
 * Writes src/fonts/*.woff2, src/fonts/fonts.css (the @font-face rules) and src/fonts/chars.txt (the characters the
 * subsets were made for), and deletes *.woff2 there that it no longer makes. The license texts next to them
 * (*-OFL.txt) are not touched.
 *
 * Also writes src/js/j16-atlas.js: the ROM text's DotGothic16 glyphs as 1-bit dots on the font's 16-dot grid, read
 * from the outlines of a TrueType subset (see romAtlas below). js/core.js draws ROM text from it instead of rendering
 * the font into a canvas and reading the pixels back, which Safari 26 blurs with anti-fingerprinting noise.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { stripCss, stripHtml, stripJs } from './strip.mjs';

const SRC = new URL('./src/', import.meta.url);
const OUT = new URL('./src/fonts/', import.meta.url);
export const ATLAS_FILE = 'js/j16-atlas.js';   // in src/

// name: the file names' stem (<name>-<part>.woff2)
export const FACES = [
  { family: 'DotGothic16', weight: 400, name: 'DotGothic16-Regular', license: 'DotGothic16-OFL.txt' },
  { family: 'BIZ UDPGothic', weight: 400, name: 'BIZUDPGothic-Regular', license: 'BIZUDPGothic-OFL.txt' },
  { family: 'BIZ UDPGothic', weight: 700, name: 'BIZUDPGothic-Bold', license: 'BIZUDPGothic-OFL.txt' },
  { family: 'Dela Gothic One', weight: 400, name: 'DelaGothicOne-Regular', license: 'DelaGothicOne-OFL.txt' },
  { family: 'M PLUS Rounded 1c', weight: 800, name: 'MPLUSRounded1c-ExtraBold', license: 'MPLUSRounded1c-OFL.txt' },
];

// always in, used or not: printable ASCII (cheap, and what people type into the manual's MEMO page)
const RANGES = [[0x20, 0x7E]];
// all four fonts have these: a face that comes back without one it was asked for is a broken download
const MUST_HAVE = [[0x21, 0x7E], [0x3041, 0x3093], [0x30A1, 0x30F6]];
// the code points of `text` in MUST_HAVE
export const mustHave = text => [...text].map(c => c.codePointAt(0)).filter(c => MUST_HAVE.some(([a, b]) => c >= a && c <= b));

// the text files of src/ outside src/fonts/, as paths relative to src/ with "/"
async function textFiles() {
  return (await readdir(SRC, { recursive: true }))
    .map(p => p.split('\\').join('/'))
    .filter(p => /\.(?:html|css|js|mjs)$/.test(p) && !p.startsWith('fonts/') && p !== ATLAS_FILE)
    .sort();
}

// RANGES plus every character of those files once their comments are stripped (no control characters, no BOM),
// sorted by code point
const STRIP = { html: stripHtml, css: stripCss, js: stripJs, mjs: stripJs };
export async function usedChars() {
  const set = new Set();
  for (const [a, b] of RANGES) for (let c = a; c <= b; c++) set.add(c);
  for (const name of await textFiles()) {
    const text = STRIP[name.split('.').pop()](await readFile(new URL(name, SRC), 'utf8'));
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c >= 0x20 && !(c >= 0x7F && c < 0xA0) && c !== 0xFEFF) set.add(c);
    }
  }
  return String.fromCodePoint(...[...set].sort((a, b) => a - b));
}

// ---- what a WOFF2 holds: the characters its cmap maps to a glyph --------------------------------------
function uintBase128(buf, at) {
  let v = 0;
  for (let i = 0; i < 5; i++) { const b = buf[at.p++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; }
  throw new Error('WOFF2: bad UIntBase128');
}
// the code points of a WOFF2 font's cmap (format 4 and 12 subtables)
export function woff2Chars(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const at = { p: 48 };
  let offset = 0, cmap = null;
  for (let i = buf.readUInt16BE(12); i > 0; i--) {   // table directory; the tables follow each other in one stream
    const flags = buf[at.p++], index = flags & 0x3f, version = flags >> 6;
    if (index === 0x3f) at.p += 4;   // a tag outside the known-tags list
    const origLength = uintBase128(buf, at);
    const transformed = index === 10 || index === 11 ? version !== 3 : version !== 0;   // glyf, loca: 0 = transformed
    const length = transformed ? uintBase128(buf, at) : origLength;
    if (index === 0) cmap = [offset, length];   // known tag 0 is 'cmap'
    offset += length;
  }
  if (!cmap) throw new Error('WOFF2: no cmap');
  const data = brotliDecompressSync(buf.subarray(at.p, at.p + buf.readUInt32BE(20)));
  const t = data.subarray(cmap[0], cmap[0] + cmap[1]), chars = new Set();
  for (let i = 0; i < t.readUInt16BE(2); i++) {
    const off = t.readUInt32BE(8 + i * 8), format = t.readUInt16BE(off);
    if (format === 4) {
      const segX2 = t.readUInt16BE(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const start = t.readUInt16BE(starts + s), end = t.readUInt16BE(ends + s), delta = t.readInt16BE(deltas + s), ro = t.readUInt16BE(ranges + s);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          const g = ro ? t.readUInt16BE(ranges + s + ro + (c - start) * 2) : 1;   // glyph 0 = .notdef = not mapped
          if (ro ? g !== 0 : ((c + delta) & 0xFFFF) !== 0) chars.add(c);
        }
      }
    } else if (format === 12) {
      for (let k = 0, n = t.readUInt32BE(off + 12); k < n; k++) {
        const g = off + 16 + k * 12;
        for (let c = t.readUInt32BE(g), end = t.readUInt32BE(g + 4); c <= end; c++) chars.add(c);
      }
    }
  }
  return chars;
}

// ---- fetching -------------------------------------------------------------------------------------------
// the API picks the font format by browser: ask as one that takes WOFF2 (or, for the outlines, as a plain client:
// TrueType)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_TTF = 'fonts.mjs';
async function get(url, as, ua = UA) {
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`fonts: HTTP ${res.status} for ${url.slice(0, 120)}…`);
  return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}
// the characters in parts of at most MAX_PARAM bytes of text= (URL-encoded)
const MAX_PARAM = 3000;
function parts(text) {
  const out = [''];
  let size = 0;
  for (const ch of text) {
    const n = encodeURIComponent(ch).length;
    if (size + n > MAX_PARAM) { out.push(''); size = 0; }
    out[out.length - 1] += ch; size += n;
  }
  return out;
}
async function subset(face, text) {
  const family = encodeURIComponent(face.family).replace(/%20/g, '+');
  const css = await get(`https://fonts.googleapis.com/css2?family=${family}:wght@${face.weight}&text=${encodeURIComponent(text)}`, 'text');
  const m = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)\s*format\(['"]woff2['"]\)/.exec(css);
  if (!m) throw new Error(`fonts: no WOFF2 for ${face.family} ${face.weight} in:\n${css}`);
  return get(m[1]);
}
// "U+20-7E, U+3042, …": the code points (sorted) as CSS unicode-range
function unicodeRange(cps) {
  const hex = c => c.toString(16).toUpperCase(), out = [];
  for (let i = 0; i < cps.length;) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    out.push('U+' + hex(cps[i]) + (j > i ? '-' + hex(cps[j]) : ''));
    i = j + 1;
  }
  return out.join(', ');
}

// ---- the ROM glyph atlas (src/js/j16-atlas.js) --------------------------------------------------------
// The ROM (js/core.js GS.text16) draws DotGothic16 on its 16-dot grid: 16 rows, 16 columns (8 for ASCII and half-width
// kana). The font draws each dot half a cell off the em grid, so a point a quarter cell into each grid cell is inside
// the dot whenever the dot is there; that gives exactly the dots the 16px rendering showed (rows from the typo ascender).

// TrueType: the code point -> glyph map, and each glyph's outline as closed polygons (a dot font has no curves)
export function parseTtf(buf) {
  const t = {};
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) { const r = 12 + i * 16; t[buf.toString('latin1', r, r + 4)] = buf.readUInt32BE(r + 8); }
  for (const tag of ['cmap', 'glyf', 'head', 'loca', 'OS/2']) if (t[tag] === undefined) throw new Error('TrueType: no ' + tag);
  const upm = buf.readUInt16BE(t.head + 18), longLoca = buf.readInt16BE(t.head + 50) === 1;
  const ascender = buf.readInt16BE(t['OS/2'] + 68);   // sTypoAscender: the top of the em box
  const loca = g => longLoca ? buf.readUInt32BE(t.loca + g * 4) : buf.readUInt16BE(t.loca + g * 2) * 2;
  const cmap = new Map();
  for (let i = 0, n = buf.readUInt16BE(t.cmap + 2); i < n; i++) {
    const off = t.cmap + buf.readUInt32BE(t.cmap + 8 + i * 8), format = buf.readUInt16BE(off);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const start = buf.readUInt16BE(starts + s), end = buf.readUInt16BE(ends + s), delta = buf.readInt16BE(deltas + s), ro = buf.readUInt16BE(ranges + s);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g = ro ? buf.readUInt16BE(ranges + s + ro + (c - start) * 2) : c;
          if (g) g = (g + delta) & 0xFFFF;
          if (g) cmap.set(c, g);
        }
      }
    } else if (format === 12) {
      for (let k = 0, n2 = buf.readUInt32BE(off + 12); k < n2; k++) {
        const r = off + 16 + k * 12, first = buf.readUInt32BE(r), last = buf.readUInt32BE(r + 4), g0 = buf.readUInt32BE(r + 8);
        for (let c = first; c <= last; c++) cmap.set(c, g0 + c - first);
      }
    }
  }
  function outline(g) {
    const a = loca(g);
    if (a === loca(g + 1)) return [];
    const p = t.glyf + a, contours = buf.readInt16BE(p);
    if (contours < 0) {   // a composite glyph: its components, moved by their x/y offsets
      const out = [];
      let q = p + 10, flags;
      do {
        flags = buf.readUInt16BE(q); const part = buf.readUInt16BE(q + 2); q += 4;
        const dx = flags & 1 ? buf.readInt16BE(q) : buf.readInt8(q), dy = flags & 1 ? buf.readInt16BE(q + 2) : buf.readInt8(q + 1);
        q += flags & 1 ? 4 : 2;
        if (!(flags & 2) || flags & 0xC8) throw new Error(`TrueType: glyph ${g} has a matched or scaled component`);
        for (const poly of outline(part)) out.push(poly.map(([x, y]) => [x + dx, y + dy]));
      } while (flags & 0x20);
      return out;
    }
    const ends = [];
    for (let k = 0; k < contours; k++) ends.push(buf.readUInt16BE(p + 10 + k * 2));
    const points = contours ? ends[contours - 1] + 1 : 0;
    let q = p + 12 + contours * 2 + buf.readUInt16BE(p + 10 + contours * 2);
    const fl = [];
    while (fl.length < points) { const f = buf[q++]; fl.push(f); if (f & 8) for (let r = buf[q++]; r > 0; r--) fl.push(f); }
    const coords = (short, same) => {
      let v = 0;
      return fl.map(f => {
        if (f & short) { const d = buf[q++]; v += f & same ? d : -d; } else if (!(f & same)) { v += buf.readInt16BE(q); q += 2; }
        return v;
      });
    };
    const X = coords(2, 16), Y = coords(4, 32);
    if (fl.some(f => !(f & 1))) throw new Error(`TrueType: glyph ${g} has curves`);
    const out = [];
    for (let k = 0, s = 0; k < contours; s = ends[k] + 1, k++) {
      const poly = [];
      for (let i = s; i <= ends[k]; i++) poly.push([X[i], Y[i]]);
      out.push(poly);
    }
    return out;
  }
  return { upm, ascender, cmap, outline };
}
// whether (x, y) is inside the polygons (nonzero winding, as TrueType fills)
function inside(polys, x, y) {
  let w = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
      if (y1 <= y) { if (y2 > y && side > 0) w++; } else if (y2 <= y && side < 0) w--;
    }
  }
  return w !== 0;
}
// ROM columns per character (js/core.js jAdv): 8 for ASCII and half-width kana, else 16
export const romWidth = ch => { const c = ch.codePointAt(0); return c < 0x80 || (c >= 0xFF61 && c <= 0xFF9F) ? 8 : 16; };
// the characters of `text` the ROM can show: all but spaces and the kanji outside js/core.js's KANJI whitelist
export async function romChars(text) {
  const m = /const KANJI = '([^']+)'/.exec(await readFile(new URL('js/core.js', SRC), 'utf8'));
  if (!m) throw new Error('fonts: no KANJI whitelist in src/js/core.js');
  return [...text].filter(ch => ch !== ' ' && ch !== '\u3000' && (!/[\u3400-\u9fff\uf900-\ufaff]/.test(ch) || m[1].includes(ch))).join('');
}
// { chars, data }: the glyphs of `chars` that DotGothic16 has, each as 16 rows of romWidth bits (left bit first)
async function romAtlas(text) {
  const glyphs = new Map();
  for (const part of parts(text)) {
    const css = await get(`https://fonts.googleapis.com/css2?family=DotGothic16&text=${encodeURIComponent(part)}`, 'text', UA_TTF);
    const m = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)\s*format\(['"]truetype['"]\)/.exec(css);
    if (!m) throw new Error(`fonts: no TrueType DotGothic16 in:\n${css}`);
    const ttf = await get(m[1], 'buffer', UA_TTF);
    if (ttf.readUInt32BE(0) !== 0x10000) throw new Error('fonts: the DotGothic16 outline font is not TrueType');
    const font = parseTtf(ttf), cell = font.upm / 16;
    for (const ch of part) {
      const g = font.cmap.get(ch.codePointAt(0));
      if (!g) continue;
      const polys = font.outline(g), w = romWidth(ch), rows = Buffer.alloc(16 * w / 8);
      for (let r = 0; r < 16; r++) {
        for (let c = 0; c < w; c++) {
          if (inside(polys, (c + 0.25) * cell, font.ascender - (r + 0.25) * cell)) rows[(r * w + c) >> 3] |= 0x80 >> (c & 7);
        }
      }
      glyphs.set(ch, rows);
    }
  }
  const chars = [...glyphs.keys()].join('');
  return { chars, data: Buffer.concat([...glyphs.values()]).toString('base64') };
}

async function main() {
  const text = await usedChars(), chunks = parts(text);
  await mkdir(OUT, { recursive: true });
  const rules = [], files = new Set();
  let total = 0;
  for (const face of FACES) {
    const covered = new Set();
    for (let i = 0; i < chunks.length; i++) {
      const data = await subset(face, chunks[i]), has = woff2Chars(data);
      // this file serves the characters it was asked for and has (a character no part has falls back in CSS)
      const mine = [...chunks[i]].map(c => c.codePointAt(0)).filter(c => has.has(c));
      if (!mine.length) continue;
      const file = `${face.name}-${i + 1}.woff2`;
      await writeFile(new URL(file, OUT), data);
      files.add(file); total += data.length;
      mine.forEach(c => covered.add(c));
      rules.push(`@font-face { font-family: "${face.family}"; font-style: normal; font-weight: ${face.weight}; font-display: swap;\n` +
        `  src: url(${file}) format("woff2");\n  unicode-range: ${unicodeRange(mine)}; }`);
    }
    for (const c of mustHave(text)) {
      if (!covered.has(c)) throw new Error(`fonts: ${face.name} came back without U+${c.toString(16)} (an incomplete subset)`);
    }
    const lacks = [...text].filter(c => !covered.has(c.codePointAt(0)));
    console.log(`${face.name}: ${covered.size} characters` + (lacks.length ? `; not in the font: ${lacks.length}` : ''));
  }
  for (const f of await readdir(OUT)) if (f.endsWith('.woff2') && !files.has(f)) await rm(new URL(f, OUT));
  await writeFile(new URL('fonts.css', OUT),
    '/* Generated by fonts.mjs (npm run fonts); do not edit by hand. The bundled fonts, cut down to the characters\n' +
    '   in chars.txt. All under the SIL Open Font License 1.1: see the *-OFL.txt files in this folder. */\n' +
    rules.join('\n') + '\n', 'utf8');
  await writeFile(new URL('chars.txt', OUT), text + '\n', 'utf8');
  console.log(`fonts: ${[...text].length} characters, ${files.size} files, ${Math.round(total / 1024)} KB in src/fonts/`);

  const atlas = await romAtlas(await romChars(text));
  await writeFile(new URL(ATLAS_FILE, SRC),
    '/* Generated by fonts.mjs (npm run fonts); do not edit by hand. The ROM text\'s glyphs of DotGothic16 (SIL Open Font\n' +
    ' * License 1.1, see src/fonts/DotGothic16-OFL.txt) as 1-bit dots on its 16-dot grid, read from the font\'s outlines:\n' +
    ' * per character of `chars`, 16 rows of 16 bits (8 for ASCII and half-width kana), left bit first, in `data`\n' +
    ' * (base64). js/core.js draws ROM text from these, so no canvas is read back for it. */\n' +
    `(window.GS = window.GS || {}).J16_ATLAS = {\n  chars: ${JSON.stringify(atlas.chars)},\n  data: ${JSON.stringify(atlas.data)},\n};\n`, 'utf8');
  console.log(`fonts: ${ATLAS_FILE}, ${[...atlas.chars].length} ROM glyphs`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
