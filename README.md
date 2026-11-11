# Anatomy of Ramen — WebAR

**Live:** https://naomirajwanshi02.github.io/Ramen_Anatomy/ (open it on your phone, allow the camera, tap the bowl)

A bowl of shoyu ramen floats over your phone's back camera. **Tap the bowl** and it explodes into its parts, stacked like an exploded diagram. **Tap any floating piece** (or its number, or its chip in the tray) for one line about what it does.

The design system is copied from **Noh_Masks**: the Anatomy kit in the sepia theme (`css/anatomy-sepia.css`), plates with `Fig.` corners, Zen Maru Gothic, red pill buttons, a glass name card with hint and a scrolling tray of numbered chips. The ramen is built procedurally in three.js (no model files). Its parts are modelled in centimetres from a real donburi and the two reference paintings in `assets/`.

## The 12 parts

| # | Part | In the bowl | Apart |
|---|---|---|---|
| 1 | Ramen bowl | white glaze, red thunder-pattern bands inside and out | stays at the bottom |
| 2 | Broth | amber surface | lifts out as one golden body |
| 3 | Tare | dark pool on the bottom | a dark ribbon swirling round the noodles |
| 4 | Aromatic oil | golden coins on the soup | round golden drops |
| 5 | Noodles | 84 wavy wheat strands | a twisting column, a few strays curling loose |
| 6 | Chashu pork | 3 rolled-belly slices at the front | fanned overhead |
| 7 | Seasoned egg | half egg, yolk up | floating, yolk facing you |
| 8 | Nori | 2 sheets at the back rim | to the right |
| 9 | Menma | bamboo shoot strips | fanned right |
| 10 | Wood ear | a pile of dark strips | squiggles all round |
| 11 | Green onions | a heap of rings in the middle | confetti |
| 12 | Enoki | lying on the noodles | standing at the very top |

Noodles, tare and wood ear are single meshes with a **morph target**, so the GPU bends every strand from its bowl shape into its floating shape. Oil, onions and tare drops are instanced.

## Controls

- **Tap the bowl** or **Take it apart** to explode it, **Put it back together** to rebuild it
- **Tap a piece**, a numbered pin or a tray chip: its name and one line appear on the card
- **Drag** to turn, **pinch** (or mouse wheel) to resize, **⊕** to bring the bowl back in front of you
- On phones with a motion sensor the bowl is **locked to the room** (gyroscope): move the phone and it stays put
- Keyboard: Space / Enter explode, ← → step through the parts, Esc rebuild

## URL options

- `?preview=1`: no camera, the bowl hangs over a lit backdrop
- `?apart=1`: open already exploded
- `?part=<id>`: open with that part picked (`bowl broth tare oil noodles chashu egg nori menma woodear onion enoki`)

## Run locally

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8126/?preview=1. The camera needs https (or localhost), so use GitHub Pages to try it on a phone.

## Files

- `js/ramen.js` builds the model: both poses of every part, the explode timing and the pins
- `js/textures.js` paints the canvas textures (glaze and thunder band, chashu, egg, nori, menma, broth)
- `js/stage.js` holds the camera feed, gyro lock, framing between the HUD plates, drag, pinch and tap picking, and the tray thumbnails
- `js/app.js` runs the screens and the UI; `js/data.js` holds the part names and lines; `js/look.js` is the shared lighting
- three 0.160.0 is pinned to match the other NomAR apps
