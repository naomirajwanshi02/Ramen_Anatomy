// Painted canvas textures for the ramen: the bowl's glaze and thunder band, the
// rolled chashu face, the egg's cut face, nori, menma and wood ear. Everything is
// drawn once at load, procedurally, so the app ships no image files.

import * as THREE from 'three';

export function rng(seed = 1){
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function canvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}){
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
// soft speckle / mottle helper
function speckle(g, w, h, n, colours, rMin, rMax, alpha, rand){
  for (let i = 0; i < n; i++){
    g.globalAlpha = alpha * (0.4 + rand() * 0.6);
    g.fillStyle = colours[(rand() * colours.length) | 0];
    const r = rMin + rand() * (rMax - rMin);
    g.beginPath(); g.ellipse(rand() * w, rand() * h, r, r * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ bowl
// `bands` are in the lathe's v (0 = foot centre, 1 = inner centre), measured by arc
// length, so a band drawn here lands at a true height on the bowl.
export function bowlTexture({ outerBand, innerBand, footLines, rimV }){
  const W = 4096, H = 1024;
  const [c, g] = canvas(W, H);
  // warm white glaze with a faint tonal drift and grey specks (like the reference bowl)
  g.fillStyle = '#f5eee0'; g.fillRect(0, 0, W, H);
  const rand = rng(11);
  speckle(g, W, H, 900, ['#e9e0cf', '#fbf7ee', '#ece4d4'], 6, 40, 0.35, rand);
  speckle(g, W, H, 260, ['#a9a39a', '#8f8a82', '#c0b9ad'], 0.8, 2.6, 0.55, rand);
  const y = (v) => (1 - v) * H;
  const RED = '#b8362b';
  // the rim edge: a thin unglazed-looking warm line
  g.fillStyle = '#d9cdb7';
  g.fillRect(0, y(rimV + 0.004), W, Math.max(2, y(rimV - 0.004) - y(rimV + 0.004)));
  const band = ([v0, v1], reps, flip) => {
    const top = y(Math.max(v0, v1)), bot = y(Math.min(v0, v1));
    const h = bot - top;
    const lw = h * 0.075;
    g.strokeStyle = RED; g.lineCap = 'square'; g.lineJoin = 'miter';
    // framing rules
    g.lineWidth = lw;
    g.beginPath(); g.moveTo(0, top + lw / 2); g.lineTo(W, top + lw / 2); g.moveTo(0, bot - lw / 2); g.lineTo(W, bot - lw / 2); g.stroke();
    // the thunder (raimon) pattern: square spirals, alternately mirrored, joined at the base
    const inner = h - lw * 3.2, cy0 = top + lw * 1.6;
    // the canvas is stretched round the bowl about 1.7x wider than tall, so each
    // motif fills its cell's width to come out roughly square on the glaze
    const cw = W / reps, gap = cw * 0.16;
    const sx = (cw - gap) / 10, sy = inner / 10;
    const spiral = [[0, 10], [0, 0], [10, 0], [10, 8], [2.6, 8], [2.6, 2.6], [7.4, 2.6], [7.4, 5.6], [5, 5.6]];
    g.lineWidth = sy * 1.25;
    for (let i = 0; i < reps; i++){
      const mirror = (i % 2 === 1) !== flip;
      const x0 = i * cw + gap / 2;
      g.beginPath();
      spiral.forEach(([px, py], k) => {
        const X = x0 + (mirror ? 10 - px : px) * sx, Y = cy0 + py * sy;
        if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      });
      g.stroke();
    }
    // the base rule that joins the motifs
    g.lineWidth = sy * 1.25;
    g.beginPath(); g.moveTo(0, cy0 + 10 * sy); g.lineTo(W, cy0 + 10 * sy); g.stroke();
  };
  band(outerBand, 20, false);
  band(innerBand, 26, true);
  g.fillStyle = RED;
  for (const [v, t] of footLines){ g.fillRect(0, y(v) - t * H / 2, W, t * H); }
  return tex(c, { repeat: false, aniso: 16 });
}

// ------------------------------------------------------------------ broth surface
export function brothTexture(){
  const S = 512;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#b0581c'); gr.addColorStop(0.7, '#9c4a16'); gr.addColorStop(1, '#6e300d');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const rand = rng(5);
  speckle(g, S, S, 160, ['#c46a24', '#8a3e12', '#d8893a'], 8, 40, 0.18, rand);
  return tex(c);
}

// ------------------------------------------------------------------ chashu
// A slice of rolled pork belly: a spiral of pink meat and creamy fat, a caramel
// braised edge and a thin dark soy rim.
export function chashuFace(seed = 3){
  const S = 1024, C = S / 2;
  const [c, g] = canvas(S, S);
  const rand = rng(seed);
  // the slice's outline maps to the circle of radius C (see chashuSlice's UVs)
  g.fillStyle = '#5a2a12'; g.fillRect(0, 0, S, S);
  // meat body: warm tan-pink, a touch lighter in the middle
  const meat = g.createRadialGradient(C * 1.03, C * 0.97, 20, C, C, C * 0.92);
  meat.addColorStop(0, '#d39a72'); meat.addColorStop(0.6, '#c98a62'); meat.addColorStop(0.85, '#b87650'); meat.addColorStop(1, '#a0603a');
  g.fillStyle = meat; g.beginPath(); g.arc(C, C, C * 0.93, 0, Math.PI * 2); g.fill();
  // rolled belly: wobbly layers of soft, translucent fat between the meat, not one neat swirl
  g.save();
  g.translate(C + (rand() - 0.5) * 50, C + (rand() - 0.5) * 50);
  g.lineCap = 'round';
  const turns = 1.9 + rand() * 0.5, a0 = rand() * 6;
  const wob = [rand() * 6, rand() * 6, rand() * 6];
  const layer = (w, col, al, blur, dr) => {
    g.filter = `blur(${blur}px)`;
    g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = w;
    g.beginPath();
    for (let t = 0.04; t <= 1; t += 0.002){
      const a = a0 + t * turns * Math.PI * 2;
      const r = (40 + t * C * 0.72 + dr) * (1 + 0.07 * Math.sin(a * 2 + wob[0]) + 0.05 * Math.sin(a * 3 + wob[1]) + 0.03 * Math.sin(t * 60 + wob[2]));
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.92;
      if (t < 0.0041) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };
  layer(70, '#c27c55', 0.5, 14, -30);      // a darker band of lean meat beside each fat layer
  layer(42, '#e2b48c', 0.55, 10, 0);       // fat
  layer(18, '#efcfae', 0.55, 5, 3);        // the creamy core of the fat layer
  layer(5, '#f6e0c6', 0.35, 1.5, 6);
  g.filter = 'none';
  g.restore(); g.globalAlpha = 1;
  // muscle grain and small pores
  g.save(); g.beginPath(); g.arc(C, C, C * 0.88, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 1400; i++){
    const a = rand() * Math.PI * 2, r = rand() * C * 0.9;
    const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    g.strokeStyle = rand() < 0.55 ? 'rgba(150,80,50,.16)' : 'rgba(246,214,184,.16)';
    g.lineWidth = 1 + rand() * 2.5;
    const L = 6 + rand() * 22;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1.57) * L, y + Math.sin(a + 1.57) * L); g.stroke();
  }
  speckle(g, S, S, 160, ['#a05a36', '#e8c09c'], 2, 7, 0.25, rand);
  g.restore();
  // braised, soy-darkened edge: dark at the rim, blending in
  const edge = g.createRadialGradient(C, C, C * 0.72, C, C, C);
  edge.addColorStop(0, 'rgba(120,58,26,0)'); edge.addColorStop(0.55, 'rgba(126,60,26,.45)'); edge.addColorStop(0.8, 'rgba(98,44,18,.9)'); edge.addColorStop(1, 'rgba(70,30,12,1)');
  g.fillStyle = edge; g.fillRect(0, 0, S, S);
  return tex(c, { aniso: 8 });
}
export function chashuSide(){
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#8a4b26'; g.fillRect(0, 0, 512, 64);
  const rand = rng(9);
  speckle(g, 512, 64, 300, ['#6b351a', '#a8653a', '#5a2c14', '#c07a48'], 1, 6, 0.6, rand);
  return tex(c, { repeat: true });
}

// ------------------------------------------------------------------ egg
// The cut face of a seasoned egg: the white tinted tan at its edge by the soy
// marinade, and a jammy orange yolk, darker and glossier in the middle.
export function eggFace(){
  const S = 1024, C = S / 2;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#fbf6ec'; g.fillRect(0, 0, S, S);
  // marinade tint creeping in from the edge
  const edge = g.createRadialGradient(C, C, C * 0.72, C, C, C);
  edge.addColorStop(0, 'rgba(232,206,165,0)'); edge.addColorStop(0.75, 'rgba(214,170,110,.55)'); edge.addColorStop(1, 'rgba(176,118,60,.95)');
  g.fillStyle = edge; g.fillRect(0, 0, S, S);
  // yolk (the texture is mapped so the yolk circle lands on the domed centre)
  const yk = g.createRadialGradient(C, C * 1.04, 10, C, C * 1.04, C * 0.52);
  yk.addColorStop(0, '#d9600c'); yk.addColorStop(0.45, '#ec8418'); yk.addColorStop(0.8, '#f5a83a'); yk.addColorStop(0.93, '#f7c66a'); yk.addColorStop(1, 'rgba(250,220,150,0)');
  g.fillStyle = yk; g.beginPath(); g.arc(C, C * 1.04, C * 0.52, 0, Math.PI * 2); g.fill();
  const rand = rng(21);
  speckle(g, S, S, 120, ['#fffaf2', '#f0e6d4'], 4, 18, 0.25, rand);
  return tex(c);
}
export function eggShell(){
  const [c, g] = canvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#b97c3e'); gr.addColorStop(0.5, '#cf9a5e'); gr.addColorStop(1, '#b0723a');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  const rand = rng(4);
  speckle(g, 512, 256, 200, ['#c48a4e', '#ecd0a6', '#b97d43'], 4, 22, 0.25, rand);
  return tex(c, { repeat: true });
}

// ------------------------------------------------------------------ nori
export function noriTexture(seed = 2){
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#1b2116'; g.fillRect(0, 0, S, S);
  const rand = rng(seed);
  speckle(g, S, S, 500, ['#2c3a22', '#3a4a26', '#232c1b', '#4a5a2c'], 4, 26, 0.55, rand);
  // pressed-fibre streaks
  for (let i = 0; i < 260; i++){
    g.strokeStyle = `rgba(${90 + rand() * 40 | 0},${110 + rand() * 40 | 0},${50 + rand() * 30 | 0},${0.12 + rand() * 0.2})`;
    g.lineWidth = 1 + rand() * 3;
    const x = rand() * S, y = rand() * S, a = rand() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20 + 8, x + Math.cos(a) * 40, y + Math.sin(a) * 40); g.stroke();
  }
  speckle(g, S, S, 120, ['#0d110b'], 1, 4, 0.6, rand);
  return tex(c);
}

// ------------------------------------------------------------------ menma
export function menmaTexture(){
  const [c, g] = canvas(256, 512);
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#9a5418'); gr.addColorStop(0.5, '#c27e30'); gr.addColorStop(1, '#94501a');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  const rand = rng(8);
  // long fibres running along the shoot
  for (let i = 0; i < 140; i++){
    const x = rand() * 256;
    g.strokeStyle = rand() < 0.5 ? 'rgba(140,78,26,.35)' : 'rgba(246,206,140,.35)';
    g.lineWidth = 1 + rand() * 2.5;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rand() * 6 - 3, 170, x + rand() * 6 - 3, 340, x + rand() * 8 - 4, 512); g.stroke();
  }
  // node bands
  for (const yy of [140, 380]){ g.fillStyle = 'rgba(150,84,30,.35)'; g.fillRect(0, yy, 256, 10); }
  return tex(c, { repeat: true });
}
