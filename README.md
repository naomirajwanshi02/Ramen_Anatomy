# Anatomy of Ramen — WebAR

**Live:** https://naomirajwanshi02.github.io/Ramen_Anatomy/ (open it on your phone and tap **Start AR**)

A bowl of shoyu ramen appears over the live camera: on Android it is set down on your table so you can walk round it; on iPhone you scan the ramen card once and then the bowl floats free, no card needed. **Tap the bowl** and it explodes into its parts, stacked like an exploded diagram. **Tap any floating piece** (or its picture in the tray) for its name and one line about what it does. There are no numbers on the pieces and no backdrop: what you see behind the ramen is your room.

## The flow (same as the other NomAR apps)

1. **Fig. 00 · Allow camera access.** One tap, the browser asks for the camera.
2. **Viewfinder.** Point the camera at the ramen card ([`target.png`](target.png), printed or on another screen). This happens **once**: the card is never asked for again.
3. **Fig. 01 · Instructions** appear over the live camera, with the bowl already floating behind them. Tap **Start**.
4. **The bowl.**
   - **iPhone** (Safari has no room tracking): the bowl floats steady over the camera. No motion-sensor permission is asked for.
   - **Android** (Chrome with ARCore): Start opens room tracking (WebXR). Move over a table until a ring appears and tap to set the bowl down at real size, then walk round it (to move it, ✕ and Start again). If room tracking fails, the bowl floats over the camera instead, with no second scan.
   - ✕ goes back to the instructions; Start brings the bowl back.

`?card=1` uses the floating bowl on Android too. The card is drawn from the bowl illustration (`assets/ref-bowl.jpg`, the tracking target only) and compiled by `tools/make-target.html?build=1`.

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
- **Touch a piece** or a tray chip: it keeps its colours and glows softly while every other part fades toward paper (the same highlight as the Pagoda repo), and its name and one line appear on the card at the top. Touch it again or empty space to let go
- **Zoom in and out** with a pinch (0.25× to 5×)
- **Drag in any direction** to turn it to any angle (sideways spins it, up and down tips it over, upside down included); a flick keeps it turning for a moment. On Android you can also walk round it
- Keyboard: Space / Enter explode, ← → step through the parts, Esc rebuild

## URL options

- `?card=1`: float the bowl over the camera even where room tracking works
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

## Opened from Scan to Explore

The [Scan to Explore](https://github.com/naomirajwanshi02/Scan_To_Explore) hub opens this app as `?from=hub` after it has already recognised the ramen picture, so this app **skips its own scan**: the camera comes straight on behind the instructions (same site, so the hub's camera permission carries over). Both "back" crosses (on the instructions, and the round ✕ above the ⓘ button) return to the hub's scanner; opened on its own, they return to this app's scanner.

The info panel has its own small ✕ to hide it, and the ⓘ button shows it again (touching a part also brings it back), as in the Shinto_Shrine repo.
