/* Does a published physics engine roll fairer dice than the one written for
   this project? Runs both under identical conditions and tests both for
   uniformity.

   The constants, launch distribution, timestep and face-reading step are
   shared, so the only difference between the two columns is the solver.
   The comparison is unpaired -- the two engines consume randomness in
   different orders, so they do not see byte-identical launches -- which is
   fine, because the question is "is either one biased", not "do they agree".

   Run: node tests/compare-engines.js [reads-per-engine]   (default 30000)
   Needs: npm install    (cannon-es) */

const { script } = require('./lib/extract.js');
const { report, table } = require('./lib/stats.js');

/* ---- constants lifted from strikes.html ---- */
const S = 34, H = S / 2, ZL = 96, G = 2600, E = 0.3, MU = 0.36, DT = 1 / 120;
const XL = Math.max(140, 620 / 2 - 14);          /* the tray width the stub reports */
const GROUPS = [{ key: 'wpn', count: 1 }, { key: 'holy', count: 2 },
                { key: 'bane', count: 4 }, { key: 'fire', count: 12 }];
const PER_ROLL = GROUPS.reduce((a, g) => a + g.count, 0);   /* 19 */

/* ---- face reading, used by both engines ---- */
const FACES = [[1,0,0,1], [-1,0,0,6], [0,1,0,2], [0,-1,0,5], [0,0,1,3], [0,0,-1,4]];
function qmat(q) {                                /* q = [w,x,y,z] */
  const w = q[0], x = q[1], y = q[2], z = q[3];
  return [[1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y)],
          [2*(x*y+w*z),   1-2*(x*x+z*z), 2*(y*z-w*x)],
          [2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y)]];
}
function topFace(q) {
  const m = qmat(q);
  let best = -2, val = 1;
  for (const f of FACES) {
    const up = m[1][0]*f[0] + m[1][1]*f[1] + m[1][2]*f[2];
    if (up > best) { best = up; val = f[3]; }
  }
  return val;
}
const rnd = n => (Math.random() * 2 - 1) * n;
function randQ() {                                /* Shoemake */
  const u1 = Math.random(), u2 = Math.random()*2*Math.PI, u3 = Math.random()*2*Math.PI,
        a = Math.sqrt(1-u1), b = Math.sqrt(u1);
  return [a*Math.sin(u2), a*Math.cos(u2), b*Math.sin(u3), b*Math.cos(u3)];
}
/* the launch distribution the shipped tray uses, so cannon gets the same throw */
const launch = () => ({
  p: [rnd(XL - 40), 150 + Math.random() * 170, rnd(ZL - 26)],
  v: [rnd(170), -260 - Math.random() * 160, rnd(130)],
  w: [rnd(15), rnd(15), rnd(15)],
  q: randQ()
});

/* ---- engine A: the physics shipped in strikes.html ---- */
function runShipped(reads) {
  let clickHandler = null;
  const node = () => {
    const o = { style: { setProperty() {} }, children: [], hidden: false,
      clientWidth: 620, textContent: '',
      appendChild(c) { o.children.push(c); return c },
      insertBefore(c) { o.children.push(c); return c }, remove() {},
      addEventListener(ev, fn) { if (ev === 'click') clickHandler = fn },
      set className(v) { o._c = v }, get className() { return o._c } };
    return o;
  };
  const tray = node(), hint = node();
  global.document = { createElement: () => node(),
                      getElementById: id => id === 'tray' ? tray : hint };
  global.window = { addEventListener() {}, APP: null };
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  global.performance = { now: () => 0 };
  new Function(script(2))();

  const palette = { wpn: {face:'#444',pip:'#fff'}, bane: {face:'#9E004F',pip:'#fff'},
                    holy: {face:'#D9A527',pip:'#000'}, fire: {face:'#D9541F',pip:'#fff'} };
  const vals = [];
  let rolls = 0, unsettled = 0, invalid = 0;
  while (vals.length < reads) {
    let out = null;
    window.__DICE3D.roll(GROUPS, palette, r => out = r);
    clickHandler();
    rolls++;
    if (!out) { unsettled++; continue; }
    for (const k in out) out[k].forEach(v => {
      vals.push(v);
      if (!(Number.isInteger(v) && v >= 1 && v <= 6)) invalid++;
    });
  }
  return { vals, rolls, unsettled, invalid };
}

/* ---- engine B: cannon-es ---- */
async function runCannon(reads) {
  const C = await import('cannon-es');
  const vals = [];
  let rolls = 0, unsettled = 0, invalid = 0;

  while (vals.length < reads) {
    const world = new C.World({ gravity: new C.Vec3(0, -G, 0) });
    world.broadphase = new C.NaiveBroadphase();
    world.solver.iterations = 10;
    world.allowSleep = true;

    const mat = new C.Material('d');
    world.addContactMaterial(new C.ContactMaterial(mat, mat,
      { friction: MU, restitution: E }));
    world.defaultContactMaterial.friction = MU;
    world.defaultContactMaterial.restitution = E;

    /* same box as the tray: floor at y=0, walls at +/-XL and +/-ZL */
    const planes = [
      { n: [0,1,0],  pos: [0,0,0],    ax: [1,0,0], ang: -Math.PI/2 },
      { n: [1,0,0],  pos: [-XL,0,0],  ax: [0,1,0], ang:  Math.PI/2 },
      { n: [-1,0,0], pos: [ XL,0,0],  ax: [0,1,0], ang: -Math.PI/2 },
      { n: [0,0,1],  pos: [0,0,-ZL],  ax: [0,1,0], ang:  0 },
      { n: [0,0,-1], pos: [0,0, ZL],  ax: [0,1,0], ang:  Math.PI }
    ];
    for (const pl of planes) {
      const b = new C.Body({ mass: 0, shape: new C.Plane(), material: mat });
      b.position.set(pl.pos[0], pl.pos[1], pl.pos[2]);
      b.quaternion.setFromAxisAngle(new C.Vec3(pl.ax[0], pl.ax[1], pl.ax[2]), pl.ang);
      world.addBody(b);
    }

    const bodies = [];
    for (let i = 0; i < PER_ROLL; i++) {
      const L = launch();
      const b = new C.Body({ mass: 1, material: mat,
        shape: new C.Box(new C.Vec3(H, H, H)),
        allowSleep: true, sleepSpeedLimit: 2, sleepTimeLimit: 0.2 });
      b.position.set(L.p[0], L.p[1], L.p[2]);
      b.velocity.set(L.v[0], L.v[1], L.v[2]);
      b.angularVelocity.set(L.w[0], L.w[1], L.w[2]);
      b.quaternion.set(L.q[1], L.q[2], L.q[3], L.q[0]);   /* cannon is (x,y,z,w) */
      world.addBody(b);
      bodies.push(b);
    }

    const asleep = () => bodies.every(b =>
      b.sleepState === C.Body.SLEEPING ||
      (b.velocity.length() < 2 && b.angularVelocity.length() < 2));
    let steps = 0;
    while (steps < 2600 && !asleep()) { world.step(DT); steps++; }
    rolls++;
    if (!asleep()) { unsettled++; continue; }

    for (const b of bodies) {
      const q = b.quaternion;
      const v = topFace([q.w, q.x, q.y, q.z]);
      vals.push(v);
      if (!(Number.isInteger(v) && v >= 1 && v <= 6)) invalid++;
    }
  }
  return { vals, rolls, unsettled, invalid };
}

(async () => {
  const READS = parseInt(process.argv[2], 10) || 30000;
  console.log('target reads per engine: ' + READS +
              '  (' + PER_ROLL + ' dice per roll, dt=1/' + (1/DT) + ')');

  let t = Date.now();
  const a = runShipped(READS);
  const aSecs = ((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  const b = await runCannon(READS);
  const bSecs = ((Date.now() - t) / 1000).toFixed(1);

  const rows = [report('strikes.html (custom)', a.vals), report('cannon-es', b.vals)];
  table(rows);
  console.log('rolls / unsettled / invalid faces');
  console.log('  custom     ' + a.rolls + ' / ' + a.unsettled + ' / ' + a.invalid +
              '   (' + aSecs + 's)');
  console.log('  cannon-es  ' + b.rolls + ' / ' + b.unsettled + ' / ' + b.invalid +
              '   (' + bSecs + 's)');

  const bad = rows.filter(r => r.chi > 11.07).map(r => r.label);
  console.log(bad.length ? '\nBIASED: ' + bad.join(', ')
                         : '\nboth consistent with fair dice at this sample size');
  process.exit(0);
})();
