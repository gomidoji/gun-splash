/* Builds play.html: ガン・スプラッシュ 復刻版 as ONE self-contained file (works from file://, no server).
 *
 *   node standalone.mjs
 *
 * Source: src/index.html and everything it loads. The transformation:
 *  - <link rel="stylesheet" href="./fonts/fonts.css"> -> <style data-gs-src="fonts/fonts.css">…</style> with each
 *    url(X.woff2) as a data: URL (base64), and the fonts' license texts (fonts/*-OFL.txt) in a comment. The fonts
 *    are in the file once: js/shell.js copies this element's text into the embedded manual.
 *  - <link rel="stylesheet" href="./style.css">     -> <style>…</style>
 *  - <link rel="icon" href="./icon.svg">            -> data: URL (base64)
 *  - <link rel="modulepreload">                     -> removed
 *  - <script src="./js/X.js"></script>              -> <script data-gs-src="js/X.js">…</script> (classic, same order)
 *  - <script type="module" src="./app.mjs">         -> app.mjs and its static imports (game.mjs, aim.mjs), dependencies
 *    first, each as <script type="module" data-gs-src="X.mjs"> that stores its exports in window.GS_MODULES['X.mjs']:
 *    `import … from './X.mjs'` becomes a read of that object, the `export` keywords are dropped.
 *  - manual.html + manual.css (+ any script the manual needs that the game page does not load, e.g. js/manual.js)
 *    -> JSON in <script type="application/json" id="gs-embed">. js/shell.js builds the manual iframe from it
 *    (a blob: document with the scripts above inlined), so the manual opens offline inside the single file.
 * Nothing comes from the network. To keep the file small, comments and indentation are stripped (strip.mjs) from
 * every inlined script and stylesheet and from the markup's <!-- --> comments; each stripped script must compile.
 *
 * Supported module syntax (fails loudly otherwise): one `import … from './x.mjs'` per line (`* as ns` or
 * `{ a, b as c }`), `export const|let|var|function|async function|class name` at the start of a line (one name per
 * declaration), and `export { a, b as c }`. Inline text may not contain "<!--"; "</script" is written as
 * "<\/script". style.css, manual.css and fonts/fonts.css may not contain "</style".
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { stripCss, stripHtml, stripJs } from './strip.mjs';

const SRC = new URL('./src/', import.meta.url);
// text files without a UTF-8 BOM (a file saved with one would put a stray U+FEFF into the inlined script)
const read = async name => (await readFile(new URL(name, SRC), 'utf8')).replace(/^\uFEFF/, '');
const fail = msg => { throw new Error('standalone: ' + msg); };
const NAME = '[A-Za-z0-9_.-]+';          // a file name in src/ or src/js/
const ID = String.raw`[A-Za-z_$][\w$]*`; // a JavaScript identifier (ASCII)
const IMPORT_RE = new RegExp(String.raw`^import\s+(.+?)\s+from\s+(['"])\./(${NAME}\.mjs)\2\s*;?$`);
const STAR_RE = new RegExp(String.raw`^\*\s+as\s+(${ID})$`);
const BINDING_RE = new RegExp(String.raw`^(${ID})(?:\s+as\s+(${ID}))?$`);
const DECL_RE = new RegExp(String.raw`^export\s+((?:async\s+)?function\*?|class|const|let|var)\s+(${ID})`);

// text inside <script> must not end the element early nor enter the "script data escaped" state
function scriptText(code, name) {
  if (code.includes('<!--')) fail(name + ' contains "<!--"');
  return code.replace(/<\/(script)/gi, '<\\/$1');
}
// a script as inlined: stripped (strip.mjs), checked to still compile, then made safe for <script>
function jsText(code, name) {
  const stripped = stripJs(code);
  try { new vm.Script(stripped, { filename: name }); } catch (e) { fail(`${name} does not compile after stripping: ${e.message}`); }
  return scriptText(stripped, name);
}
// text inside <style> must not end the element early (style.css here; manual.css in the manual document that
// js/shell.js assembles from the embedded copy)
function styleText(css, name) {
  if (/<\/style/i.test(css)) fail(name + ' contains "</style"');
  return css;
}

// ---- ES modules -> ordered wrappers filling window.GS_MODULES -------------------------------------
// the items of an import / export list, without its braces: "a, b as c"
const listItems = body => body.split(',').map(s => s.trim()).filter(Boolean);
// one list item, "a" or "a as b" -> [a, b] (b undefined without "as"); anything else fails as an unsupported `what`
function parseBinding(s, name, what) {
  const m = BINDING_RE.exec(s);
  if (!m) fail(`${name}: unsupported ${what} "${s}"`);
  return [m[1], m[2]];
}
function importBindings(clause, name) {
  let m;
  if ((m = STAR_RE.exec(clause))) return m[1];
  if ((m = /^\{([^}]*)\}$/.exec(clause))) {
    const parts = listItems(m[1]).map(s => {
      const [imported, local] = parseBinding(s, name, 'import binding');
      return local ? `${imported}: ${local}` : imported;
    });
    return `{ ${parts.join(', ')} }`;
  }
  return fail(`${name}: unsupported import clause "${clause}" (default imports are not supported)`);
}
// `export const|let|var` must declare one name: in `export const a = 1, b = 2;` b would stay unexported without a
// word. True when the declaration whose name ends at code[i] has a comma at bracket depth 0. The scan skips
// strings, template literals (whole, ${…} included), comments and regex literals, and ends at a ";" at depth 0 or
// at the end of the line on which the brackets are balanced.
function hasSecondDeclarator(code, i) {
  let depth = 0, prev = '';   // prev: the last character outside a literal, to tell a regex literal from a division
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '\n') { if (depth <= 0) return false; continue; }
    if (c === ' ' || c === '\t' || c === '\r') continue;
    if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); if (e < 0) return false; i = e - 1; continue; }
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); if (e < 0) return false; i = e + 1; continue; }
    if (c === '"' || c === "'" || c === '`' || (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      let inClass = false;   // inside a regex [...] class, where "/" does not end the literal
      for (i++; i < code.length && (code[i] !== c || inClass); i++) {
        if (code[i] === '\\') i++;
        else if (c === '/' && code[i] === '[') inClass = true;
        else if (c === '/' && code[i] === ']') inClass = false;
      }
      prev = c;   // a literal is a value: a "/" after it divides
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === ',') return true;
    else if (depth === 0 && c === ';') return false;
    prev = c;
  }
  return false;
}
function convertModule(name, code) {
  const deps = [], names = [];
  let lineStart = 0;   // offset in code of the line being converted
  const lines = code.split('\n').map(line => {
    const at = lineStart;
    lineStart += line.length + 1;
    const t = line.trim();
    if (/^import[\s{*]/.test(t)) {
      const m = IMPORT_RE.exec(t);
      if (!m) fail(`${name}: unsupported import "${t}"`);
      deps.push(m[3]);
      return `const ${importBindings(m[1].trim(), name)} = window.GS_MODULES[${JSON.stringify(m[3])}];`;
    }
    if (!/^export\b/.test(line)) return line;
    let m;
    if ((m = DECL_RE.exec(line))) {
      if (/^(?:const|let|var)$/.test(m[1]) && hasSecondDeclarator(code, at + m[0].length)) {
        fail(`${name}: one name per export declaration, split "${t}"`);
      }
      names.push(m[2]);
      return line.replace(/^export\s+/, '');
    }
    if ((m = /^export\s*\{([^}]*)\}\s*;?\s*$/.exec(line))) {
      listItems(m[1]).forEach(s => {
        const [local, exported] = parseBinding(s, name, 'export');
        names.push(exported ? `${exported}: ${local}` : local);
      });
      return '';
    }
    return fail(`${name}: unsupported export "${t}"`);
  });
  let body = lines.join('\n');
  if (!body.endsWith('\n')) body += '\n';
  const ns = names.length ? ', ' + names.join(', ') : '';
  const text = `(window.GS_MODULES = window.GS_MODULES || {})[${JSON.stringify(name)}] = (() => {\n${body}` +
    `return Object.freeze({ __proto__: null${ns} });\n})();\n`;
  return { deps, text: jsText(text, name) };
}
const modules = new Map(); // name -> { deps, text }, insertion order = dependencies first
async function loadModule(name, stack = []) {
  if (modules.has(name)) return;
  if (stack.includes(name)) fail('import cycle ' + [...stack, name].join(' -> '));
  const mod = convertModule(name, await read(name));
  for (const d of mod.deps) await loadModule(d, [...stack, name]);
  modules.set(name, mod);
}

// ---- index.html -> play.html ------------------------------------------------------------------------
let html = stripHtml(await read('index.html'));
const inlined = new Set();
function replaceOnce(re, fn, what) {
  let n = 0;
  html = html.replace(re, (...a) => { n++; return fn(...a); });
  if (n !== 1) fail(`index.html: expected one ${what}, found ${n}`);
}

// the bundled fonts (fonts/fonts.css, made by fonts.mjs), their files as data: URLs
const FONTS_CSS = 'fonts/fonts.css', WOFF2_RE = /url\(([\w.-]+\.woff2)\)/g;
let fontsCss = stripCss(await read(FONTS_CSS));
const fontData = new Map();
for (const [, f] of fontsCss.matchAll(WOFF2_RE)) {
  if (!fontData.has(f)) fontData.set(f, (await readFile(new URL('fonts/' + f, SRC))).toString('base64'));
}
if (!fontData.size) fail(FONTS_CSS + ': no url(*.woff2)');
// OFL 1.1: every copy of the fonts carries its copyright notice and the license. The subsets keep the copyright in
// their own metadata but not the license text, so play.html carries the license files (fonts/*-OFL.txt) as a comment.
const licenses = [];
for (const f of (await readdir(new URL('fonts/', SRC))).filter(f => f.endsWith('-OFL.txt')).sort()) {
  const t = (await read('fonts/' + f)).replace(/\r\n/g, '\n').trimEnd();
  if (t.includes('*/')) fail(`fonts/${f} contains "*/"`);
  licenses.push(`---- ${f} ----\n${t}`);
}
if (!licenses.length) fail('fonts/: no *-OFL.txt license texts');
fontsCss = `/* The fonts in this file are under the SIL Open Font License 1.1. Their license texts:\n\n${licenses.join('\n\n')}\n*/\n` +
  fontsCss.replace(WOFF2_RE, (m, f) => `url(data:font/woff2;base64,${fontData.get(f)})`);
fontsCss = styleText(fontsCss, FONTS_CSS);
replaceOnce(/<link rel="stylesheet" href="\.\/fonts\/fonts\.css">/g,
  () => `<style data-gs-src="${FONTS_CSS}">\n${fontsCss}</style>`, 'fonts/fonts.css link');

const css = styleText(stripCss(await read('style.css')), 'style.css');
replaceOnce(/<link rel="stylesheet" href="\.\/style\.css">/g, () => `<style>\n${css}</style>`, 'style.css link');

const icon = await readFile(new URL('icon.svg', SRC));
replaceOnce(/<link rel="icon" href="\.\/icon\.svg" type="image\/svg\+xml">/g,
  () => `<link rel="icon" href="data:image/svg+xml;base64,${icon.toString('base64')}" type="image/svg+xml">`, 'icon link');

html = html.replace(/^<link rel="modulepreload" href="[^"]*">\r?\n/gm, '');

// one pass over the page's own tags (inlined text is never scanned again)
const tagRe = new RegExp(`<script src="\\./(js/${NAME}\\.js)"></script>|<script type="module" src="\\./(${NAME}\\.mjs)"></script>`, 'g');
const classic = {};
let entries = 0;
for (const [, js, mjs] of html.matchAll(tagRe)) {
  if (js) classic[js] = jsText(await read(js), js);
  else { entries++; await loadModule(mjs); }
}
if (!Object.keys(classic).length || !entries) fail('index.html: classic scripts or the module script not found');
html = html.replace(tagRe, (m, js) => {
  if (js) { inlined.add(js); return `<script data-gs-src="${js}">\n${classic[js]}</script>`; }
  const out = [];
  for (const [name, mod] of modules) {
    if (inlined.has(name)) continue;
    inlined.add(name);
    out.push(`<script type="module" data-gs-src="${name}">\n${mod.text}</script>`);
  }
  return out.join('\n');
});

// ---- the manual, embedded for js/shell.js (blob: iframe) -------------------------------------------
const manualHtml = stripHtml(await read('manual.html'));
for (const sheet of ['manual.css', FONTS_CSS]) {   // js/shell.js swaps these two for <style> in the manual
  if (!manualHtml.includes(`<link rel="stylesheet" href="${sheet}">`)) fail(`manual.html: no <link rel="stylesheet" href="${sheet}">`);
}
const embed = { 'manual.html': manualHtml, 'manual.css': styleText(stripCss(await read('manual.css')), 'manual.css') };
for (const [, name] of manualHtml.matchAll(new RegExp(`<script src="(?:\\./)?(js/${NAME}\\.js)"></script>`, 'g'))) {
  if (!inlined.has(name) && !(name in embed)) embed[name] = jsText(await read(name), name);
}
for (const [, , name] of manualHtml.matchAll(new RegExp(`import\\((['"])\\./(${NAME}\\.mjs)\\1\\)`, 'g'))) {
  if (!inlined.has(name)) fail(`manual.html imports ${name}, which the game page does not load`);
}
const json = JSON.stringify(embed).replace(/</g, '\\u003c');
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) fail('index.html: no </body>');
html = html.slice(0, bodyEnd) + `<script type="application/json" id="gs-embed">${json}</script>\n` + html.slice(bodyEnd);

html = html.replace(/^<!doctype html>\r?\n/i, m => m + '<!-- play.html: generated by standalone.mjs from src/ (do not edit by hand) -->\n');
// nothing but data: URLs may be loaded: check the markup outside the inline scripts / styles, and the styles' url()
const withStyles = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
const markup = withStyles.replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
const loads = /<(?:script|link|img|iframe)\b[^>]*\s(?:src|href)="(?!data:)[^"]*"/i.exec(markup);
if (loads) fail('play.html still loads a file: ' + loads[0]);
for (const [, sheet] of withStyles.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
  const url = /url\(\s*(?!["']?data:)[^)]*\)/i.exec(sheet);
  if (url) fail('play.html still loads a file from CSS: ' + url[0]);
}
await writeFile(new URL('./play.html', import.meta.url), html, 'utf8');
console.log(`Standalone: play.html (${Math.round(Buffer.byteLength(html) / 1024)} KB; ${[...inlined].join(', ')}; embedded ${Object.keys(embed).join(', ')})`);
