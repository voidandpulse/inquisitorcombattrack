/* Isolates the face-reading step from the physics. Given a uniformly random
   orientation, "which face is up" must itself be uniform. If this test is
   clean and dice-fairness.js is not, the bias is in the solver, not the
   reading -- which is how the contact-ordering bug was localised.
   Run: node tests/face-reading.js [samples]   (default 120000) */

function qmat(q) {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  return [[1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y)],
          [2*(x*y+w*z),   1-2*(x*x+z*z), 2*(y*z-w*x)],
          [2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y)]];
}
const mv = (m, v) => m.map(r => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);

/* Shoemake: a uniformly distributed random rotation. Normalising four
   independent uniforms does NOT give this -- it clusters in one octant,
   which was the first (smaller) bug found here. */
function randQ() {
  const u1 = Math.random(), u2 = Math.random()*2*Math.PI, u3 = Math.random()*2*Math.PI,
        a = Math.sqrt(1-u1), b = Math.sqrt(u1);
  return [a*Math.sin(u2), a*Math.cos(u2), b*Math.sin(u3), b*Math.cos(u3)];
}

const FACES = [[1,0,0,1], [-1,0,0,6], [0,1,0,2], [0,-1,0,5], [0,0,1,3], [0,0,-1,4]];
function top(q) {
  const m = qmat(q);
  let best = -2, val = 1;
  for (const f of FACES) {
    const up = mv(m, [f[0], f[1], f[2]])[1];
    if (up > best) { best = up; val = f[3]; }
  }
  return val;
}

const N = parseInt(process.argv[2], 10) || 120000;
const counts = {};
for (let f = 1; f <= 6; f++) counts[f] = 0;
for (let i = 0; i < N; i++) counts[top(randQ())]++;
const exp = N / 6;
const chi = [1,2,3,4,5,6].reduce((a, f) => a + Math.pow(counts[f] - exp, 2) / exp, 0);

console.log('samples          ', N);
console.log('distribution     ', JSON.stringify(counts));
console.log('chi-square (5 df)', chi.toFixed(2) + '  (reject above 11.07)');

/* Opposite faces must also be balanced against each other. The solver bug
   showed up here first as every face losing to its own opposite. */
console.log('\nopposite pairs (each should be near 1.00):');
[[1,6],[2,5],[3,4]].forEach(([a, b]) =>
  console.log('  ' + a + ' vs ' + b + '   ' + (counts[a]/counts[b]).toFixed(3)));

/* qmat orientation sanity: a 90 deg turn about z sends local +x to world +y.
   If this prints the wrong vector, every face reading is suspect. */
const q = [Math.cos(Math.PI/4), 0, 0, Math.sin(Math.PI/4)];
console.log('\n90 deg about z sends local +x to',
  JSON.stringify(mv(qmat(q), [1,0,0]).map(v => +v.toFixed(3))), ' (expect [0,1,0])');

console.log(chi > 11.07 ? '\nSUSPECT' : '\nreading is unbiased');
process.exit(chi > 11.07 ? 1 : 0);
