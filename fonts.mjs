/* Makes the bundled web fonts in src/fonts/: the four OFL fonts the game and the manual use, each cut down to the
 * characters that appear in src/ (the full Japanese fonts are about 17 MB together).
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
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const SRC = new URL('./src/', import.meta.url);
const OUT = new URL('./src/fonts/', import.meta.url);

// name: the file names' stem (<name>-<part>.woff2)
export const FACES = [
  { family: 'DotGothic16', weight: 400, name: 'DotGothic16-Regular', license: 'DotGothic16-OFL.txt' },
  { family: 'BIZ UDPGothic', weight: 400, name: 'BIZUDPGothic-Regular', license: 'BIZUDPGothic-OFL.txt' },
  { family: 'BIZ UDPGothic', weight: 700, name: 'BIZUDPGothic-Bold', license: 'BIZUDPGothic-OFL.txt' },
  { family: 'Dela Gothic One', weight: 400, name: 'DelaGothicOne-Regular', license: 'DelaGothicOne-OFL.txt' },
  { family: 'M PLUS Rounded 1c', weight: 800, name: 'MPLUSRounded1c-ExtraBold', license: 'MPLUSRounded1c-OFL.txt' },
];

// always in, used or not: printable ASCII, CJK symbols and punctuation, hiragana, katakana, fullwidth ASCII
const RANGES = [[0x20, 0x7E], [0x3000, 0x303F], [0x3041, 0x3096], [0x309B, 0x309E], [0x30A0, 0x30FF], [0xFF01, 0xFF5E]];
// every face must come back with these (all four fonts have them): a subset without them is a broken download
export const MUST_HAVE = [[0x21, 0x7E], [0x3042, 0x3093], [0x30A2, 0x30F3]];

// the text files of src/ outside src/fonts/, as paths relative to src/ with "/"
async function textFiles() {
  return (await readdir(SRC, { recursive: true }))
    .map(p => p.split('\\').join('/'))
    .filter(p => /\.(?:html|css|js|mjs)$/.test(p) && !p.startsWith('fonts/'))
    .sort();
}

// RANGES plus every character of those files (no control characters, no BOM), sorted by code point
export async function usedChars() {
  const set = new Set();
  for (const [a, b] of RANGES) for (let c = a; c <= b; c++) set.add(c);
  for (const name of await textFiles()) {
    for (const ch of await readFile(new URL(name, SRC), 'utf8')) {
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
// the API picks the font format by browser: ask as one that takes WOFF2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
async function get(url, as) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
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
    for (const [a, b] of MUST_HAVE) {
      for (let c = a; c <= b; c++) if (!covered.has(c)) throw new Error(`fonts: ${face.name} came back without U+${c.toString(16)} (an incomplete subset)`);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
