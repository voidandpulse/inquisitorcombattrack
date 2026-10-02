/* Loads the solid definitions out of combat-log-3d.html, so the geometry tests
   exercise the shipped page rather than a copy that can drift from it. */
const fs = require('fs'), path = require('path');
const HTML = path.join(__dirname, '..', '..', 'combat-log-3d.html');

function load() {
  const src = fs.readFileSync(HTML, 'utf8');
  const blocks = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tray = blocks.find(b => b.indexOf('__DICE_SHAPES') >= 0);
  if (!tray) throw new Error('no dice module found in combat-log-3d.html');
  /* the module only needs a canvas stub: the shapes are built before any drawing */
  const sandbox = { window: {}, document: { createElement: () => ({ getContext: () => ({}) }) } };
  new Function('window', 'document', tray)(sandbox.window, sandbox.document);
  return sandbox.window.__DICE_SHAPES;
}
module.exports = { load };
