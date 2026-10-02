/* Rolls the shipped dice physics against a stub DOM and tests the resting
   faces for uniformity. This is the test that caught the real bug: the solver
   resolved a cube's eight corner contacts in a fixed order in the die's own
   frame, so the same local corners always won and every face lost to its
   opposite. Chi-square found it; reading the code did not.
   Run: node tests/dice-fairness.js [trials]   (default 260) */
const { script } = require('./lib/extract.js');

/* ---- stub DOM: enough of one for the tray to run headless ---- */
let clickHandler = null;
function node() {
  const o = {
    style: { setProperty() {} }, children: [], hidden: false, clientWidth: 620, textContent: '',
    appendChild(c) { o.children.push(c); return c; },
    insertBefore(c) { o.children.push(c); return c; },
    remove() {},
    addEventListener(ev, fn) { if (ev === 'click') clickHandler = fn; },
    set className(v) { o._c = v }, get className() { return o._c }
  };
  return o;
}
const tray = node(), hint = node();
global.document = { createElement: () => node(), getElementById: id => id === 'tray' ? tray : hint };
global.window = { addEventListener() {}, APP: null };
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.performance = { now: () => 0 };

new Function(script(2))();

/* ---- the heaviest roll the tool ever produces: 19 dice at once ---- */
const palette = {
  wpn:  { face: '#444',    pip: '#fff' },
  bane: { face: '#9E004F', pip: '#fff' },
  holy: { face: '#D9A527', pip: '#000' },
  fire: { face: '#D9541F', pip: '#fff' }
};
const groups = [
  { key: 'wpn',  count: 1 },
  { key: 'holy', count: 2 },
  { key: 'bane', count: 4 },
  { key: 'fire', count: 12 }
];

const TRIALS = parseInt(process.argv[2], 10) || 260;
const vals = [];
let settled = 0, invalid = 0;

for (let i = 0; i < TRIALS; i++) {
  let out = null;
  window.__DICE3D.roll(groups, palette, r => out = r);
  clickHandler();                 /* "click to settle" runs the sim to rest */
  if (!out) continue;
  settled++;
  for (const k in out) out[k].forEach(v => {
    vals.push(v);
    if (!(Number.isInteger(v) && v >= 1 && v <= 6)) invalid++;
  });
}

/* ---- results ---- */
const n = vals.length, exp = n / 6;
const counts = {};
for (let f = 1; f <= 6; f++) counts[f] = 0;
vals.forEach(v => counts[v]++);
const chi = [1,2,3,4,5,6].reduce((a, f) => a + Math.pow(counts[f] - exp, 2) / exp, 0);
const mean = vals.reduce((a, b) => a + b, 0) / n;

/* upper tail of chi-square with 5 df has a closed form for odd df via erfc,
   but the series below is simpler and plenty accurate here */
function chiSqP(x, df) {
  if (x <= 0) return 1;
  let p = Math.exp(-x / 2), term = p, k = df / 2;
  if (df % 2 === 0) { for (let i = 1; i < k; i++) { term *= x / (2 * i); p += term; } return p; }
  let s = Math.sqrt(x / 2), q = 2 * (1 - 0.5 * (1 + erf(s)));
  term = Math.exp(-x / 2) * Math.sqrt(2 * x / Math.PI);
  for (let i = 1; i <= (df - 1) / 2; i++) { if (i > 1) term *= x / (2 * i - 1); q += term; }
  return Math.min(1, q);
}
function erf(z) {
  const t = 1 / (1 + 0.5 * Math.abs(z));
  const y = t * Math.exp(-z*z - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 +
    t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 +
    t*(-0.82215223 + t*0.17087277)))))))));
  return z >= 0 ? 1 - y : y - 1;
}

console.log('trials settled   ', settled + ' / ' + TRIALS);
console.log('dice read        ', n + '  (expected ' + 19 * settled + ')');
console.log('invalid faces    ', invalid);
console.log('distribution     ', JSON.stringify(counts));
console.log('mean             ', mean.toFixed(3) + '  (fair = 3.500)');
console.log('chi-square (5 df)', chi.toFixed(2) + '  p = ' + chiSqP(chi, 5).toFixed(3) +
                                 '  (reject above 11.07)');
/* what a run this size can actually see: ~80% power to catch a single face
   running 18.6% instead of 16.7%. A smaller skew than that can hide. */
console.log('\nnote: ~' + n + ' reads gives about 80% power against a single face at 18.6%');
console.log('      (fair = 16.7%). Finer skews need far more rolls.');

const bad = invalid > 0 || settled < TRIALS || chi > 11.07;
console.log(bad ? '\nSUSPECT' : '\nconsistent with a fair die');
process.exit(bad ? 1 : 0);
