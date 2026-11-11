// Anatomy of Ramen: start the camera → the bowl is set down in the room (Android:
// on a table you tap; iPhone: on the ramen card) → walk round it → tap it and it
// explodes into its parts → tap a part for one line about it.
//
// ?preview=1  development only: no camera, a lit backdrop
// ?card=1     use the card even where WebXR works
// ?apart=1    open already exploded      ?part=<id>  open with that part picked

import { PARTS, BY_ID, BOWL_INFO } from './data.js';
import * as Stage from './stage.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const S = { phase: 'intro', part: null, hintTimer: 0, xr: false, mode: null, placing: false, ringSeen: false, cardSeen: false };

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
  thumbs = Stage.init($('ar'), { onTap, onEnd: back, onPlacing, onCard, band });
} catch (e) { fail(e); }
$('introBowl').src = thumbs.whole || '';
$('cooking').classList.remove('on');
buildTray();

// Which anchor this phone can do: room tracking (WebXR) or the card.
S.xr = q.get('card') !== '1' && await Stage.xrSupported();
document.body.classList.toggle('has-xr', S.xr);
$('stepPlace').innerHTML = S.xr ? 'Tap a <b>table</b> to set the bowl down' : 'Point your camera at the <b>ramen card</b>';
$('camNote').innerHTML = S.xr
  ? 'The bowl appears in your room at real size. The camera stays on this phone: nothing is recorded or sent anywhere.'
  : 'Print the <a href="target.png" target="_blank" rel="noopener">ramen card</a> or open it on another screen. The camera stays on this phone: nothing is recorded or sent anywhere.';
$('goBtn').disabled = false;

// ------------------------------------------------------------ 1 · welcome → AR
function start(){
  $('goBtn').disabled = true;
  $('camStatus').textContent = '';
  if (S.xr){
    // requestSession must run inside this tap, before anything is awaited
    Stage.startXR().then(() => enter('xr')).catch((err) => camFail(err, true));
  } else {
    $('camStatus').textContent = 'Waiting for you to tap “Allow”…';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){ camFail({ name: 'Insecure' }); return; }
    enter('card');
    Stage.startCard().catch((err) => { back(); camFail(err); });
  }
}
function camFail(err, xr = false){
  console.error(err);
  $('goBtn').disabled = false;
  if (xr){
    // fall back to the card on this device
    S.xr = false; document.body.classList.remove('has-xr');
    $('stepPlace').innerHTML = 'Point your camera at the <b>ramen card</b>';
    $('camStatus').textContent = 'Room tracking did not start here, so the bowl will sit on the ramen card instead. Tap the button again.';
    return;
  }
  const msg = String(err?.message || err?.name || err || '');
  $('camStatus').textContent = err?.name === 'NotAllowedError'
    ? 'The camera was blocked. Tap the “aA” or lock icon next to the address, allow the camera for this site, then try again.'
    : err?.name === 'Insecure' ? 'This browser cannot use the camera here. Open the page over https in Safari or Chrome.'
    : /mind|fetch|404/i.test(msg) ? `Could not load the card data (${msg}).`
    : 'The camera did not start. Close other apps that use the camera and try again.';
}

function enter(mode){
  S.mode = mode; S.phase = 'bowl';
  $('goBtn').disabled = false; $('camStatus').textContent = '';
  document.body.classList.toggle('preview', mode === 'preview');
  document.body.classList.toggle('mode-xr', mode === 'xr');
  document.body.classList.toggle('mode-card', mode === 'card');
  show(null);
  overlay('hud', true);
  setApart(false, true);
  setCard(null);
  if (q.get('apart') === '1' || BY_ID[q.get('part')]) setApart(true, true);
  if (BY_ID[q.get('part')]) pick(q.get('part'), { quiet: true });
  setHint();
  hintLoop();
}

// XR: looking for a surface, then set down
function onPlacing(placing, ringSeen){
  S.placing = placing; S.ringSeen = ringSeen;
  document.body.classList.toggle('placing', placing);
  if (!placing) toast('The bowl is on the table. <b>Walk round it</b> to see every side.', 3800);
  setHint();
}
// card: found / lost
function onCard(seen){
  S.cardSeen = seen;
  overlay('guide', !seen && S.phase === 'bowl');
  if (seen) buzz(25);
  setHint();
}

// ------------------------------------------------------------ 2 · the bowl
function buildTray(){
  const tray = $('tray');
  tray.innerHTML = '';
  for (const p of PARTS){
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'option');
    b.dataset.id = p.id;
    b.innerHTML = `<img alt="" ${thumbs[p.id] ? `src="${thumbs[p.id]}"` : ''}><b>${p.name}</b>`;
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

function onTap(id){
  if (S.phase !== 'bowl') return;
  if (!Stage.isExploded()){
    if (id) setApart(true);
    return;
  }
  if (id) pick(id);
  else { S.part = null; Stage.select(null); setCard(null); markTray(null); setHint(); }
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
  let h;
  if (S.mode === 'xr' && S.placing) h = S.ringSeen ? 'Tap to <b>set the bowl down</b> on the ring' : 'Move your phone slowly over a <b>table</b> until a ring appears';
  else if (S.mode === 'card' && !S.cardSeen) h = 'Point your camera at the <b>ramen card</b>';
  else if (!Stage.isExploded()) h = '<b>Tap the bowl</b> to take it apart. Walk round it to see every side';
  else if (S.part) h = 'Tap another piece, or <b>Put it back together</b>';
  else h = 'Tap any <b>floating piece</b> to learn about it';
  $('hint').innerHTML = h;
}
function hintLoop(){
  clearInterval(S.hintTimer);
  let n = 0;
  S.hintTimer = setInterval(() => {
    if (S.phase !== 'bowl') return;
    n++;
    const busy = (S.mode === 'xr' && S.placing) || (S.mode === 'card' && !S.cardSeen);
    if (!busy && n % 3 === 2) $('hint').innerHTML = 'Walk round it, or <b>drag</b> to turn it and <b>pinch</b> to resize';
    else setHint();
  }, 7000);
}

// the free band between the top plates and the bottom buttons (preview framing only)
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

function back(){
  if (S.phase === 'intro') return;
  S.phase = 'intro';
  clearInterval(S.hintTimer);
  setApart(false, true);
  overlay('hud', false); overlay('guide', false);
  Stage.stop();
  document.body.classList.remove('preview', 'mode-xr', 'mode-card', 'placing');
  S.mode = null;
  show('intro');
}

// ------------------------------------------------------------ wiring
$('goBtn').addEventListener('click', start);
$('explodeBtn').addEventListener('click', () => setApart(!Stage.isExploded()));
$('closeBtn').addEventListener('click', back);
$('centreBtn').addEventListener('click', () => { Stage.replace(); buzz(10); });
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
if (q.get('preview') === '1'){ Stage.startPreview(); enter('preview'); }
