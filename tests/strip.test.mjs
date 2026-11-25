// strip.mjs: comments and indentation go, the code and every literal's text stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { stripCss, stripHtml, stripJs } from '../strip.mjs';

test('JS: comments, indentation and blank lines go; the line breaks between statements stay', () => {
  const src = '// head\nfunction f(a) {\n    /* block */\n    const b = a + 1; // tail\n\n\n    return b;\n}\n';
  assert.equal(stripJs(src), 'function f(a) {\nconst b = a + 1;\nreturn b;\n}\n');
});

test('JS: a block comment with a line break still ends the line (automatic semicolons)', () => {
  assert.equal(stripJs('a\n/* x */\nb'), 'a\nb\n');
  assert.equal(stripJs('return /*\n*/ x'), 'return\nx\n');
  assert.equal(stripJs('a/* x */b'), 'a b\n');
});

test('JS: strings and templates keep their text, // and /* */ included', () => {
  assert.equal(stripJs(`const u = 'http://x/*y*/'; // c`), `const u = 'http://x/*y*/';\n`);
  assert.equal(stripJs(`s = "a // b \\" // c"`), `s = "a // b \\" // c"\n`);
  const tpl = 'const t = `line 1 // not a comment\n    indented ${a /* gone */ + `inner ${b} // kept`} /* kept */`;';
  assert.equal(stripJs(tpl), 'const t = `line 1 // not a comment\n    indented ${a + `inner ${b} // kept`} /* kept */`;\n');
  assert.equal(stripJs('x = `${ {a: 1}.a }`'), 'x = `${ {a: 1}.a }`\n');
});

test('JS: regular expressions are kept whole; a "/" after a value divides', () => {
  assert.equal(stripJs(`s.replace(/\\/\\//g, '') // c`), `s.replace(/\\/\\//g, '')\n`);
  assert.equal(stripJs(`const r = /[/'"]+/gi; // c`), `const r = /[/'"]+/gi;\n`);
  assert.equal(stripJs('return /a\\/b/.test(s)'), 'return /a\\/b/.test(s)\n');
  assert.equal(stripJs('x = a / b / c; y = (a) / 2; z = q[0] / 3 // c'), 'x = a / b / c; y = (a) / 2; z = q[0] / 3\n');
  assert.equal(stripJs('f(/x/, typeof /y/)'), 'f(/x/, typeof /y/)\n');
});

test('JS: spacing that tells tokens apart is kept', () => {
  assert.equal(stripJs('a + +b; c - -d; return  x; else   if (y) z'), 'a + +b; c - -d; return x; else if (y) z\n');
});

test('JS: an unterminated literal is an error, not a guess', () => {
  assert.throws(() => stripJs("a = 'open\nb"), /unterminated string/);
  assert.throws(() => stripJs('a = `open'), /unterminated template/);
  assert.throws(() => stripJs('a /* open'), /unterminated comment/);
});

test('CSS: comments and indentation go, strings stay', () => {
  const css = '/* head */\n.a {\n  content: "/* kept */";  /* gone */\n  color: red;\n}\n\n.b .c { x: 1 }\n';
  assert.equal(stripCss(css), '.a {\ncontent: "/* kept */";\ncolor: red;\n}\n.b .c { x: 1 }\n');
});

test('HTML: comments go, inline scripts and styles are stripped, others are left alone', () => {
  const html = '<!-- note -->\n<p>a <b>b</b></p>\n<script src="x.js"></script>\n<script type="application/json">{"a": "// 1"}</script>\n' +
    '<script type="module">\n  // c\n  go(); // d\n</script>\n<style>\n  /* c */ p { color: red; }\n</style>\n';
  assert.equal(stripHtml(html), '\n<p>a <b>b</b></p>\n<script src="x.js"></script>\n<script type="application/json">{"a": "// 1"}</script>\n' +
    '<script type="module">\ngo();\n</script>\n<style>\np { color: red; }\n</style>\n');
});

test('every script in src/ still compiles after stripping, and stripping twice changes nothing', async () => {
  const SRC = new URL('../src/', import.meta.url);
  const files = (await readdir(SRC, { recursive: true })).map(p => p.split('\\').join('/')).filter(p => /\.(?:js|mjs|css)$/.test(p));
  assert.ok(files.length > 10);
  for (const name of files) {
    const text = await readFile(new URL(name, SRC), 'utf8');
    if (name.endsWith('.css')) { const once = stripCss(text); assert.equal(stripCss(once), once, name); continue; }
    const once = stripJs(text);
    assert.equal(stripJs(once), once, name + ': idempotent');
    assert.ok(once.length < text.length, name + ': smaller');
    // classic scripts compile as they are; modules once their import / export lines are set aside (standalone.mjs
    // compiles the converted module wrappers of the real build)
    const body = name.endsWith('.mjs') ? once.replace(/^import\b.*$/gm, '').replace(/^export\s+(?:\{[^}]*\};?)?/gm, '') : once;
    assert.doesNotThrow(() => new vm.Script(body, { filename: name }), name + ': compiles');
  }
});
