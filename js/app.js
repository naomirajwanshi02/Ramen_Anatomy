// Anatomy of Ramen: allow the camera → a bowl of shoyu ramen floats in the room →
// tap it and it explodes into its parts → tap a part for one line about it.
//
// ?preview=1  no camera at all: the bowl hangs over a lit backdrop
// ?apart=1    open already exploded
// ?part=<id>  open with that part picked

import { PARTS, BY_ID, BOWL_INFO } from './data.js';
import * as Stage from './stage.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const S = { phase: 'intro', part: null, hintTimer: 0, hinted: false };

const overlay = (id, on) => $(id).classList.toggle('on', on);
const show = (id) => document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
let toastT = 0;
function toast(html, ms = 3200){
  const t = $('toast');
  t.innerHTML = html; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* no vibration */ } };
function fail(err){
  console.error(err);
  $('errText').textContent = String(err?.stack || err?.message || err);
  $('err').hidden = false;
}

// ------------------------------------------------------------ build the ramen (once)
let thumbs = {};
await new Promise((ok) => setTimeout(ok, 60)); // let the "cooking" plate paint first
try {
  thumbs = Stage.init($('ar'), $('pins'), { onTap, onPick: (id) => pick(id), onGyro, band });
} catch (e) { fail(e); }
$('introBowl').src = thumbs.whole || '';
$('cooking').classList.remove('on');
$('goBtn').disabled = false;
buildTray();

// ------------------------------------------------------------ 1 · welcome → camera
async function start(preview = false){
  $('goBtn').disabled = true;
  $('camStatus').textContent = preview ? '' : 'Waiting for you to tap “Allow”…';
  try {
    if (preview) Stage.startPreview();
    else {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'Insecure' });
      await Stage.startCamera();
    }
  } catch (err) {
    console.error(err);
    $('goBtn').disabled = false;
    $('camStatus').textContent = err?.name === 'NotAllowedError'
      ? 'The camera was blocked. Tap the “aA” or lock icon next to the address, allow the camera for this site, then try again — or look at the bowl without a camera.'
      : err?.name === 'Insecure' ? 'This browser cannot use the camera here. Open the page over https in Safari or Chrome.'
      : 'The camera did not start. Close other apps that use the camera and try again, or look at the bowl without a camera.';
    return;
  }
  $('goBtn').disabled = false; $('camStatus').textContent = '';
  S.phase = 'bowl';
  document.body.classList.toggle('preview', preview);
  show(null);
  overlay('hud', true);
  setCard(null);
  if (q.get('apart') === '1' || BY_ID[q.get('part')]) setApart(true, true);
  if (BY_ID[q.get('part')]) pick(q.get('part'), { quiet: true });
  setHint();
  hintLoop();
}

// the free screen band between the top plates and the bottom buttons, measured
// only when the layout changes (the card text changes height)
let bandCache = null, bandKey = '';
function band(){
  const key = `${innerWidth}x${innerHeight}|${$('ncBlurb').textContent.length}|${$('hint').textContent.length}`;
  if (key !== bandKey){
    bandKey = key;
    const top = Math.max($('namecard').getBoundingClientRect().bottom, $('hint').getBoundingClientRect().bottom) + 8;
    const bottom = $('explodeBtn').getBoundingClientRect().top - 8;
    bandCache = bottom - top > 120 ? { top, bottom } : null;
  }
  return bandCache;
}

function onGyro(){ toast('The bowl is <b>sitting in your room</b>. Walk the phone around it, or tap <b>⊕</b> to bring it back.', 4200); }

// ------------------------------------------------------------ 2 · the bowl
function buildTray(){
  const tray = $('tray');
  tray.innerHTML = '';
  for (const p of PARTS){
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'option');
    b.dataset.id = p.id;
    b.innerHTML = `<span class="num">${String(p.n).padStart(2, '0')}</span><img alt="" ${thumbs[p.id] ? `src="${thumbs[p.id]}"` : ''}><b>${p.name}</b>`;
    b.addEventListener('click', () => pick(p.id));
    tray.appendChild(b);
  }
}

function setApart(on, quiet = false){
  Stage.setExploded(on);
  $('explodeBtn').classList.toggle('apart', on);
  $('explodeLabel').textContent = on ? 'Put it back together' : 'Take it apart';
  if (!on){ S.part = null; setCard(null); markTray(null); }
  if (!quiet) buzz(on ? 35 : 20);
  setHint();
}

// tapping the 3D view
function onTap(id){
  if (S.phase !== 'bowl') return;
  if (!Stage.isExploded()){
    if (id) setApart(true);
    else toast('Tap <b>on the bowl</b> to take it apart', 2000);
    return;
  }
  if (id) pick(id);
  else { S.part = null; Stage.select(null); setCard(null); markTray(null); }
}

function pick(id, { quiet = false } = {}){
  if (!Stage.isExploded()) setApart(true, quiet);
  S.part = id;
  Stage.select(id);
  setCard(BY_ID[id]);
  markTray(id, quiet);
  if (!quiet) buzz(12);
  setHint();
}

function markTray(id, quiet = true){
  document.querySelectorAll('#tray .chip').forEach((c) => {
    const on = c.dataset.id === id;
    c.setAttribute('aria-selected', on);
    if (on) c.scrollIntoView({ behavior: quiet ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  });
}

function setCard(p){
  $('ncFig').textContent = p ? `Fig. ${String(p.n).padStart(2, '0')}` : 'Fig. 00';
  $('ncRole').textContent = p ? p.kind : 'Five elements';
  $('ncName').textContent = p ? p.name : BOWL_INFO.name;
  $('ncBlurb').textContent = p ? p.line : BOWL_INFO.blurb;
  $('namecard').classList.remove('pop'); void $('namecard').offsetWidth; $('namecard').classList.add('pop');
}

function setHint(){
  const preview = document.body.classList.contains('preview');
  $('hint').innerHTML = !Stage.isExploded()
    ? '<b>Tap the bowl</b> to take it apart'
    : S.part ? 'Tap another piece, or <b>Put it back together</b>'
    : `Tap any <b>floating piece</b> or number to learn about it${preview ? '' : '. Step back if it doesn’t fit'}`;
}
function hintLoop(){
  clearInterval(S.hintTimer);
  let n = 0;
  S.hintTimer = setInterval(() => {
    if (S.phase !== 'bowl') return;
    n++;
    if (n % 3 === 2) $('hint').innerHTML = '<b>Drag</b> to turn the bowl, <b>pinch</b> to make it bigger';
    else setHint();
  }, 7000);
}

function back(){
  S.phase = 'intro';
  clearInterval(S.hintTimer);
  setApart(false, true);
  Stage.stop();
  overlay('hud', false);
  document.body.classList.remove('preview');
  show('intro');
}

// ------------------------------------------------------------ wiring
$('goBtn').addEventListener('click', () => start(false));
$('previewBtn').addEventListener('click', () => start(true));
$('explodeBtn').addEventListener('click', () => setApart(!Stage.isExploded()));
$('closeBtn').addEventListener('click', back);
$('centreBtn').addEventListener('click', () => { Stage.recentre(); buzz(10); });
$('errBtn').addEventListener('click', () => location.reload());
addEventListener('keydown', (e) => {
  if (S.phase !== 'bowl') return;
  if (e.key === ' ' || e.key === 'Enter'){ if (document.activeElement === document.body){ e.preventDefault(); setApart(!Stage.isExploded()); } }
  if (e.key === 'Escape') setApart(false);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
    const i = PARTS.findIndex((p) => p.id === S.part);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + PARTS.length) % PARTS.length;
    pick(PARTS[j < 0 ? 0 : j].id);
  }
});
addEventListener('error', (e) => fail(e.error || e.message));
addEventListener('unhandledrejection', (e) => fail(e.reason));
if (q.get('preview') === '1') start(true);
