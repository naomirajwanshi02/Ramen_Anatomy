# Anatomy of Ramen — WebAR

**Live:** https://naomirajwanshi02.github.io/Ramen_Anatomy/ (open it on your phone and tap **Start AR**)

A bowl of shoyu ramen is set down in your room over the live camera, and it **stays in one place so you can walk all the way round it**. **Tap the bowl** and it explodes into its parts, stacked like an exploded diagram. **Tap any floating piece** (or its picture in the tray) for its name and one line about what it does. There are no numbers on the pieces and no backdrop: what you see behind the ramen is your room.

## How it is anchored

| Phone | Anchor | How |
|---|---|---|
| **Android** (Chrome with ARCore) | **The room** (WebXR `immersive-ar` + hit test) | Move the phone over a table until a ring appears, tap to set the bowl down at real size (23 cm). The ⊕ button moves it. |
| **iPhone** (Safari has no WebXR) and anything else | **The ramen card** (MindAR image tracking) | Print [`target.png`](target.png) or show it on another screen. The bowl stands on the card; walk round the card to see every side. |

`?card=1` forces the card on Android too. The card is drawn from the bowl illustration (`assets/ref-bowl.jpg`, the tracking target only) and compiled by `tools/make-target.html?build=1`.

The design system is copied from **Noh_Masks**: the Anatomy kit in the sepia theme (`css/anatomy-sepia.css`), plates with `Fig.` corners, Zen Maru Gothic, red pill buttons, a glass name card with hint and a scrolling tray of chips. The ramen is built procedurally in three.js (no model files). Its parts are modelled in centimetres from a real donburi and the two reference paintings in `assets/`.

## The 12 parts

| Part | In the bowl | Apart |
|---|---|---|
| Ramen bowl | white glaze, red thunder-pattern bands inside and out | stays at the bottom |
| Broth | amber surface | lifts out as one golden body |
| Tare | dark pool on the bottom | a dark ribbon swirling round the noodles |
| Aromatic oil | golden coins on the soup | round golden drops |
| Noodles | 84 wavy wheat strands | a twisting column, a few strays curling loose |
| Chashu pork | 3 rolled-belly slices at the front | fanned overhead |
| Seasoned egg | half egg, yolk up | floating, yolk facing you |
| Nori | 2 sheets at the back rim | to the right |
| Menma | bamboo shoot strips | fanned right |
| Wood ear | a pile of dark strips | squiggles all round |
| Green onions | a heap of rings in the middle | confetti |
| Enoki | lying on the noodles | standing at the very top |

Noodles, tare and wood ear are single meshes with a **morph target**, so the GPU bends every strand from its bowl shape into its floating shape. Oil, onions and tare drops are instanced.

## Controls

- **Tap the bowl** or **Take it apart** to explode it, **Put it back together** to rebuild it
- **Tap a piece** or a tray chip: its name and one line appear on the card at the top
- **Walk round it**; or **drag** to turn it and **pinch** to resize it
- Keyboard: Space / Enter explode, ← → step through the parts, Esc rebuild

## URL options

- `?card=1`: use the card even where room tracking works
- `?apart=1`: open already exploded; `?part=<id>`: open with that part picked (`bowl broth tare oil noodles chashu egg nori menma woodear onion enoki`)
- `?preview=1`: development only, no camera

## Run locally

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8126/. The camera needs https (or localhost), so use the live GitHub Pages link on a phone.

## Files

- `js/ramen.js` builds the model: both poses of every part and the explode timing
- `js/textures.js` paints the canvas textures (glaze and thunder band, chashu, egg, nori, menma, broth)
- `js/stage.js` runs the three anchors (WebXR room, MindAR card, preview), drag, pinch and tap picking, and the tray thumbnails
- `js/app.js` runs the screens and the UI; `js/data.js` holds the part names and lines; `js/look.js` is the shared lighting
- `tools/make-target.html` draws and compiles the card; mind-ar 1.2.5 and three 0.160.0 are pinned to match the other NomAR apps
