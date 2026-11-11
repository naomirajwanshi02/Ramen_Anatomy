// The bowl of shoyu ramen, built procedurally in centimetres (y up, bowl foot at y = 0).
//
// Every part is built twice: where it sits in the bowl (A) and where it floats in
// the exploded view (B), after the exploded illustration. Rigid parts (bowl, broth,
// chashu, egg, nori, menma, enoki) move as a whole; the bendy ones (noodles, tare,
// wood ear) are one mesh with a morph target, so the GPU bends every strand from
// the bowl shape into the floating shape; the small repeated ones (oil, green
// onion, tare drops) are instanced and moved one by one.

import * as THREE from 'three';
import * as TX from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = (x = 0, y = 0, z = 0, order = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
const clamp = THREE.MathUtils.clamp;

// ------------------------------------------------------------------ bowl dimensions (cm)
// A standard ramen donburi: about 23 cm across, 9 cm deep, on an 8.5 cm foot ring.
export const RIM_Y = 9.3;
export const FILL_Y = 7.0;      // broth surface
const WALL = 0.45;
const outerR = (y) => { const t = clamp((y - 1) / 8, 0, 1); return 4.5 + 7.0 * (1 - Math.pow(1 - t, 1.5)); };
export const innerR = (y) => outerR(y) - WALL;

// ------------------------------------------------------------------ helpers
function resample(poly, n){
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + poly[i].distanceTo(poly[i - 1]));
  const total = L[L.length - 1], out = [];
  let k = 1;
  for (let i = 0; i < n; i++){
    const s = total * i / (n - 1);
    while (k < L.length - 1 && L[k] < s) k++;
    const t = (s - L[k - 1]) / Math.max(1e-9, L[k] - L[k - 1]);
    out.push(poly[k - 1].clone().lerp(poly[k], clamp(t, 0, 1)));
  }
  return { pts: out, L, total };
}

// Parallel-transport frames along a polyline (no flips, unlike Frenet).
function frames(pts, ref){
  const n = pts.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize());
  let r = ref.clone();
  if (Math.abs(r.dot(T[0])) > 0.95) r = Math.abs(T[0].x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1);
  N.push(r.sub(T[0].clone().multiplyScalar(r.dot(T[0]))).normalize());
  for (let i = 1; i < n; i++){
    const m = N[i - 1].clone();
    m.sub(T[i].clone().multiplyScalar(m.dot(T[i])));
    if (m.lengthSq() < 1e-8) m.copy(N[i - 1]);
    N.push(m.normalize());
  }
  for (let i = 0; i < n; i++) B.push(T[i].clone().cross(N[i]).normalize());
  return { T, N, B };
}

// One mesh of many tubes with elliptical cross-sections, each tube given in two
// shapes (A and B) with the same number of points: B becomes the morph target.
function morphTubes(list, radial, material){
  const nv = list.reduce((s, t) => s + t.A.length * radial, 0);
  const ni = list.reduce((s, t) => s + (t.A.length - 1) * radial * 6, 0);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const posB = new Float32Array(nv * 3), nrmB = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  const p = V(), q = V(), c = new THREE.Color();
  const fill = (pts, sec, ref, taper, P, Nm) => {
    const F = frames(pts, ref);
    const n = pts.length;
    for (let i = 0; i < n; i++){
      const u = i / (n - 1);
      const k = taper ? Math.min(1, 0.3 + 0.7 * Math.sin(Math.min(1, Math.min(u, 1 - u) / taper) * Math.PI / 2)) : 1;
      const a = sec[0] * k, b = sec[1] * k;
      for (let j = 0; j < radial; j++){
        const th = j / radial * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        p.copy(pts[i]).addScaledVector(F.N[i], cs * a).addScaledVector(F.B[i], sn * b);
        q.copy(F.N[i]).multiplyScalar(cs / sec[0]).addScaledVector(F.B[i], sn / sec[1]).normalize();
        const o = (vo + i * radial + j) * 3;
        P[o] = p.x; P[o + 1] = p.y; P[o + 2] = p.z;
        Nm[o] = q.x; Nm[o + 1] = q.y; Nm[o + 2] = q.z;
      }
    }
  };
  for (const t of list){
    fill(t.A, t.secA, t.refA || V(0, 1, 0), t.taper, pos, nrm);
    fill(t.B, t.secB, t.refB || V(0, 1, 0), t.taper, posB, nrmB);
    c.set(t.color);
    const n = t.A.length;
    for (let i = 0; i < n * radial; i++){ const o = (vo + i) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
    for (let i = 0; i < n - 1; i++){
      for (let j = 0; j < radial; j++){
        const a = vo + i * radial + j, b = vo + i * radial + (j + 1) % radial, cc = a + radial, d = b + radial;
        idx[io++] = a; idx[io++] = b; idx[io++] = cc;
        idx[io++] = b; idx[io++] = d; idx[io++] = cc;
      }
    }
    vo += n * radial;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.morphAttributes.position = [new THREE.BufferAttribute(posB, 3)];
  g.morphAttributes.normal = [new THREE.BufferAttribute(nrmB, 3)];
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.morphTargetInfluences = [0];
  return m;
}

// A smooth path through control points, resampled to n evenly spaced points.
function path(cps, n){
  const curve = new THREE.CatmullRomCurve3(cps, false, 'centripetal');
  return curve.getSpacedPoints(n - 1);
}
// Wavy ("chijire") offset along a path.
function wave(pts, amp, cycles, phase, ref){
  const F = frames(pts, ref);
  const n = pts.length;
  return pts.map((p, i) => {
    const w = phase + i / (n - 1) * cycles * Math.PI * 2;
    return p.clone().addScaledVector(F.N[i], Math.sin(w) * amp).addScaledVector(F.B[i], Math.cos(w * 0.5) * amp * 0.5);
  });
}

const pose = (p, q = new THREE.Quaternion(), s = V(1, 1, 1)) => ({ p, q, s: typeof s === 'number' ? V(s, s, s) : s });

// ------------------------------------------------------------------ materials
function mats(){
  const M = {};
  M.noodle = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#fff1c8') });
  M.tare = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
  M.woodear = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.35, side: THREE.DoubleSide });
  M.broth = new THREE.MeshPhysicalMaterial({ color: '#bf5a18', roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 0.55, transparent: true, opacity: 0.9, ior: 1.34, specularIntensity: 1, depthWrite: true });
  M.brothTop = M.broth.clone(); M.brothTop.map = TX.brothTexture(); M.brothTop.color.set('#ffffff'); M.brothTop.opacity = 0.96;
  M.oil = new THREE.MeshPhysicalMaterial({ color: '#f3b53f', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.88, emissive: '#7a3d00', emissiveIntensity: 0.35, ior: 1.47 });
  M.tareDrop = new THREE.MeshPhysicalMaterial({ color: '#4a2412', roughness: 0.1, clearcoat: 1 });
  M.onion = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, sheen: 0.2 });
  M.nori = [0, 1].map((i) => new THREE.MeshStandardMaterial({ map: TX.noriTexture(2 + i * 5), roughness: 0.78, metalness: 0 }));
  M.menma = new THREE.MeshPhysicalMaterial({ map: TX.menmaTexture(), roughness: 0.35, clearcoat: 0.4, envMapIntensity: 0.55, clearcoatRoughness: 0.2 });
  M.chashuSide = new THREE.MeshPhysicalMaterial({ map: TX.chashuSide(), roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.5 });
  M.chashuFaces = [3, 7, 12].map((s) => new THREE.MeshPhysicalMaterial({ map: TX.chashuFace(s), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.45 }));
  M.eggFace = new THREE.MeshPhysicalMaterial({ map: TX.eggFace(), roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.6 });
  M.eggShell = new THREE.MeshPhysicalMaterial({ map: TX.eggShell(), roughness: 0.3, clearcoat: 0.5, envMapIntensity: 0.6, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color('#ffe9c8') });
  M.enoki = new THREE.MeshPhysicalMaterial({ color: '#f4eedc', roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
  M.enokiCap = new THREE.MeshPhysicalMaterial({ color: '#efe3c4', roughness: 0.45, sheen: 0.5 });
  M.enokiRoot = new THREE.MeshPhysicalMaterial({ color: '#c9b08a', roughness: 0.8 });
  return M;
}

// ------------------------------------------------------------------ the bowl
function buildBowl(){
  const poly = [];
  const add = (r, y) => poly.push(V(r, y, 0));
  add(0, 0.5); add(3.3, 0.5);                    // underside, inside the foot ring
  add(3.5, 0.38); add(3.62, 0.08); add(3.78, 0); add(4.28, 0); add(4.42, 0.06); add(4.5, 0.3); // foot ring
  add(4.5, 0.86);
  const outerStart = poly.length;
  for (let y = 1.0; y <= 9.0001; y += 0.1) add(outerR(y), y);
  const outerEnd = poly.length - 1;
  // rolled lip
  for (let k = 1; k < 12; k++){
    const a = k / 12 * Math.PI;
    add(outerR(9) - WALL / 2 + Math.cos(a) * (WALL / 2), 9.0 + Math.sin(a) * 0.3);
  }
  const innerStart = poly.length;
  for (let y = 9.0; y >= 1.95; y -= 0.1) add(innerR(y), y);
  add(innerR(1.95) - 0.6, 1.66); add(innerR(1.95) - 1.6, 1.58); add(0, 1.56);
  // resample by arc length so the texture's v is true distance along the profile
  const { pts, L, total } = resample(poly, 340);
  const vAt = (i) => L[i] / total;
  const outerV = (y) => vAt(outerStart + Math.round((y - 1) / 0.1));
  const innerV = (y) => vAt(innerStart + Math.round((9 - y) / 0.1));
  const map = TX.bowlTexture({
    outerBand: [outerV(5.9), outerV(8.55)],
    innerBand: [innerV(8.9), innerV(7.3)],
    footLines: [[outerV(1.35), 0.0035], [outerV(1.85), 0.0018], [vAt(6), 0.004]],
    rimV: vAt(Math.round((outerEnd + innerStart) / 2)),
  });
  const geo = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), 160);
  const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.08, specularIntensity: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ------------------------------------------------------------------ broth
function buildBroth(M){
  const g = new THREE.Group();
  const prof = [];
  prof.push(new THREE.Vector2(0, 1.6));
  prof.push(new THREE.Vector2(innerR(1.95) - 1.6, 1.62));
  prof.push(new THREE.Vector2(innerR(1.95) - 0.6, 1.7));
  for (let y = 1.98; y <= FILL_Y + 1e-4; y += 0.1) prof.push(new THREE.Vector2(innerR(y) - 0.05, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), M.broth);
  const top = new THREE.Mesh(new THREE.CircleGeometry(innerR(FILL_Y) - 0.05, 128), M.brothTop);
  top.rotation.x = -Math.PI / 2; top.position.y = FILL_Y;
  body.renderOrder = 1; top.renderOrder = 2;
  g.add(body, top);
  return g;
}

// ------------------------------------------------------------------ noodles
function buildNoodles(M, rand){
  const list = [];
  const n = 90;
  const COUNT = 84;
  const spine = (t) => V(1.9 * Math.sin(Math.PI * (1.25 * t - 0.12)) - 0.2, 14.2 + 23.2 * t, 0.8 * Math.sin(Math.PI * t));
  for (let s = 0; s < COUNT; s++){
    // A: a loop that rises from the bottom, lies along the surface and dives again
    const a = rand() * Math.PI * 2, span = (0.8 + rand() * 1.7) * (rand() < 0.5 ? -1 : 1);
    const r1 = 3.2 + rand() * 5.2;
    const pol = (ang, r, y) => { const rr = Math.min(r, innerR(y) - 0.45); return V(Math.cos(ang) * rr, y, Math.sin(ang) * rr); };
    const cps = [pol(a - 0.5, 1.5 + rand() * 2, 2.3), pol(a - 0.2, r1 * 0.7, FILL_Y - 1.3)];
    for (let k = 0; k <= 4; k++) cps.push(pol(a + span * k / 4, r1 + Math.sin(k * 1.7 + s) * 0.7, FILL_Y + 0.02 + rand() * 0.32));
    cps.push(pol(a + span + 0.2 * Math.sign(span), r1 * 0.75, FILL_Y - 1.4), pol(a + span + 0.5 * Math.sign(span), 2.4, 2.5));
    const A = wave(path(cps, n), 0.11, 16 + rand() * 6, rand() * 6, V(0, 1, 0));
    // B: one strand of the rising column, twisting, fanning at its ends; a few stray strands curl loose
    const phi = rand() * Math.PI * 2, rho = 1.65 * Math.sqrt(rand());
    const stray = s % 9 === 0 ? 1 : s % 9 === 4 ? -1 : 0;
    const Bc = [];
    for (let i = 0; i < 12; i++){
      const t = i / 11;
      const c = spine(t);
      const tw = phi + t * 1.3;
      const fan = 1 + 0.9 * Math.max(0, 0.15 - t) / 0.15 + 0.5 * Math.max(0, t - 0.88) / 0.12;
      let ox = Math.cos(tw) * rho * fan, oz = Math.sin(tw) * rho * fan * 0.75;
      if (stray === 1 && t > 0.55){ const k = (t - 0.55) / 0.45; ox += Math.cos(phi) * k * k * 6; oz += Math.sin(phi) * k * 2.5; c.y -= k * k * 3; }
      if (stray === -1 && t < 0.4){ const k = (0.4 - t) / 0.4; ox += Math.cos(phi) * k * k * 5; c.y += k * 1.5; }
      Bc.push(V(c.x + ox, c.y, c.z + oz));
    }
    const B = wave(path(Bc, n), 0.12, 16 + rand() * 6, rand() * 6, V(1, 0, 0));
    const col = new THREE.Color().setHSL(0.115 + rand() * 0.015, 0.78 + rand() * 0.12, 0.58 + rand() * 0.07);
    list.push({ A, B, secA: [0.095, 0.095], secB: [0.1, 0.1], refA: V(0, 1, 0), refB: V(1, 0, 0), taper: 0.02, color: col });
  }
  return morphTubes(list, 7, M.noodle);
}

// ------------------------------------------------------------------ tare: a dark ribbon swirling round the noodles
function buildTare(M, rand){
  const n = 140;
  const A = [], B = [];
  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    // A: a thin dark pool spiralling on the bottom of the bowl, under the broth
    const a = t * Math.PI * 3.2, r = 0.6 + t * 2.6;
    A.push(V(Math.cos(a) * r, 1.82 + t * 0.05, Math.sin(a) * r));
    // B: a broad ribbon looping once and a bit round the column (after the illustration)
    const b = -0.6 + t * Math.PI * 2.25;
    B.push(V(Math.cos(b) * 9.6 - 0.4, 19.5 + Math.sin(b * 2 + 0.6) * 1.4 + (t - 0.5) * 2.4, Math.sin(b) * 4.8));
  }
  const list = [{ A, B, secA: [0.07, 0.55], secB: [0.85, 0.24], refA: V(0, 1, 0), refB: V(0, 1, 0), taper: 0.12, color: new THREE.Color('#4a1f0c') }];
  // a few thinner wisps
  for (let w = 0; w < 3; w++){
    const Aw = [], Bw = [];
    const o = rand() * 6, len = 0.25 + rand() * 0.2;
    for (let i = 0; i < n; i++){
      const t = i / (n - 1);
      const a = o + t * Math.PI * 1.5, r = 1.2 + t * 1.8 + w * 0.4;
      Aw.push(V(Math.cos(a) * r, 1.78, Math.sin(a) * r));
      const b = o + t * Math.PI * 2 * len;
      Bw.push(V(Math.cos(b) * (8 + w * 2.2) - 0.4, 22 + w * 3 + Math.sin(t * 9 + w) * 0.8, Math.sin(b) * (4 + w)));
    }
    list.push({ A: Aw, B: Bw, secA: [0.04, 0.25], secB: [0.32, 0.12], taper: 0.3, color: new THREE.Color('#4a2010') });
  }
  return morphTubes(list, 10, M.tare);
}

// ------------------------------------------------------------------ wood ear: thin crinkled strips
function buildWoodEar(M, rand){
  const list = [], n = 46;
  for (let s = 0; s < 16; s++){
    // A: lying in a little pile on the surface, back-left between egg and noodles
    const cx = -3.2 + (rand() - 0.5) * 2.6, cz = -5.2 + (rand() - 0.5) * 2.2, ang = rand() * Math.PI;
    const len = 2.6 + rand() * 1.8;
    const Ac = [];
    for (let i = 0; i < 6; i++){
      const t = i / 5 - 0.5;
      Ac.push(V(cx + Math.cos(ang) * t * len + Math.sin(i * 2.1 + s) * 0.25, FILL_Y + 0.12 + rand() * 0.25 + s * 0.012, cz + Math.sin(ang) * t * len + Math.cos(i * 1.7 + s) * 0.25));
    }
    // B: zig-zag squiggles floating all round the column (the dark red strokes in the illustration)
    const side = s % 2 === 0 ? -1 : 1;
    const by = 18 + rand() * 36, bx = side * (8.5 + rand() * 3.5), bz = (rand() - 0.5) * 6;
    const blen = 3.5 + rand() * 3, tilt = (rand() - 0.5) * 1.6;
    const Bc = [];
    for (let i = 0; i < 7; i++){
      const t = i / 6 - 0.5;
      Bc.push(V(bx + Math.sin(tilt) * t * blen + (i % 2 ? 0.7 : -0.7) * (0.6 + rand() * 0.6), by + Math.cos(tilt) * t * blen, bz + (rand() - 0.5) * 0.8));
    }
    const out = V(bx, 0, bz + 4).normalize();
    const col = new THREE.Color().setHSL(0.015 + rand() * 0.02, 0.6 + rand() * 0.15, 0.1 + rand() * 0.05);
    list.push({ A: wave(path(Ac, n), 0.06, 5, rand() * 6, V(0, 1, 0)), B: path(Bc, n), secA: [0.05, 0.3], secB: [0.06, 0.3], refA: V(0, 1, 0), refB: out, taper: 0.15, color: col });
  }
  return morphTubes(list, 8, M.woodear);
}

// ------------------------------------------------------------------ chashu
function chashuSlice(M, i, rand){
  const pts = [];
  const rx = 3.55 + rand() * 0.25, ry = 3.0 + rand() * 0.25;
  const k1 = rand() * 6, k2 = rand() * 6;
  for (let a = 0; a < 72; a++){
    const t = a / 72 * Math.PI * 2;
    const w = 1 + 0.035 * Math.sin(t * 3 + k1) + 0.02 * Math.sin(t * 7 + k2);
    pts.push(new THREE.Vector2(Math.cos(t) * rx * w, Math.sin(t) * ry * w));
  }
  const shape = new THREE.Shape(pts);
  const depth = 0.42;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.14, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  // planar UVs on the two faces so the spiral sits centred on the slice
  const Rx = rx * 1.06, Ry = ry * 1.06; // the outline lands just inside the texture's circle
  const uv = g.attributes.uv, pos = g.attributes.position;
  const grp = g.groups[0];
  const index = g.index;
  const faceVerts = new Set();
  for (let j = grp.start; j < grp.start + grp.count; j++) faceVerts.add(index ? index.getX(j) : j);
  for (const v of faceVerts) uv.setXY(v, pos.getX(v) / (2 * Rx) + 0.5, pos.getY(v) / (2 * Ry) + 0.5);
  // side UVs: wrap the noise strip round the edge
  for (let v = 0; v < pos.count; v++){
    if (faceVerts.has(v)) continue;
    const a = Math.atan2(pos.getY(v), pos.getX(v));
    uv.setXY(v, (a / (Math.PI * 2) + 0.5) * 6, pos.getZ(v) + 0.5);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, [M.chashuFaces[i], M.chashuSide]);
}

// ------------------------------------------------------------------ egg (half, cut lengthwise)
function buildEgg(M){
  const g = new THREE.Group();
  const ax = 2.05, ay = 2.75, az = 2.0;
  const shape = (x, y) => 1 - 0.1 * (y / ay); // narrower at the pointed end
  const shell = new THREE.SphereGeometry(1, 64, 40, Math.PI, Math.PI);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++){
    const y = p.getY(i) * ay, k = shape(0, y);
    p.setXYZ(i, p.getX(i) * ax * k, y, p.getZ(i) * az * k);
  }
  shell.computeVertexNormals();
  g.add(new THREE.Mesh(shell, M.eggShell));
  // the cut face, a polar grid so the yolk can dome a little
  const face = new THREE.RingGeometry(0.0001, 1, 96, 24);
  const f = face.attributes.position;
  for (let i = 0; i < f.count; i++){
    const x = f.getX(i), y = f.getY(i), r = Math.hypot(x, y * 0.98);
    const Y = y * ay, k = shape(0, Y);
    const dome = 0.16 * Math.pow(Math.max(0, 1 - r / 0.55), 1.6) + 0.02 * (1 - r);
    f.setXYZ(i, x * ax * k, Y, dome);
  }
  // map the texture so its yolk circle (centre 0.5, 0.48 in canvas) lands on the dome
  const fu = face.attributes.uv;
  for (let i = 0; i < f.count; i++) fu.setXY(i, f.getX(i) / (2 * ax) + 0.5, f.getY(i) / (2 * ay) * 1.0 + 0.5 + 0.02);
  face.computeVertexNormals();
  g.add(new THREE.Mesh(face, M.eggFace));
  return g;
}

// ------------------------------------------------------------------ nori
function noriSheet(M, i){
  const w = 6.2, h = 8.2;
  const g = new THREE.BoxGeometry(w, h, 0.06, 16, 16, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++){
    const x = p.getX(k), y = p.getY(k);
    p.setZ(k, p.getZ(k) + 0.35 * Math.sin((x / w + 0.5) * Math.PI) * (0.6 + 0.4 * y / h) + 0.12 * Math.sin(y * 0.9 + i));
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, M.nori[i]);
}

// ------------------------------------------------------------------ menma
function menmaStrip(M, rand){
  const g = new THREE.BoxGeometry(0.85 + rand() * 0.2, 0.38, 4.8 + rand() * 0.8, 2, 1, 8);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++){ const z = p.getZ(k); p.setY(k, p.getY(k) + 0.08 * Math.sin(z * 1.1)); p.setX(k, p.getX(k) * (1 - 0.06 * Math.abs(z) / 3)); }
  g.computeVertexNormals();
  return new THREE.Mesh(g, M.menma);
}

// ------------------------------------------------------------------ enoki
function buildEnoki(M, rand){
  const g = new THREE.Group();
  const list = [];
  const capGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const caps = new THREE.InstancedMesh(capGeo, M.enokiCap, 26);
  for (let s = 0; s < 26; s++){
    const a = rand() * Math.PI * 2, spread = 0.15 + rand() * 0.42;
    const len = 6 + rand() * 2.2;
    const dir = V(Math.cos(a) * Math.sin(spread), Math.cos(spread), Math.sin(a) * Math.sin(spread) * 0.3);
    const bend = V(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(0.9);
    const base = V((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.4);
    const pts = path([base, base.clone().addScaledVector(dir, len * 0.35), base.clone().addScaledVector(dir, len * 0.7).add(bend.clone().multiplyScalar(0.5)), base.clone().addScaledVector(dir, len).add(bend)], 22);
    list.push({ A: pts, B: pts, secA: [0.11, 0.11], secB: [0.11, 0.11], refA: V(1, 0, 0), refB: V(1, 0, 0), taper: 0, color: new THREE.Color('#f6f1e2') });
    const tip = pts[pts.length - 1], tan = tip.clone().sub(pts[pts.length - 3]).normalize();
    const m = new THREE.Matrix4().compose(tip, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tan), V(0.3, 0.22, 0.3));
    caps.setMatrixAt(s, m);
  }
  const stems = morphTubes(list, 6, M.enoki);
  stems.material = M.enoki;
  stems.morphTargetInfluences = [0];
  const root = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 1.0, 24), M.enokiRoot);
  root.position.y = -0.3;
  g.add(stems, caps, root);
  return g;
}

// ------------------------------------------------------------------ assembly
export function buildRamen(){
  const rand = TX.rng(42);
  const M = mats();
  const model = new THREE.Group();
  model.name = 'ramen';
  const parts = {};
  const rigid = [], morph = [], inst = [];

  const part = (id, delay) => {
    const root = new THREE.Group();
    root.userData.part = id;
    model.add(root);
    parts[id] = { id, root, delay, pin: V(), focus: 0 };
    return parts[id];
  };
  const addRigid = (pt, obj, A, B) => { pt.root.add(obj); rigid.push({ pt, obj, A, B }); };

  // 1 · bowl: stays put
  const bowl = part('bowl', 0);
  bowl.root.add(buildBowl());
  bowl.pin.set(11.6, 6.5, 2);

  // 2 · broth: lifts out of the bowl as one golden body
  const broth = part('broth', 0.02);
  addRigid(broth, buildBroth(M), pose(V()), pose(V(0, 5.6, 0)));
  broth.pin.set(-10.5, 11.5, 2);

  // 3 · tare
  const tare = part('tare', 0.12);
  const tareMesh = buildTare(M, rand);
  tare.root.add(tareMesh); morph.push({ pt: tare, mesh: tareMesh });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), M.tareDrop, 12);
  const dA = [], dB = [];
  for (let i = 0; i < 12; i++){
    const a = rand() * Math.PI * 2;
    dA.push(pose(V(Math.cos(a) * 1.5, 1.8, Math.sin(a) * 1.5), new THREE.Quaternion(), 0.001));
    const r = 0.18 + rand() * 0.32;
    dB.push(pose(V(Math.cos(a) * (10 + rand() * 2.5), 17 + rand() * 6, Math.sin(a) * 5.5), new THREE.Quaternion(), r));
  }
  tare.root.add(drops); inst.push({ pt: tare, mesh: drops, A: dA, B: dB });
  tare.pin.set(-10.2, 19.5, 1);

  // 4 · aromatic oil: flat golden coins on the soup, round golden drops when apart
  const oil = part('oil', 0.16);
  const oilMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 18), M.oil, 30);
  const oA = [], oB = [];
  for (let i = 0; i < 30; i++){
    const a = rand() * Math.PI * 2, r = 1.5 + Math.sqrt(rand()) * 7.8, s = 0.18 + rand() * 0.42;
    oA.push(pose(V(Math.cos(a) * r, FILL_Y + 0.02, Math.sin(a) * r), new THREE.Quaternion(), V(s, 0.035, s)));
    const b = rand() * Math.PI * 2, R = 4.5 + rand() * 4.5, S = 0.35 + rand() * 0.75;
    oB.push(pose(V(Math.cos(b) * R, 14.5 + rand() * 20, Math.sin(b) * R * 0.7), new THREE.Quaternion(), V(S, S * 0.94, S)));
  }
  oil.root.add(oilMesh); inst.push({ pt: oil, mesh: oilMesh, A: oA, B: oB });
  oil.pin.set(7.2, 15.5, 4);

  // 5 · noodles
  const noodles = part('noodles', 0.2);
  const nm = buildNoodles(M, rand);
  noodles.root.add(nm); morph.push({ pt: noodles, mesh: nm });
  noodles.pin.set(2.6, 27, 2.2);

  // 6 · chashu: three slices fanned at the front, leaning on the noodles
  const chashu = part('chashu', 0.3);
  // [x, y, z, tilt of the face toward the front, yaw, spin in its own plane]
  const cA = [[-3.3, FILL_Y + 0.85, 5.0, 0.5, 0.3, 0.3], [-0.1, FILL_Y + 1.0, 5.6, 0.46, 0.0, 1.2], [3.1, FILL_Y + 0.8, 5.1, 0.5, -0.32, 2.1]];
  const cB = [[-3.6, 39.2, 0.6, 0.42, 0.12, 0.3], [0.2, 40.2, 0.0, 0.38, -0.05, 1.2], [3.9, 41.0, -0.4, 0.45, -0.1, 2.1]];
  for (let i = 0; i < 3; i++){
    const s = chashuSlice(M, i, rand);
    const [ax, ay, az, at, ay2, ar] = cA[i], [bx, by, bz, bt, by2, br] = cB[i];
    addRigid(chashu, s, pose(V(ax, ay, az), Q(-Math.PI / 2 + at, ay2, ar)), pose(V(bx, by, bz), Q(-Math.PI / 2 + bt, by2, br)));
  }
  chashu.pin.set(-7.6, 40.5, 1);

  // 7 · egg: half an egg, yolk up, at the back left; it floats up showing its yolk
  const egg = part('egg', 0.4);
  addRigid(egg, buildEgg(M), pose(V(-6.2, FILL_Y + 0.6, 0.6), Q(-Math.PI / 2 + 0.38, 0.5, 0.9)), pose(V(0.4, 48.5, 0.8), Q(-0.22, 0.05, 1.35)));
  egg.pin.set(3.6, 50, 1);

  // 8 · nori: two sheets tucked against the back-right rim
  const nori = part('nori', 0.34);
  addRigid(nori, noriSheet(M, 0), pose(V(4.9, FILL_Y + 2.2, -6.6), Q(-0.32, -0.62, 0.04)), pose(V(9.2, 37.5, -1.5), Q(-0.15, -0.35, -0.25)));
  addRigid(nori, noriSheet(M, 1), pose(V(6.4, FILL_Y + 2.0, -5.2), Q(-0.3, -0.85, -0.05)), pose(V(8.6, 31.0, -1.0), Q(-0.1, -0.45, -0.42)));
  nori.pin.set(13, 39, 0);

  // 9 · menma: a bundle of bamboo shoot strips on the right
  const menma = part('menma', 0.28);
  for (let i = 0; i < 4; i++){
    const s = menmaStrip(M, rand);
    addRigid(menma, s,
      pose(V(6.0 + i * 0.95, FILL_Y + 0.42 + (i % 2) * 0.12, 1.4 + i * 0.55), Q(0.12, -0.55, 0.05 * (i - 1.5))),
      pose(V(10.8 + i * 0.3, 23.5 + i * 1.05, 1.5 - i * 0.6), Q(0.25 + i * 0.12, -0.3 + i * 0.25, 1.1 + i * 0.1)));
  }
  menma.pin.set(13.4, 24, 0);

  // 10 · wood ear
  const woodear = part('woodear', 0.24);
  const wm = buildWoodEar(M, rand);
  woodear.root.add(wm); morph.push({ pt: woodear, mesh: wm });
  woodear.pin.set(-11.5, 31, 1.5);

  // 11 · green onions: a heap of rings in the middle, scattered like confetti when apart
  const onion = part('onion', 0.36);
  const ringProf = [[0.24, -0.09], [0.31, -0.09], [0.33, 0], [0.31, 0.09], [0.24, 0.09], [0.22, 0], [0.24, -0.09]].map(([r, y]) => new THREE.Vector2(r, y));
  const ringGeo = new THREE.LatheGeometry(ringProf, 18);
  const on = new THREE.InstancedMesh(ringGeo, M.onion, 44);
  const nA = [], nB = [];
  for (let i = 0; i < 44; i++){
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 1.9;
    const h = 1 - (r / 1.9) ** 2;
    nA.push(pose(V(0.5 + Math.cos(a) * r, FILL_Y + 0.7 + h * 1.6 + rand() * 0.3, -0.9 + Math.sin(a) * r * 0.9), Q((rand() - 0.5) * 1.2, rand() * 6, (rand() - 0.5) * 1.2), 1.3 + rand() * 0.4));
    const b = rand() * Math.PI * 2, R = 5 + rand() * 9;
    nB.push(pose(V(Math.cos(b) * R, 14 + rand() * 44, Math.sin(b) * R * 0.55), Q(rand() * 6, rand() * 6, rand() * 6), 1.3 + rand() * 0.4));
    on.setColorAt(i, new THREE.Color().setHSL(0.25 + rand() * 0.05, 0.55 + rand() * 0.2, 0.28 + rand() * 0.16));
  }
  onion.root.add(on); inst.push({ pt: onion, mesh: on, A: nA, B: nB });
  onion.pin.set(-6.5, 56, 0);

  // 12 · enoki: lying on the noodles behind the onions, standing up at the very top when apart
  const enoki = part('enoki', 0.44);
  addRigid(enoki, buildEnoki(M, rand), pose(V(0.4, FILL_Y + 0.45, -0.6), Q(-Math.PI / 2 + 0.06, 0.5, 0), 0.8), pose(V(0.6, 54.5, -0.5), Q(0, 0.2, -0.28), 1));
  enoki.pin.set(4.6, 61, 0);

  // set every part to rest
  for (const r of rigid){ r.obj.position.copy(r.A.p); r.obj.quaternion.copy(r.A.q); r.obj.scale.copy(r.A.s); }
  const tmp = new THREE.Matrix4(), tp = V(), tq = new THREE.Quaternion(), ts = V();
  for (const I of inst){ I.A.forEach((a, k) => I.mesh.setMatrixAt(k, tmp.compose(a.p, a.q, a.s))); I.mesh.instanceMatrix.needsUpdate = true; I.mesh.computeBoundingSphere(); }
  // instanced bounds must cover both poses
  for (const I of inst){
    const box = new THREE.Box3();
    for (const P of [...I.A, ...I.B]) box.expandByPoint(P.p);
    I.mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); I.mesh.boundingSphere.radius += 2;
  }

  const state = { u: -1 };
  const ease = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const progress = (pt, u) => ease(clamp((u - pt.delay) / 0.56, 0, 1));

  function setExplode(u, time = 0){
    for (const r of rigid){
      const k = progress(r.pt, u);
      r.obj.position.lerpVectors(r.A.p, r.B.p, k);
      // a little arc outward on the way so parts do not slide through each other
      r.obj.position.z += Math.sin(k * Math.PI) * 2.5;
      r.obj.quaternion.slerpQuaternions(r.A.q, r.B.q, k);
      r.obj.scale.lerpVectors(r.A.s, r.B.s, k);
    }
    for (const m of morph) m.mesh.morphTargetInfluences[0] = progress(m.pt, u);
    for (const I of inst){
      const k = progress(I.pt, u);
      for (let i = 0; i < I.A.length; i++){
        tp.lerpVectors(I.A[i].p, I.B[i].p, k); tq.slerpQuaternions(I.A[i].q, I.B[i].q, k); ts.lerpVectors(I.A[i].s, I.B[i].s, k);
        I.mesh.setMatrixAt(i, tmp.compose(tp, tq, ts));
      }
      I.mesh.instanceMatrix.needsUpdate = true;
    }
    // floating: each part bobs gently on its own beat while apart; the focused one lifts toward you
    for (const id in parts){
      const pt = parts[id];
      const k = id === 'bowl' ? 0 : progress(pt, u);
      const s = 1 + 0.07 * pt.focus;
      const pv = pt.pin;
      pt.root.scale.setScalar(s);
      pt.root.position.set(pv.x * (1 - s), pv.y * (1 - s) + Math.sin(time * 1.1 + pt.delay * 40) * 0.35 * k, pv.z * (1 - s) + 2.2 * pt.focus * k);
    }
    state.u = u;
  }
  setExplode(0);

  // where each part's label pin sits right now (model space)
  const pinOf = (id, u) => {
    const pt = parts[id];
    if (id === 'bowl') return pt.pin.clone();
    return pt.pin.clone().lerp(restPin[id], 1 - progress(pt, u));
  };
  const restPin = {
    bowl: bowl.pin, broth: V(-9.5, FILL_Y, 3), tare: V(0, 2, 0), oil: V(4, FILL_Y, 4), noodles: V(-1, FILL_Y, -3),
    chashu: V(-1, FILL_Y + 2, 6), egg: V(-6.2, FILL_Y + 1, 0.6), nori: V(5.6, FILL_Y + 5, -6), menma: V(7.5, FILL_Y + 0.8, 2.5),
    woodear: V(-3.2, FILL_Y, -5.2), onion: V(0.5, FILL_Y + 2.2, -0.9), enoki: V(-1.2, FILL_Y + 0.8, -3.2),
  };

  return { model, parts, setExplode, pinOf, materials: M };
}
