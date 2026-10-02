/* Bonus-type stacking: Pathfinder suppresses all but the largest bonus of a
   given type, except untyped bonuses, which all apply. This pulls the real
   resolve() out of strikes.html and checks that rule.
   Run: node tests/bonus-pool.js */
const { script, fn } = require('./lib/extract.js');
const resolve = new Function('return ' + fn(script(1), 'resolve'))();

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  got ' + JSON.stringify(got) +
              (ok ? '' : '  want ' + JSON.stringify(want)));
}

/* A full-buff attack: weapon +4 and greater bane +6 are both enhancement, so
   bane wins. Justice +4 and hunter's blessing +2 are both sacred, so justice
   wins. Bard +13 and heroism +2 are both morale, so bard wins. Haste is
   untyped and stacks on top of everything. 6 + 4 + 13 + 1 = 24. */
const atk = {
  enhancement: [{ name: 'weapon', val: 4 }, { name: 'greater bane', val: 6 }],
  sacred:      [{ name: 'justice', val: 4 }, { name: "hunter's blessing", val: 2 }],
  morale:      [{ name: 'bard', val: 13 }, { name: 'heroism', val: 2 }],
  untyped:     [{ name: 'haste', val: 1 }]
};
const r = resolve(atk);
check('largest of each type applies, untyped stacks', r.total, 24);
check('suppressed sources are flagged, not dropped',
  r.lines.filter(l => !l.applied).map(l => l.name).sort(),
  ['heroism', "hunter's blessing", 'weapon']);
check('every source is reported', r.lines.length, 7);

/* A tie must not pay out twice. */
check('equal bonuses of one type apply once',
  resolve({ sacred: [{ name: 'a', val: 4 }, { name: 'b', val: 4 }] }).total, 4);

/* Several untyped bonuses all stack. */
check('untyped bonuses all stack',
  resolve({ untyped: [{ name: 'a', val: 1 }, { name: 'b', val: 12 }] }).total, 13);

/* An empty pool is zero, not NaN. */
check('empty pool is zero', resolve({}).total, 0);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
