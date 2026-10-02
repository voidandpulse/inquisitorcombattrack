/* Geometry checks for the polyhedral dice. A solid that is slightly non-planar
   or wound inside out still renders and still rolls -- it just rolls wrong --
   so these run before anything is drawn.
   Run: node tests/shape-validate.js */
const { load } = require('./lib/shapes-from.js');
const SHAPES = load();
function nrm(v){const l=Math.hypot(v[0],v[1],v[2]);return[v[0]/l,v[1]/l,v[2]/l];}
function faceNormal(s,f){const v=f.idx.map(i=>s.vertices[i]);
  const a=[v[1][0]-v[0][0],v[1][1]-v[0][1],v[1][2]-v[0][2]];
  const b=[v[2][0]-v[0][0],v[2][1]-v[0][1],v[2][2]-v[0][2]];
  return nrm([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]);}
function faceCentre(s,f){const v=f.idx.map(i=>s.vertices[i]);
  return [v.reduce((t,p)=>t+p[0],0)/v.length, v.reduce((t,p)=>t+p[1],0)/v.length,
          v.reduce((t,p)=>t+p[2],0)/v.length];}
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL ' + msg); } };

for (const k of [4, 6, 8, 10, 12, 20]) {
  const s = SHAPES[k];
  console.log('d' + k);
  const normals = s.faces.map(f => faceNormal(s, f));
  const centres = s.faces.map(f => faceCentre(s, f));

  /* 1. every face is planar: all its vertices at the same distance along its normal */
  let maxFlat = 0;
  s.faces.forEach((f, i) => {
    const d = f.idx.map(vi => s.vertices[vi][0]*normals[i][0] +
                              s.vertices[vi][1]*normals[i][1] +
                              s.vertices[vi][2]*normals[i][2]);
    maxFlat = Math.max(maxFlat, Math.max(...d) - Math.min(...d));
  });
  ok(maxFlat < 1e-9, 'faces not planar, worst spread ' + maxFlat.toExponential(2));

  /* 2. winding: normal points away from the centre, so the outside is outside */
  let minOut = Infinity;
  s.faces.forEach((f, i) => {
    minOut = Math.min(minOut, centres[i][0]*normals[i][0] +
                              centres[i][1]*normals[i][1] + centres[i][2]*normals[i][2]);
  });
  ok(minOut > 0, 'some face winds inward (min centre-dot-normal ' + minOut.toFixed(4) + ')');

  /* 3. convex: no vertex lies outside any face plane */
  let worstBulge = 0;
  s.faces.forEach((f, i) => {
    const d0 = centres[i][0]*normals[i][0] + centres[i][1]*normals[i][1] + centres[i][2]*normals[i][2];
    s.vertices.forEach(v => {
      worstBulge = Math.max(worstBulge,
        (v[0]*normals[i][0] + v[1]*normals[i][1] + v[2]*normals[i][2]) - d0);
    });
  });
  ok(worstBulge < 1e-9, 'not convex, a vertex sits ' + worstBulge.toExponential(2) + ' outside a face');

  /* 4. opposite faces sum to sides+1. A tetrahedron has no parallel face pairs,
        so the rule does not apply to it. */
  let bad = [];
  if (k !== 4) {
  s.faces.forEach((f, i) => {
    let best = -1, dot = 2;
    s.faces.forEach((g, j) => {
      if (i === j) return;
      const d = normals[i][0]*normals[j][0] + normals[i][1]*normals[j][1] + normals[i][2]*normals[j][2];
      if (d < dot) { dot = d; best = j; }
    });
    const sum = f.value + s.faces[best].value;
    if (sum !== s.sides + 1) bad.push(f.value + '+' + s.faces[best].value + '=' + sum);
  });
  }
  ok(bad.length === 0, 'opposite faces do not sum to ' + (s.sides+1) + ': ' + bad.slice(0,6).join(' '));

  /* 5. every face the same distance from the centre. This is the property that
        makes a die fair -- each face is equally stable to rest on -- and it holds
        for all six solids because each is face-transitive. Vertex distances are
        NOT uniform on a d10, which has two vertex orbits, so checking those
        would fail on a perfectly good die. */
  const inr = s.faces.map((f, i) => centres[i][0]*normals[i][0] +
                                    centres[i][1]*normals[i][1] + centres[i][2]*normals[i][2]);
  const cSpread = (Math.max(...inr) - Math.min(...inr)) / (inr.reduce((a,b)=>a+b)/inr.length);
  ok(cSpread < 1e-9, 'faces not equidistant from centre, spread ' + (cSpread*100).toFixed(4) + '%');

  console.log('  planar ' + maxFlat.toExponential(1) +
              '   face distance spread ' + (cSpread*100).toFixed(4) + '%' +
              '   faces ' + s.faces.length);
}
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nall shapes valid');
process.exit(fails ? 1 : 0);
