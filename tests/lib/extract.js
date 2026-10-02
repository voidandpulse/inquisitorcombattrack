/* Pull real code out of strikes.html so the tests exercise the shipped file,
   not a copy that can drift away from it. */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', '..', 'strikes.html');

function html() { return fs.readFileSync(HTML, 'utf8'); }

/* Inline <script> bodies, in document order. 1 = app, 2 = dice tray. */
function script(n) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  const found = [];
  let m;
  while ((m = re.exec(html()))) found.push(m[1]);
  if (!found[n - 1]) throw new Error('no inline script #' + n + ' in strikes.html');
  return found[n - 1];
}

/* Lift a named function out of a source string by counting braces, so a
   regex can't stop at the first nested '}'. */
function fn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

module.exports = { html, script, fn };
