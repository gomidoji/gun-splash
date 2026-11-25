/* Comment and whitespace stripping for the single-file build (standalone.mjs) and the font character list (fonts.mjs).
 * Nothing is renamed or reordered, and the text of strings, template literals and regular expressions is never touched:
 *
 *  - stripJs:   drops // and /* *\/ comments; a run of whitespace (comments included) becomes one newline when it held
 *               a line break (so automatic semicolon insertion sees the same lines) and one space otherwise. So the
 *               indentation, trailing spaces and blank lines go.
 *  - stripCss:  the same for CSS (/* *\/ comments; strings kept).
 *  - stripHtml: drops <!-- --> comments outside <script> and <style>, and runs stripJs / stripCss over the text of those
 *               elements. Other whitespace in the markup is kept (it can matter for inline layout).
 *
 * A "/" starts a regular expression or is a division depending on the token before it (the usual rule: after a value
 * — a name, number, string, ")" or "]" — it divides). standalone.mjs compiles every stripped script, so a misreading
 * shows up as a failed build rather than a changed game.
 */

// keywords after which a "/" starts a regular expression (after any other name it divides)
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case',
  'do', 'else', 'yield', 'await']);
const WORD = /[\w$\u0080-\uffff]/;

export function stripJs(code) {
  let out = '', i = 0, ws = '';   // ws: pending whitespace, '' | ' ' | '\n'
  let prev = '';                   // the last token: 'value' (a "/" after it divides), 'op' (a "/" after it is a regex)
  const templates = [];            // brace depth at each open ${ … } of a template literal
  let depth = 0;
  const n = code.length;
  const space = s => { if (s === '\n' || ws === '\n') ws = '\n'; else ws = ' '; };
  // the pending whitespace goes out before the next token, except at the start of a line (that is the indentation)
  const emit = s => {
    if (ws && out && !out.endsWith('\n')) out += ws;
    ws = '';
    out += s;
  };
  // a template literal's text from i (just after ` or }) to its end (`) or to the next ${
  const templateText = () => {
    const start = i;
    for (; i < n; i++) {
      if (code[i] === '\\') { i++; continue; }
      if (code[i] === '`') { i++; return { text: code.slice(start, i), open: false }; }
      if (code[i] === '$' && code[i + 1] === '{') { i += 2; return { text: code.slice(start, i), open: true }; }
    }
    throw new Error('strip: unterminated template literal');
  };
  while (i < n) {
    const c = code[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff') {
      space(c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (c === '/' && code[i + 1] === '/') {   // line comment: up to (not including) the line break
      while (i < n && code[i] !== '\n') i++;
      space(' '); continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end < 0) throw new Error('strip: unterminated comment');
      space(code.slice(i, end).includes('\n') ? '\n' : ' ');
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      const start = i++;
      for (; i < n && code[i] !== c; i++) {
        if (code[i] === '\\') i++;
        else if (code[i] === '\n') throw new Error('strip: unterminated string');
      }
      i++; emit(code.slice(start, i)); prev = 'value'; continue;
    }
    if (c === '`') {
      i++;
      const t = templateText();
      emit('`' + t.text);
      if (t.open) { templates.push(depth); depth++; prev = 'op'; } else prev = 'value';
      continue;
    }
    if (c === '/') {
      if (prev !== 'value') {   // a regular expression literal
        const start = i++;
        let inClass = false;
        for (; i < n; i++) {
          const d = code[i];
          if (d === '\\') { i++; continue; }
          if (d === '\n') throw new Error('strip: unterminated regular expression');
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
        }
        i++;
        while (i < n && WORD.test(code[i])) i++;   // flags
        emit(code.slice(start, i)); prev = 'value'; continue;
      }
      emit('/'); i++; prev = 'op'; continue;
    }
    if (WORD.test(c)) {
      const start = i;
      while (i < n && WORD.test(code[i])) i++;
      const word = code.slice(start, i);
      emit(word);   // a space between two words stays: emit() writes the pending one
      prev = REGEX_AFTER_WORD.has(word) ? 'op' : 'value';
      continue;
    }
    if (c === '{') { depth++; emit(c); i++; prev = 'op'; continue; }
    if (c === '}') {
      if (templates.length && templates[templates.length - 1] === depth - 1) {   // the } that closes a ${ … }
        templates.pop(); depth--; i++;
        const t = templateText();
        emit('}' + t.text);
        if (t.open) { templates.push(depth); depth++; prev = 'op'; } else prev = 'value';
        continue;
      }
      depth--; emit(c); i++; prev = 'op'; continue;
    }
    emit(c); i++;
    prev = c === ')' || c === ']' ? 'value' : 'op';
  }
  if (templates.length) throw new Error('strip: unterminated template literal');
  return out + '\n';
}

export function stripCss(css) {
  let out = '', i = 0, ws = '';
  const n = css.length;
  const emit = s => { if (ws && out && !out.endsWith('\n')) out += ws; ws = ''; out += s; };
  while (i < n) {
    const c = css[i];
    if (/\s/.test(c)) { ws = c === '\n' || ws === '\n' ? '\n' : ' '; i++; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('strip: unterminated CSS comment');
      ws = ws === '\n' || css.slice(i, end).includes('\n') ? '\n' : (ws || ' ');
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      const start = i++;
      for (; i < n && css[i] !== c; i++) if (css[i] === '\\') i++;
      i++; emit(css.slice(start, i)); continue;
    }
    emit(c); i++;
  }
  return out + '\n';
}

// <!-- --> comments out of the markup; the text of each <script> / <style> stripped as JavaScript / CSS
// (a <script> with a src, or of a type that is not JavaScript, is left as it is)
export function stripHtml(html) {
  const re = /<!--[\s\S]*?-->|(<script\b([^>]*)>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  return html.replace(re, (m, sOpen, sAttrs, sBody, sClose, cOpen, cBody, cClose) => {
    if (sOpen) {
      const type = /\btype="([^"]*)"/i.exec(sAttrs);
      const js = !/\bsrc=/i.test(sAttrs) && (!type || /^(?:module|text\/javascript)$/i.test(type[1]));
      return js && sBody.trim() ? sOpen + '\n' + stripJs(sBody) + sClose : m;
    }
    if (cOpen) return cOpen + '\n' + stripCss(cBody) + cClose;
    return '';
  });
}
