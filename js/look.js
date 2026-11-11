// Lighting shared by the AR view, the preview and the tools: filmic tone mapping,
// a soft studio environment for the glaze and broth to reflect, a key light from
// above the camera and a fill. In AR the light follows the room: the camera image
// is sampled twice a second and its brightness and tint drive exposure and fill.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLook(renderer, scene){
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;

  const rig = new THREE.Group();
  rig.name = 'lights';
  const hemi = new THREE.HemisphereLight('#fff6e8', '#4a3424', 0.4);
  const key = new THREE.DirectionalLight('#fff3e0', 1.8);
  key.position.set(-0.45, 1.0, 0.42); // from above, so the toppings model in the bowl
  const rim = new THREE.DirectionalLight('#ffe2c0', 0.7);
  rim.position.set(0.7, 0.25, -0.2);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.25);
  fill.position.set(0.6, -0.2, 0.8);
  rig.add(hemi, key, rim, fill);
  scene.add(rig);
  return { env, hemi, key, rim, fill, rig };
}

// Reads the room from the camera image and eases the lights toward it.
export function roomLight(look, renderer){
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true });
  let target = { exp: 0.88, tint: new THREE.Color('#fff6e8') }, last = 0;
  return (video, now, dt) => {
    if (video && video.readyState >= 2 && now - last > 500){
      last = now;
      try {
        g.drawImage(video, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4){ r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4; r /= n * 255; gg /= n * 255; b /= n * 255;
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        // a dim room gets a dimmer bowl, never black; a bright room a brighter one
        target.exp = THREE.MathUtils.clamp(0.48 + lum * 1.15, 0.55, 1.15);
        const m = Math.max(r, gg, b, 1e-3);
        target.tint.setRGB(0.55 + 0.45 * r / m, 0.55 + 0.45 * gg / m, 0.55 + 0.45 * b / m);
      } catch { /* video not ready */ }
    }
    const k = 1 - Math.exp(-dt * 2);
    renderer.toneMappingExposure += (target.exp - renderer.toneMappingExposure) * k;
    look.hemi.color.lerp(target.tint, k);
    look.fill.color.lerp(target.tint, k);
  };
}
