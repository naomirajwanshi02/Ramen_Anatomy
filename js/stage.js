// The AR stage: the rear camera fills the screen and the ramen floats in front of it.
//
// With a motion sensor (phones) the bowl is locked to the room: turn the phone and
// it stays where it was put, like a real bowl on the table (three-axis, from the
// gyroscope). Without one (laptops, ?preview=1) it hangs in front of the camera
// and a finger turns it. Either way: drag to turn, pinch to resize, tap the bowl
// to take it apart, tap a piece to read about it.

import * as THREE from 'three';
import { buildRamen } from './ramen.js';
import { setupLook, roomLight } from './look.js';
import { PARTS } from './data.js';

const DIST = 60; // cm in front of the camera
const R = {
  mode: null, container: null, renderer: null, scene: null, camera: null, video: null, stream: null,
  ramen: null, anchor: null, spin: null, tilt: null, fit: null, look: null, light: null,
  u: 0, target: 0, selected: null, t: 0, last: 0, gyro: false, devQ: null, hasDev: false,
  yaw: 0, yawV: 0, zoom: 1, idle: 0, pins: null, cb: {}, raf: false, staticFit: true,
};

// ------------------------------------------------------------------ setup (once)
export function init(container, pinsEl, cb){
  R.container = container; R.pins = pinsEl; R.cb = cb;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'stage';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 1000);
  scene.add(camera);
  R.renderer = renderer; R.scene = scene; R.camera = camera;
  R.look = setupLook(renderer, scene);
  R.look.rig.position.set(0, 0, 0);

  R.ramen = buildRamen();
  R.anchor = new THREE.Group(); R.spin = new THREE.Group(); R.tilt = new THREE.Group(); R.fit = new THREE.Group();
  scene.add(R.anchor); R.anchor.add(R.spin); R.spin.add(R.tilt); R.tilt.add(R.fit); R.fit.add(R.ramen.model);
  R.anchor.position.set(0, 0, -DIST);

  buildPins();
  bindPointer(renderer.domElement);
  addEventListener('resize', onResize);
  onResize();
  return thumbnails();
}

// ------------------------------------------------------------------ camera
export async function startCamera(){
  R.mode = 'camera';
  // ask for the motion sensor in the same tap (iPhone needs that), in parallel with the camera
  const DOE = window.DeviceOrientationEvent;
  const gyroAsk = typeof DOE?.requestPermission === 'function' ? DOE.requestPermission().catch(() => 'denied') : Promise.resolve('granted');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  const video = document.createElement('video');
  video.className = 'feed';
  video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.muted = true; video.autoplay = true;
  video.srcObject = stream;
  R.container.prepend(video);
  await video.play().catch(() => {});
  R.video = video; R.stream = stream;
  R.light = roomLight(R.look, R.renderer);
  if ((await gyroAsk) === 'granted') listenGyro();
  start();
}

export function startPreview(){
  R.mode = 'preview';
  R.container.classList.add('preview');
  start();
}

function start(){
  R.u = 0; R.target = 0;
  onResize();
  if (!R.raf){ R.raf = true; R.renderer.setAnimationLoop(frame); }
}

export function stop(){
  R.renderer?.setAnimationLoop(null); R.raf = false;
  R.stream?.getTracks().forEach((t) => t.stop());
  R.video?.remove();
  R.video = R.stream = null; R.light = null;
  R.container?.classList.remove('preview');
  removeEventListener('deviceorientation', onOrient);
  R.gyro = false; R.hasDev = false;
}

// ------------------------------------------------------------------ gyro: lock the bowl to the room
const _euler = new THREE.Euler(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), _zee = new THREE.Vector3(0, 0, 1);
function onOrient(e){
  if (e.alpha == null || e.beta == null) return;
  const d = THREE.MathUtils.DEG2RAD;
  const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
  _euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
  const q = R.devQ || (R.devQ = new THREE.Quaternion());
  q.setFromEuler(_euler).multiply(_q1).multiply(_q0.setFromAxisAngle(_zee, -orient));
  if (!R.hasDev){ R.hasDev = true; R.gyro = true; R.camera.quaternion.copy(q); recentre(); R.cb.onGyro?.(true); }
}
function listenGyro(){ addEventListener('deviceorientation', onOrient); }

// Put the bowl back in front of the camera, facing it.
export function recentre(){
  R.yaw = 0; R.yawV = 0;
  if (!R.gyro){ R.anchor.position.set(0, 0, -DIST); R.anchor.rotation.set(0, 0, 0); return; }
  R.camera.updateMatrixWorld();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(R.camera.quaternion);
  R.anchor.position.copy(fwd).multiplyScalar(DIST);
  R.anchor.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
}

// ------------------------------------------------------------------ explode / select
export function setExploded(on){ R.target = on ? 1 : 0; if (!on) select(null); }
export const isExploded = () => R.target === 1;
export function select(id){
  R.selected = id;
  R.pins?.querySelectorAll('.pin').forEach((p) => p.classList.toggle('on', p.dataset.id === id));
}

// ------------------------------------------------------------------ framing
function fitFor(u){
  const cam = R.camera;
  const visH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), visW = visH * cam.aspect;
  // the HUD plates cover the top and bottom of the screen: fit the ramen into the free band between them
  const H = R.container.clientHeight || innerHeight;
  const b = R.cb.band?.() || { top: H * 0.2, bottom: H * 0.8 };
  const band = Math.max(0.3, (b.bottom - b.top) / H);
  const lift = -((b.top + b.bottom) / 2 - H / 2) / H * visH;
  const s0 = Math.min(0.8 * visW / 24, 0.8 * band * visH / 16);
  const s1 = Math.min(0.84 * visW / 30, 0.95 * band * visH / 66);
  const k = u * u * (3 - 2 * u);
  return { s: THREE.MathUtils.lerp(s0, s1, k) * R.zoom, c: THREE.MathUtils.lerp(5.6, 32, k), tilt: R.gyro ? 0 : THREE.MathUtils.lerp(0.78, 0.1, k), lift };
}

// ------------------------------------------------------------------ loop
function frame(now){
  // never negative: a throttled tab can hand back an earlier timestamp, and exp(-dt·k) would blow up
  const dt = THREE.MathUtils.clamp((now - (R.last || now)) / 1000, 0, 0.05) || 0;
  R.last = now; R.t += dt;
  step(dt, now);
  R.renderer.render(R.scene, R.camera);
}
function step(dt, now = performance.now()){
  // explode progress at a calm, constant pace; the parts' own easing does the rest
  const dir = Math.sign(R.target - R.u);
  R.u = THREE.MathUtils.clamp(R.u + dir * dt / 1.9, 0, 1);
  for (const id in R.ramen.parts){
    const pt = R.ramen.parts[id];
    const f = id === R.selected ? 1 : 0;
    pt.focus += (f - pt.focus) * (1 - Math.exp(-dt * 7));
  }
  R.ramen.setExplode(R.u, R.t);

  // turning: inertia after a drag; with no motion sensor, a slow idle sway
  if (!R.drag?.on){
    R.yaw += R.yawV * dt; R.yawV *= Math.exp(-dt * 3);
    R.idle += dt;
    if (!R.gyro && R.idle > 2.5) R.yaw += Math.sin(R.t * 0.5) * 0.12 * dt;
  }
  R.spin.rotation.y = R.yaw;
  const F = fitFor(R.u);
  R.fit.scale.setScalar(F.s);
  R.fit.position.y = -F.c * F.s;
  R.spin.position.y += (F.lift - R.spin.position.y) * (1 - Math.exp(-dt * 6));
  if (!Number.isFinite(R.spin.position.y)) R.spin.position.y = Number.isFinite(F.lift) ? F.lift : 0;
  R.tilt.rotation.x = F.tilt;

  if (R.gyro && R.devQ) R.camera.quaternion.slerp(R.devQ, 1 - Math.exp(-dt * 25));
  if (R.light) R.light(R.video, now, dt);
  placePins();
}

// ------------------------------------------------------------------ pins: numbered labels that follow the parts
function buildPins(){
  if (!R.pins) return;
  R.pins.innerHTML = '';
  for (const p of PARTS){
    const b = document.createElement('button');
    b.className = 'pin'; b.dataset.id = p.id;
    b.innerHTML = `<i>${p.n}</i><span>${p.name}</span>`;
    b.setAttribute('aria-label', p.name);
    b.addEventListener('click', (e) => { e.stopPropagation(); R.cb.onPick?.(p.id); });
    R.pins.appendChild(b);
  }
}
const _v = new THREE.Vector3();
function placePins(){
  if (!R.pins) return;
  const show = R.u > 0.92 && R.target === 1;
  R.pins.classList.toggle('on', show);
  if (!show) return;
  const w = R.container.clientWidth, h = R.container.clientHeight;
  R.ramen.model.updateMatrixWorld();
  for (const el of R.pins.children){
    const id = el.dataset.id;
    _v.copy(R.ramen.pinOf(id, R.u));
    const pt = R.ramen.parts[id];
    pt.root.localToWorld(_v);
    _v.project(R.camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    el.style.visibility = vis ? '' : 'hidden';
    el.style.transform = `translate(${((_v.x + 1) / 2 * w).toFixed(1)}px,${((1 - _v.y) / 2 * h).toFixed(1)}px)`;
    el.classList.toggle('left', _v.x > 0.35);
  }
}

// ------------------------------------------------------------------ pointer: drag to turn, pinch to resize, tap to pick
function bindPointer(el){
  const pts = new Map();
  R.drag = { on: false, moved: 0, t0: 0, pinch: 0, zoom0: 1 };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    R.idle = 0;
    if (pts.size === 1){ Object.assign(R.drag, { on: true, moved: 0, t0: performance.now(), x: e.clientX, y: e.clientY }); R.yawV = 0; }
    if (pts.size === 2){ const [a, b] = [...pts.values()]; R.drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); R.drag.zoom0 = R.zoom; R.drag.moved = 99; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2){
      const [a, b] = [...pts.values()];
      R.zoom = THREE.MathUtils.clamp(R.drag.zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(20, R.drag.pinch), 0.45, 2.4);
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
    if (R.drag.moved <= 8 && performance.now() - R.drag.t0 < 450) tap(e.clientX, e.clientY);
    R.yawV = THREE.MathUtils.clamp(R.yawV, -4, 4);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); R.drag.on = false; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); R.zoom = THREE.MathUtils.clamp(R.zoom * Math.exp(-e.deltaY * 0.001), 0.45, 2.4); }, { passive: false });
}

const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
export function pickAt(x, y){
  const r = R.renderer.domElement.getBoundingClientRect();
  _ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, R.camera);
  R.scene.updateMatrixWorld();
  const hits = _ray.intersectObject(R.ramen.model, true);
  for (const h of hits){
    let o = h.object;
    while (o && !o.userData.part) o = o.parent;
    if (o) return o.userData.part;
  }
  return null;
}
function tap(x, y){
  const id = pickAt(x, y);
  R.cb.onTap?.(id);
}

function onResize(){
  const w = R.container.clientWidth || innerWidth, h = R.container.clientHeight || innerHeight;
  R.renderer.setSize(w, h);
  R.camera.aspect = w / h;
  R.camera.fov = w / h < 1 ? 62 : 46; // roughly a phone's main camera
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
  const shoot = (elev, az, pad) => {
    model.updateMatrixWorld(true);
    model.traverse((o) => { if (o.isInstancedMesh) o.boundingBox = null; });
    box.makeEmpty();
    model.traverse((o) => { if (o.isMesh && o.visible && isShown(o)) box.expandByObject(o, true); });
    box.getCenter(c); box.getSize(sz);
    const r = sz.length() / 2 * pad;
    const d = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(c.x + Math.sin(az) * Math.cos(elev) * d, c.y + Math.sin(elev) * d, c.z + Math.cos(az) * Math.cos(elev) * d);
    cam.lookAt(c);
    tr.render(scene, cam);
    return tr.domElement.toDataURL('image/png');
  };
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  // the whole bowl, assembled, seen from above like the reference painting
  R.ramen.setExplode(0);
  out.whole = shoot(0.62, 0, 0.82);
  // each part on its own, apart
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
R.step = (n = 30, dt = 1 / 30) => { for (let i = 0; i < n; i++){ R.t += dt; step(dt); } R.renderer.render(R.scene, R.camera); };
window.__stage = R;
