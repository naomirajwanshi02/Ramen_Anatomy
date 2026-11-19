// The AR stage: the ramen over the live camera, in one of three modes:
//
//  · 'xr'    Android Chrome (WebXR immersive-ar): the phone tracks the room; a ring
//            finds the table, a tap sets the bowl down at real size (23 cm).
//  · 'card'  iPhone and anything without WebXR: scan the ramen card once (MindAR, mind-ar 1.2.5
//            + three 0.160.0), then the bowl floats free in front of you; the card can go away.
//  · 'preview' (?preview=1, for development only): no camera, a lit backdrop.
//
// In every mode: tap the bowl to take it apart, tap a piece to read about it,
// drag to turn it, pinch to resize it.

import * as THREE from 'three';
import { buildRamen } from './ramen.js';
import { setupLook, roomLight } from './look.js';

const DIST = 60;            // preview: cm in front of the camera
const ZMIN = 0.25, ZMAX = 5; // how far you can zoom out and in
const params = new URLSearchParams(location.search);
export const TARGET_SRC = params.get('target') || './targets.mind';

const R = {
  mode: null, container: null, cb: {},
  renderer: null, scene: null, camera: null, look: null, light: null, video: null,
  ramen: null, anchor: null, spin: null, tilt: null, fit: null,
  u: 0, target: 0, selected: null, t: 0, last: 0,
  yaw: 0, yawV: 0, zoom: 1, zoomT: 1, idle: 0,
  // xr
  session: null, refSpace: null, hitSource: null, reticle: null, placed: null, isPlaced: false, placing: false,
  // card
  mindar: null, freed: false, devQ: null, q0: null, pop: 1,
  drag: { on: false, moved: 0, t0: 0, pinch: 0, zoom0: 1 },
};

// ------------------------------------------------------------------ setup (once)
export function init(container, cb){
  R.container = container; R.cb = cb;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'stage';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 1000);
  scene.add(camera);
  R.renderer = renderer; R.scene = scene; R.camera = camera;
  R.look = setupLook(renderer, scene);

  R.ramen = buildRamen();
  R.anchor = new THREE.Group(); R.spin = new THREE.Group(); R.tilt = new THREE.Group(); R.fit = new THREE.Group();
  scene.add(R.anchor); R.anchor.add(R.spin); R.spin.add(R.tilt); R.tilt.add(R.fit); R.fit.add(R.ramen.model);
  R.anchor.position.set(0, 0, -DIST);

  bindPointer(container);
  addEventListener('resize', onResize);
  onResize();
  return thumbnails();
}

export async function xrSupported(){
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { return false; }
}

// ------------------------------------------------------------------ mode: WebXR (walk round it in the room)
// Must be called straight from a tap: requestSession is the first thing it does.
export async function startXR(){
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: { root: document.body },
  });
  R.mode = 'xr'; R.session = session;
  document.body.classList.add('xr');
  const renderer = R.renderer;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  R.refSpace = renderer.xr.getReferenceSpace();
  const viewer = await session.requestReferenceSpace('viewer');
  R.hitSource = await session.requestHitTestSource({ space: viewer });

  // the bowl lives in a group set down where you tap
  R.placed = new THREE.Group();
  R.placed.visible = false;
  R.scene.add(R.placed);
  R.anchor.remove(R.spin); R.placed.add(R.spin);
  R.tilt.rotation.set(0, 0, 0);
  R.fit.position.set(0, 0, 0);

  // the placement ring: a sepia plate edge with a red tick, lying on the table
  const ring = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.105, 0.118, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff8ec', transparent: true, opacity: 0.9 }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b5452f' }));
  ring.add(disc, dot);
  ring.matrixAutoUpdate = false; ring.visible = false;
  R.scene.add(ring); R.reticle = ring;
  R.isPlaced = false; R.placing = true;

  session.addEventListener('select', onXRSelect);
  session.addEventListener('end', () => { const was = R.mode === 'xr'; cleanupXR(); if (was) R.cb.onEnd?.(); });
  // taps on the HUD must not also place or pick in the scene
  document.addEventListener('beforexrselect', blockHudSelect);
  R.cb.onPlacing?.(true, false);
  start();
}
function blockHudSelect(e){ if (e.target?.closest?.('button, .plate, .tray, a, .hint')) e.preventDefault(); }

function onXRSelect(e){
  if (R.drag.moved > 8) return; // it was a drag or a pinch, not a tap
  if (R.placing){
    if (!R.reticle.visible) return;
    const p = new THREE.Vector3().setFromMatrixPosition(R.reticle.matrix);
    const cam = new THREE.Vector3().setFromMatrixPosition(R.renderer.xr.getCamera().matrixWorld);
    R.placed.position.copy(p);
    R.placed.rotation.set(0, Math.atan2(cam.x - p.x, cam.z - p.z), 0); // its front faces you
    R.placed.visible = true;
    R.isPlaced = true; R.placing = false; R.yaw = 0; R.yawV = 0;
    R.reticle.visible = false;
    R.cb.onPlacing?.(false, true);
    return;
  }
  const pose = e.frame?.getPose(e.inputSource.targetRaySpace, R.refSpace);
  if (!pose) return;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  const o = new THREE.Vector3().setFromMatrixPosition(m);
  const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
  _ray.set(o, d);
  R.cb.onTap?.(pickWith(_ray));
}

function xrHitTest(frame){
  if (!R.placing || !R.hitSource) return;
  const hits = frame.getHitTestResults(R.hitSource);
  const had = R.reticle.visible;
  if (hits.length){
    const pose = hits[0].getPose(R.refSpace);
    R.reticle.matrix.fromArray(pose.transform.matrix);
    R.reticle.visible = true;
  } else R.reticle.visible = false;
  if (had !== R.reticle.visible) R.cb.onPlacing?.(true, R.reticle.visible);
}

function cleanupXR(){
  document.removeEventListener('beforexrselect', blockHudSelect);
  document.body.classList.remove('xr');
  R.hitSource?.cancel?.(); R.hitSource = null;
  if (R.placed){ R.placed.remove(R.spin); R.anchor.add(R.spin); R.scene.remove(R.placed); R.placed = null; }
  if (R.reticle){ R.scene.remove(R.reticle); R.reticle = null; }
  R.renderer.xr.enabled = false;
  R.session = null; R.mode = null;
  R.renderer.setAnimationLoop(null);
  onResize();
}

// Put the bowl somewhere else (XR: the ring comes back; tap to set it down again).
export function replace(){
  if (R.mode !== 'xr') return;
  R.placing = true;
  R.cb.onPlacing?.(true, !!R.reticle?.visible);
}


// ------------------------------------------------------------------ mode: card (scan once, then free)
// MindAR only recognises the card. The moment it is found, tracking stops, the
// camera keeps running, and the bowl pops up in front of you: put the card away
// and keep exploring. The motion sensor keeps the bowl where it is in the room
// when you turn the phone; ⊕ brings it back in front of you.
export async function startCard(){
  R.mode = 'card'; R.freed = false;
  // the motion sensor needs asking inside this tap on iPhone, before anything is awaited
  const DOE = window.DeviceOrientationEvent;
  const gyroAsk = typeof DOE?.requestPermission === 'function' ? DOE.requestPermission().catch(() => 'denied') : Promise.resolve('granted');
  gyroAsk.then((r) => { if (r === 'granted' && R.mode === 'card') addEventListener('deviceorientation', onOrient); });
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container: R.container, imageTargetSrc: TARGET_SRC, uiScanning: 'no', uiLoading: 'no', uiError: 'no',
    filterMinCF: 0.001, filterBeta: 1000, warmupTolerance: 2, missTolerance: 10,
  });
  R.mindar = mindar;
  mindar.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.cardLook = setupLook(mindar.renderer, mindar.scene);
  const anchor = mindar.addAnchor(0);
  anchor.onTargetFound = () => { if (!R.freed) freeFromCard(); };
  R.renderer.domElement.style.display = 'none';
  try { await mindar.start(); }
  catch (e){ stopCard(); throw e || new Error('camera unavailable'); }
  R.video = mindar.video;
  if (R.freed) return; // found during start-up
  mindar.renderer.setAnimationLoop(() => mindar.renderer.render(mindar.scene, mindar.camera));
  R.cb.onCard?.(false);
}

function freeFromCard(){
  const m = R.mindar;
  R.freed = true;
  // stop recognising, keep the camera picture
  try { m.controller.stopProcessVideo(); } catch { /* fine */ }
  try { m.renderer.setAnimationLoop(null); } catch { /* fine */ }
  // Draw the free bowl with MindAR's own renderer: it is the WebGL context that has just
  // been drawing, so it is alive. iPhone Safari can drop an idle context (ours sat hidden
  // through the whole scan while the tracker filled the GPU), and a dropped context draws nothing.
  R.view = { renderer: m.renderer, scene: m.scene };
  m.scene.add(R.anchor, R.camera);
  R.video = m.video;
  R.light = roomLight(R.cardLook, m.renderer);
  R.u = 0; R.target = 0; R.yaw = 0; R.yawV = 0; R.zoom = R.zoomT = 1; R.pop = 0;
  R.camera.quaternion.identity();
  R.q0 = R.devQ ? R.devQ.clone() : null;
  onResize();
  m.renderer.setAnimationLoop(frame);
  R.cb.onFound?.();
}

// motion sensor: keep the floating bowl still in the room while the phone turns
const _euler = new THREE.Euler(), _qa = new THREE.Quaternion(), _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), _zee = new THREE.Vector3(0, 0, 1);
function onOrient(e){
  if (e.alpha == null || e.beta == null) return;
  const d = THREE.MathUtils.DEG2RAD;
  const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
  _euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
  const q = R.devQ || (R.devQ = new THREE.Quaternion());
  q.setFromEuler(_euler).multiply(_q1).multiply(_qa.setFromAxisAngle(_zee, -orient));
  if (R.freed && !R.q0) R.q0 = q.clone(); // the first reading after the scan is "straight ahead"
}

// Bring the floating bowl back in front of the camera.
export function recentre(){
  R.yaw = 0; R.yawV = 0;
  R.q0 = R.devQ ? R.devQ.clone() : null;
  R.camera.quaternion.identity();
}

function stopCard(){
  const m = R.mindar;
  removeEventListener('deviceorientation', onOrient);
  R.devQ = null; R.q0 = null; R.freed = false;
  if (!m) return;
  R.mindar = null;
  try { m.renderer.setAnimationLoop(null); } catch { /* fine */ }
  if (R.view){ R.scene.add(R.anchor, R.camera); R.view = null; }
  try { m.stop(); } catch { /* never started */ }
  try { m.renderer.dispose(); } catch { /* fine */ }
  R.container.querySelectorAll('video').forEach((v) => { v.srcObject?.getTracks?.().forEach((t) => t.stop()); v.remove(); });
  [...R.container.children].forEach((el) => { if (el !== R.renderer.domElement) el.remove(); });
  R.renderer.domElement.style.display = '';
  R.camera.quaternion.identity();
  R.video = null; R.light = null;
}

// ------------------------------------------------------------------ mode: preview (development only)
export function startPreview(){
  R.mode = 'preview';
  R.container.classList.add('preview');
  start();
}

function start(){
  R.u = 0; R.target = 0; R.yaw = 0; R.yawV = 0; R.zoom = R.zoomT = 1;
  onResize();
  R.renderer.setAnimationLoop(frame);
}

export function stop(){
  if (R.mode === 'xr'){ const s = R.session; R.mode = null; s?.end().catch(() => {}); cleanupXR(); }
  if (R.mode === 'card') stopCard();
  R.renderer.setAnimationLoop(null);
  R.container.classList.remove('preview');
  R.mode = null; R.selected = null;
  onResize();
}

// ------------------------------------------------------------------ explode / select
export function setExploded(on){ R.target = on ? 1 : 0; if (!on) select(null); }
export const isExploded = () => R.target === 1;
export function select(id){ R.selected = id; }
export const mode = () => R.mode;
// the + and − buttons: one step is half as big again, eased
export function zoomBy(f){ R.zoomT = THREE.MathUtils.clamp(R.zoomT * f, ZMIN, ZMAX); R.idle = 0; }

// ------------------------------------------------------------------ framing (scale per mode)
function frameFor(u){
  const k = u * u * (3 - 2 * u);
  if (R.mode === 'xr') return { s: 0.01 * R.zoom, y: 0, tilt: 0, lift: 0 };          // true size, in metres
  // card (after the scan) and preview: float in front of the camera, fitted into the free band between the HUD plates
  const cam = R.camera;
  const visH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), visW = visH * cam.aspect;
  const H = R.container.clientHeight || innerHeight;
  const b = R.cb.band?.() || { top: H * 0.2, bottom: H * 0.8 };
  const band = Math.max(0.3, (b.bottom - b.top) / H);
  const lift = -((b.top + b.bottom) / 2 - H / 2) / H * visH;
  const s0 = Math.min(0.8 * visW / 24, 0.8 * band * visH / 16);
  const s1 = Math.min(0.84 * visW / 30, 0.95 * band * visH / 66);
  const s = THREE.MathUtils.lerp(s0, s1, k) * R.zoom;
  return { s, y: -THREE.MathUtils.lerp(5.6, 32, k) * s, tilt: THREE.MathUtils.lerp(0.78, 0.1, k), lift };
}

// ------------------------------------------------------------------ loop
function frame(now, xrFrame){
  // never negative: a throttled tab can hand back an earlier timestamp, and exp(-dt·k) would blow up
  const dt = THREE.MathUtils.clamp((now - (R.last || now)) / 1000, 0, 0.05) || 0;
  R.last = now; R.t += dt;
  if (xrFrame) xrHitTest(xrFrame);
  step(dt, now);
  draw();
}
const _qt = new THREE.Quaternion();
function draw(){
  const v = R.view;
  if (v) v.renderer.render(v.scene, R.camera);
  else R.renderer.render(R.scene, R.camera);
}
function step(dt, now = performance.now()){
  const dir = Math.sign(R.target - R.u);
  R.u = THREE.MathUtils.clamp(R.u + dir * dt / 1.9, 0, 1);
  for (const id in R.ramen.parts){
    const pt = R.ramen.parts[id];
    pt.focus += ((id === R.selected ? 1 : 0) - pt.focus) * (1 - Math.exp(-dt * 7));
  }
  R.ramen.setExplode(R.u, R.t);
  if (!R.drag.on) R.zoom += (R.zoomT - R.zoom) * (1 - Math.exp(-dt * 10));

  if (!R.drag.on){
    R.yaw += R.yawV * dt; R.yawV *= Math.exp(-dt * 3);
    R.idle += dt;
    if (R.mode === 'preview' && R.idle > 2.5) R.yaw += Math.sin(R.t * 0.5) * 0.12 * dt;
  }
  R.spin.rotation.y = R.yaw;
  const F = frameFor(R.u);
  R.fit.scale.setScalar(F.s);
  R.fit.position.y = F.y;
  R.tilt.rotation.x = F.tilt;
  if (R.mode !== 'xr'){
    R.spin.position.y += (F.lift - R.spin.position.y) * (1 - Math.exp(-dt * 6));
    if (!Number.isFinite(R.spin.position.y)) R.spin.position.y = Number.isFinite(F.lift) ? F.lift : 0;
  } else R.spin.position.y = 0;
  // after the scan the bowl pops up out of the card, with a little overshoot
  if (R.pop < 1){ R.pop = Math.min(1, R.pop + dt / 0.6); }
  const k = R.pop, pop = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
  R.spin.scale.setScalar(Math.max(0.001, pop));
  // card mode: the phone turns, the bowl stays where it is in the room
  if (R.mode === 'card' && R.freed && R.devQ && R.q0){
    _qt.copy(R.q0).invert().multiply(R.devQ);
    R.camera.quaternion.slerp(_qt, 1 - Math.exp(-dt * 20));
    const c = R.camera.quaternion;
    if (!(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z) && Number.isFinite(c.w))){ c.identity(); R.q0 = R.devQ && Number.isFinite(R.devQ.w) ? R.devQ.clone() : null; }
  }
  if (R.light) R.light(R.video, now, dt);
}

// ------------------------------------------------------------------ pointer: drag to turn, pinch to resize, tap to pick
function bindPointer(el){
  const pts = new Map();
  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    R.idle = 0;
    if (pts.size === 1){ Object.assign(R.drag, { on: true, moved: 0, t0: performance.now() }); R.yawV = 0; }
    if (pts.size === 2){ const [a, b] = [...pts.values()]; R.drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); R.drag.zoom0 = R.zoom; R.drag.moved = 99; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2){
      const [a, b] = [...pts.values()];
      R.zoom = R.zoomT = THREE.MathUtils.clamp(R.drag.zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(20, R.drag.pinch), ZMIN, ZMAX);
      return;
    }
    const dx = e.clientX - prev.x;
    R.drag.moved += Math.abs(dx) + Math.abs(e.clientY - prev.y);
    if (R.drag.moved > 8){ R.yaw += dx * 0.009; R.yawV = dx * 0.009 / 0.016; }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size > 0) return;
    R.drag.on = false;
    R.yawV = THREE.MathUtils.clamp(R.yawV, -4, 4);
    // in XR the session's own "select" does the picking
    if (R.mode !== 'xr' && R.drag.moved <= 8 && performance.now() - R.drag.t0 < 450) R.cb.onTap?.(pickAt(e.clientX, e.clientY));
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); R.drag.on = false; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); R.zoom = R.zoomT = THREE.MathUtils.clamp(R.zoom * Math.exp(-e.deltaY * 0.0015), ZMIN, ZMAX); }, { passive: false });
  // iPhone Safari: keep its own page pinch-zoom from stealing the gesture
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}

const _ray = new THREE.Ray(), _caster = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function pickWith(ray){
  _caster.ray.copy(ray);
  _caster.near = 0; _caster.far = Infinity;
  R.ramen.model.updateMatrixWorld(true);
  for (const h of _caster.intersectObject(R.ramen.model, true)){
    let o = h.object;
    while (o && !o.userData.part) o = o.parent;
    if (o) return o.userData.part;
  }
  return null;
}
export function pickAt(x, y){
  const cam = R.camera;
  const r = R.container.getBoundingClientRect();
  _ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _caster.setFromCamera(_ndc, cam);
  return pickWith(_caster.ray);
}

function onResize(){
  if (R.mode === 'xr') return;
  const w = R.container.clientWidth || innerWidth, h = R.container.clientHeight || innerHeight;
  R.renderer.setSize(w, h);
  R.camera.aspect = w / h;
  R.camera.fov = w / h < 1 ? 62 : 46;
  R.camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ thumbnails for the tray and the welcome card
function thumbnails(){
  const out = {};
  let tr;
  try { tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
  catch { return out; }
  const S = 192;
  tr.setPixelRatio(1); tr.setSize(S, S); tr.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  setupLook(tr, scene);
  tr.toneMappingExposure = 0.95;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.5, 2000);
  const model = R.ramen.model;
  const parent = model.parent;
  scene.add(model);
  const parts = R.ramen.parts;
  const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const shoot = (elev, az, pad) => {
    model.updateMatrixWorld(true);
    model.traverse((o) => { if (o.isInstancedMesh) o.boundingBox = null; });
    box.makeEmpty();
    model.traverse((o) => { if (o.isMesh && isShown(o)) box.expandByObject(o, true); });
    box.getCenter(c); box.getSize(sz);
    const r = sz.length() / 2 * pad;
    const d = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(c.x + Math.sin(az) * Math.cos(elev) * d, c.y + Math.sin(elev) * d, c.z + Math.cos(az) * Math.cos(elev) * d);
    cam.lookAt(c);
    tr.render(scene, cam);
    return tr.domElement.toDataURL('image/png');
  };
  R.ramen.setExplode(0);
  out.whole = shoot(0.62, 0, 0.82);
  R.ramen.setExplode(1);
  for (const id in parts){
    for (const k in parts) parts[k].root.visible = k === id;
    out[id] = shoot(id === 'bowl' ? 0.35 : id === 'broth' ? 0.45 : 0.28, 0, id === 'onion' || id === 'woodear' || id === 'oil' ? 0.7 : 0.9);
  }
  for (const k in parts) parts[k].root.visible = true;
  R.ramen.setExplode(0);
  parent.add(model);
  tr.dispose(); tr.forceContextLoss?.();
  return out;
}

// Headless checks: advance n fixed frames (the hidden preview pane throttles animation).
R.step = (n = 30, dt = 1 / 30) => { for (let i = 0; i < n; i++){ R.t += dt; step(dt); } draw(); };
window.__stage = R;
