/* Drops each solid in cannon-es and tests the resting faces for uniformity.
   A biased hull makes a pretty die that cheats, which is worse than no die at
   all, and nothing about the bias is visible by looking at the solid.
   Needs: npm install
   Run: node tests/shape-fairness.js [rolls-per-shape] [shape ...] */
const { load } = require('./lib/shapes-from.js');
const { report } = require('./lib/stats.js');
const SHAPES = load();
function nrm(v){const l=Math.hypot(v[0],v[1],v[2]);return[v[0]/l,v[1]/l,v[2]/l];}
function faceNormal(s,f){const v=f.idx.map(i=>s.vertices[i]);
  const a=[v[1][0]-v[0][0],v[1][1]-v[0][1],v[1][2]-v[0][2]];
  const b=[v[2][0]-v[0][0],v[2][1]-v[0][1],v[2][2]-v[0][2]];
  return nrm([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]);}

const G = 2600, E = 0.3, MU = 0.36, DT = 1/120, R = 17;   /* R: circumradius, px */
const XL = 296, ZL = 96;
const rnd = n => (Math.random()*2-1)*n;
function randQ(){
  const u1=Math.random(), u2=Math.random()*2*Math.PI, u3=Math.random()*2*Math.PI,
        a=Math.sqrt(1-u1), b=Math.sqrt(u1);
  return [a*Math.sin(u2), a*Math.cos(u2), b*Math.sin(u3), b*Math.cos(u3)];  /* w,x,y,z */
}
function qmat(q){
  const w=q[0],x=q[1],y=q[2],z=q[3];
  return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
          [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
          [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
}
/* the value a settled die shows: the face whose normal points most along world
   up, except a d4, which rests ON a face and is read from the one underneath */
function readFace(shape, normals, q){
  const m = qmat(q);
  let best = -Infinity, val = null, i;
  if (shape.readFrom === 'apex') {
    /* a resting tetrahedron points a vertex up, and that vertex is the roll */
    for (i = 0; i < shape.vertices.length; i++) {
      const v = nrm(shape.vertices[i]);
      const up = m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2];
      if (up > best) { best = up; val = shape.vertexValues[i]; }
    }
    return { val, align: best };
  }
  for (i = 0; i < normals.length; i++) {
    const n = normals[i];
    const up = m[1][0]*n[0] + m[1][1]*n[1] + m[1][2]*n[2];
    if (up > best) { best = up; val = shape.faces[i].value; }
  }
  return { val, align: best };
}

async function run(sides, rolls) {
  const C = await import('cannon-es');
  const shape = SHAPES[sides];
  const normals = shape.faces.map(f => faceNormal(shape, f));
  const verts = shape.vertices.map(v => new C.Vec3(v[0]*R, v[1]*R, v[2]*R));
  const faces = shape.faces.map(f => f.idx.slice());

  const vals = [];
  let settled = 0, cocked = 0, attempts = 0;

  while (vals.length < rolls) {
    const world = new C.World({ gravity: new C.Vec3(0,-G,0) });
    world.broadphase = new C.NaiveBroadphase();
    world.solver.iterations = 14;
    world.allowSleep = true;
    const mat = new C.Material('d');
    world.addContactMaterial(new C.ContactMaterial(mat, mat, { friction: MU, restitution: E }));
    world.defaultContactMaterial.friction = MU;
    world.defaultContactMaterial.restitution = E;
    for (const pl of [[[0,1,0],[0,0,0],[1,0,0],-Math.PI/2],
                      [[1,0,0],[-XL,0,0],[0,1,0],Math.PI/2],
                      [[-1,0,0],[XL,0,0],[0,1,0],-Math.PI/2],
                      [[0,0,1],[0,0,-ZL],[0,1,0],0],
                      [[0,0,-1],[0,0,ZL],[0,1,0],Math.PI]]) {
      const b = new C.Body({ mass: 0, shape: new C.Plane(), material: mat });
      b.position.set(pl[1][0], pl[1][1], pl[1][2]);
      b.quaternion.setFromAxisAngle(new C.Vec3(pl[2][0],pl[2][1],pl[2][2]), pl[3]);
      world.addBody(b);
    }
    const hull = new C.ConvexPolyhedron({ vertices: verts, faces: faces });
    const q = randQ();
    const body = new C.Body({ mass: 1, shape: hull, material: mat,
      allowSleep: true, sleepSpeedLimit: 2, sleepTimeLimit: 0.2 });
    body.position.set(rnd(XL-60), 150+Math.random()*170, rnd(ZL-30));
    body.velocity.set(rnd(170), -260-Math.random()*160, rnd(130));
    body.angularVelocity.set(rnd(15), rnd(15), rnd(15));
    body.quaternion.set(q[1], q[2], q[3], q[0]);
    world.addBody(body);

    let steps = 0;
    const still = () => body.sleepState === C.Body.SLEEPING ||
                        (body.velocity.length() < 1.5 && body.angularVelocity.length() < 1.5);
    while (steps < 3000 && !still()) { world.step(DT); steps++; }
    attempts++;
    if (!still()) continue;
    const bq = body.quaternion;
    const r = readFace(shape, normals, [bq.w, bq.x, bq.y, bq.z]);
    /* a die wedged against a wall reads a face that is not really up */
    if (r.align < (shape.readFrom === 'apex' ? 0.80 : 0.86)) { cocked++; continue; }
    settled++;
    vals.push(r.val);
  }
  return { sides, vals, settled, cocked, attempts };
}

(async () => {
  const N = parseInt(process.argv[2], 10) || 3000;
  const which = process.argv.slice(3).map(Number).filter(Boolean);
  const list = which.length ? which : [4, 6, 8, 10, 12, 20];
  const rows = [];
  for (const sides of list) {
    const t = Date.now();
    const r = await run(sides, N);
    const rep = report('d' + sides, r.vals);
    /* chi-square degrees of freedom differ per shape, so judge each on its own p */
    rows.push({ rep, r, secs: ((Date.now()-t)/1000).toFixed(1) });
  }
  console.log('');
  console.log('shape   rolls   cocked    chi2    df      p     mean   expected   worst face');
  console.log('-'.repeat(82));
  let bad = [];
  for (const { rep, r } of rows) {
    const s = SHAPES[r.sides], k = s.sides, df = k - 1;
    const exp = rep.n / k, counts = {};
    r.vals.forEach(v => counts[v] = (counts[v]||0) + 1);
    let chi = 0;
    const labels = s.readFrom === 'apex' ? s.vertexValues : s.faces.map(f => f.value);
    for (const lv of labels) chi += Math.pow((counts[lv]||0) - exp, 2) / exp;
    /* upper tail for arbitrary df */
    const p = dfTail(chi, df);
    const mean = r.vals.reduce((a,b)=>a+b,0)/r.vals.length;
    const expMean = (1 + r.sides) / 2;
    const worst = Math.max(...labels.map(lv => Math.abs((counts[lv]||0)/rep.n - 1/k)));
    console.log(('d'+r.sides).padEnd(7) + String(rep.n).padStart(6) +
      String(r.cocked).padStart(9) + chi.toFixed(2).padStart(8) + String(df).padStart(6) +
      p.toFixed(3).padStart(7) + mean.toFixed(3).padStart(8) +
      expMean.toFixed(3).padStart(11) + ((worst*100).toFixed(2)+' pt').padStart(13));
    if (p < 0.01) bad.push('d' + r.sides);
  }
  console.log('-'.repeat(82));
  console.log(bad.length ? 'BIASED: ' + bad.join(', ') : 'every shape consistent with fair');
  process.exit(bad.length ? 1 : 0);
})();

/* chi-square upper tail for any df, via the regularised incomplete gamma */
function dfTail(x, df) {
  function gln(z){const c=[76.18009172947146,-86.50532032941677,24.01409824083091,
    -1.231739572450155,.1208650973866179e-2,-.5395239384953e-5];let y=z,t=z+5.5;
    t-=(z+.5)*Math.log(t);let s=1.000000000190015;for(let j=0;j<6;j++)s+=c[j]/++y;
    return -t+Math.log(2.5066282746310005*s/z);}
  const a = df/2, xx = x/2;
  if (xx <= 0) return 1;
  if (xx < a+1) {
    let ap=a, sum=1/a, del=sum;
    for(let n=1;n<800;n++){ap++;del*=xx/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*1e-15)break;}
    return 1 - sum*Math.exp(-xx+a*Math.log(xx)-gln(a));
  }
  let b=xx+1-a, c2=1e300, d=1/b, h=d;
  for(let i=1;i<800;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;
    c2=b+an/c2;if(Math.abs(c2)<1e-300)c2=1e-300;d=1/d;const del=d*c2;h*=del;
    if(Math.abs(del-1)<1e-15)break;}
  return Math.exp(-xx+a*Math.log(xx)-gln(a))*h;
}
