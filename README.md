# Desktop Smasher

> Also known as 《桌面破坏王》. Today, it’s okay to fall apart a little.

Turn an image into about 400 square tiles that fly apart, fall, and bounce when you click. Built with plain HTML / CSS / JavaScript and Canvas — no dependencies, no build step. Ready to publish as a static site on GitHub Pages.

## Getting started

Serve the folder with a local static server (opening `index.html` via `file://` is not recommended):

```bash
cd desktop-smasher
python3 -m http.server 8000
# then open http://localhost:8000/
```

All assets use relative paths, so you can publish this folder as the site root on GitHub Pages.

## Controls

| Action | What it does |
| --- | --- |
| Click / tap the stage | On release, tiles near the press point fly apart, fall under gravity, and bounce on the floor |
| Drag on the stage | Gust of wind: pushes nearby loose/landed tiles along the drag; strength follows drag speed. A very fast drag can also pry intact tiles free. Moves under 8px count as a click. Wind is recorded in rewind history for exact playback |
| Import | Pick or drop a JPG / PNG / WebP; the image is processed only in your browser and is never uploaded |
| Smash All | Blasts the whole image outward from the center |
| Rewind (hold) | Plays motion back along the recorded path; release to stop and continue from the current state. Keyboard: with focus, hold Space / Enter |
| Reset | Instantly restores the full image and clears history |
| Export PNG | Saves the current frame as a PNG with an opaque background |

## How it works

- `index.html` — page structure; button icons are inline SVG.
- `css/style.css` — dark theme, responsive layout (≤640px buttons use a two-row grid; touch targets ≥44px).
- `js/sample.js` — default sample image drawn entirely in Canvas code; no external images or fonts.
- `js/app.js` — core logic.
  - **Slicing**: Scales the image to fit the stage, picks a square tile size of `sqrt(area/400)`, and gets about 400 tiles (e.g. 20×20 or 23×17 depending on aspect). Extra edges are cropped centered. Each tile is drawn with `drawImage` from the matching source region.
  - **Large images**: Imports longer than 1600px on the long side are downscaled to 1600px first.
  - **Physics**: Fixed 1/60 s steps, gravity, and simple bounce/friction on the floor and side walls. Tiles do not collide with each other.
  - **Rewind**: Every physics step writes all tiles’ position, angle, and velocity into a preallocated `Float32Array` ring buffer. **Cap: 600 frames (~10 s)** — about 600×400×6×4 bytes ≈ 5.8 MB; older frames are overwritten. Holding Rewind pops frames one by one, so playback is the real path. Recording only happens while tiles are moving.
  - **Single main loop**: One `requestAnimationFrame` loop for the whole page; swapping images or resetting only replaces data and does not stack animations. Rapid successive imports keep only the latest result.
  - **Wind**: Drag wind is queued and applied at the start of the next physics step before history is written, so rewind stays accurate. The stage uses `touch-action: none` so mobile drags do not scroll the page.
  - **Feedback**: Shockwave rings plus a short screen shake; with `prefers-reduced-motion`, shake is off, rings fade faster, and wind streaks are not drawn.
  - **Export**: Draws the current frame onto an opaque offscreen canvas with a dark background, then downloads via `toBlob`.

## Known limits

- Rewind goes back at most ~10 seconds; earlier motion is overwritten (use Reset).
- Tiles do not collide with each other and can overlap after landing.
- Resizing the window or rotating the phone rebuilds the layout and restores the full image.
- Export is the stage view (including the dark background) at screen pixels × device pixel ratio (capped at 2×), not the original image resolution.
- Very old browsers without `createImageBitmap` fall back to `Image` decoding; tested in Chromium (desktop and mobile emulation), not on a real Safari device.
- `window.__smasher` is a read-only debug hook for automated tests and does not affect normal use.

## License

Code and the default sample image are original to this project.
