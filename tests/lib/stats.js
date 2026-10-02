/* Shared statistics so both engines are judged by exactly the same yardstick. */

function erf(z) {
  const t = 1 / (1 + 0.5 * Math.abs(z));
  const y = t * Math.exp(-z*z - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 +
    t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 +
    t*(-0.82215223 + t*0.17087277)))))))));
  return z >= 0 ? 1 - y : y - 1;
}
/* upper tail of chi-square, df=5 (odd df closed form) */
function chiSqP(x, df = 5) {
  if (x <= 0) return 1;
  let q = 2 * (1 - 0.5 * (1 + erf(Math.sqrt(x / 2))));
  let term = Math.exp(-x / 2) * Math.sqrt(2 * x / Math.PI);
  for (let i = 1; i <= (df - 1) / 2; i++) { if (i > 1) term *= x / (2 * i - 1); q += term; }
  return Math.max(0, Math.min(1, q));
}

function gammaln(x) {
  const c = [76.18009172947146,-86.50532032941677,24.01409824083091,
             -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function lowerGamma(s, x) {
  if (x <= 0) return 0;
  if (x < s + 1) {
    let ap = s, sum = 1 / s, del = sum;
    for (let n = 1; n < 600; n++) { ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + s * Math.log(x) - gammaln(s));
  }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 600; i++) {
    const an = -i * (i - s); b += 2; d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - gammaln(s)) * h;
}
const chi2cdf = (x, df) => lowerGamma(df / 2, x / 2);
function ncChi2cdf(x, df, lam) {
  let s = 0;
  for (let j = 0; j < 400; j++) {
    const w = Math.exp(-lam / 2 + j * Math.log(lam / 2 || 1e-300) - gammaln(j + 1));
    s += w * chi2cdf(x, df + 2 * j);
    if (w < 1e-16 && j > 5) break;
  }
  return s;
}

/* Smallest single-face rate this many reads can catch 80% of the time.
   Without this a clean chi-square is just "we didn't look hard enough". */
function detectable(n, power = 0.80, alpha = 11.0705) {
  const q = 1 / 6;
  const lam = p => { const r = (1 - p) / 5; return n * (((p-q)**2)/q + 5*((r-q)**2)/q); };
  let lo = q, hi = 0.40;
  for (let i = 0; i < 90; i++) {
    const m = (lo + hi) / 2;
    if (1 - ncChi2cdf(alpha, 5, lam(m)) < power) lo = m; else hi = m;
  }
  return hi;
}

function report(label, vals) {
  const n = vals.length, exp = n / 6, counts = {};
  for (let f = 1; f <= 6; f++) counts[f] = 0;
  vals.forEach(v => counts[v]++);
  const chi = [1,2,3,4,5,6].reduce((a, f) => a + (counts[f]-exp)**2 / exp, 0);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const pairs = [[1,6],[2,5],[3,4]].map(([a,b]) => counts[a] / counts[b]);
  return { label, n, counts, chi, p: chiSqP(chi), mean, pairs,
           pct: [1,2,3,4,5,6].map(f => counts[f] / n), detectable: detectable(n) };
}

function table(rows) {
  const pad = (s, w) => String(s).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);
  console.log('');
  console.log(pad('engine', 22) + padL('reads', 9) + padL('chi2', 9) + padL('p', 8) +
              padL('mean', 8) + padL('worst face', 12) + padL('detectable', 12));
  console.log('-'.repeat(80));
  for (const r of rows) {
    const worst = Math.max(...r.pct.map(p => Math.abs(p - 1/6)));
    console.log(pad(r.label, 22) + padL(r.n, 9) + padL(r.chi.toFixed(2), 9) +
      padL(r.p.toFixed(3), 8) + padL(r.mean.toFixed(3), 8) +
      padL((worst * 100).toFixed(2) + ' pt', 12) +
      padL((r.detectable * 100).toFixed(2) + '%', 12));
  }
  console.log('-'.repeat(80));
  console.log('fair: chi2 below 11.07, p above 0.05, mean 3.500, worst face 0.00 pt');
  console.log('detectable = single-face rate this many reads catches 80% of the time\n');
  for (const r of rows) {
    console.log(r.label);
    console.log('  faces   ' + [1,2,3,4,5,6].map(f => f + ':' + r.counts[f]).join('  '));
    console.log('  pairs   1/6 ' + r.pairs[0].toFixed(3) +
                '   2/5 ' + r.pairs[1].toFixed(3) + '   3/4 ' + r.pairs[2].toFixed(3));
  }
}

module.exports = { chiSqP, detectable, report, table };
