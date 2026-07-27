# Smudgeworld

A 2D photography collection game. You play a stickman with a camera in a
hand-drawn park, seen from a three-quarter view. Scattered through it are dark,
blurry figures — **smudges** — that the eye can't resolve. Only a photograph
can un-smudge one.

**[Play it →](https://liamdapanda.github.io/Smudgeworld/)**

Installs to a phone home screen and runs offline.

---

## The loop

Walk the park. When you get close to a smudge, raise the camera. A focus ring
pulses; fire at its tightest for the sharpest plate. The shot develops into a
**snapshot** — a collectible card stamped with a clarity percentage and the
moment it was caught.

The world stays smudged forever. The only clear likeness of any of these
creatures is the one in your library.

Snapshots slot into sets — **Park Life**, **Waterside**, **After Dark**.
Completing one pays coins, which buy camera gear, which makes the next plate
sharper.

## Controls

| | Desktop | Touch |
|---|---|---|
| Walk | `W` `A` `S` `D` | Joystick, bottom left |
| Sprint | `Shift` | Push the joystick to its rim |
| Photograph | `E`, `Space`, or left-click | The camera button, bottom right |
| Collection | `I` | Collection button |
| Pause | `Esc` | — |

You don't have to stop walking to raise the camera; it works mid-stride, and
whatever you're photographing holds still until you're done.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc && vite build → dist/
npm run preview  # serve the built bundle
```

Node 22. No other setup.

## How it's built

Vite + TypeScript (strict) and the Canvas2D API. **No runtime dependencies at
all** — the whole game is 59 KB of JavaScript, 20 KB gzipped.

It was a Three.js game until recently. The 3D is gone; what's here is a
top-down three-quarter view, which turns out to suit a game about walking up
to something and framing it.

### Drawing

The look is watercolour under ink — soft irregular washes with a sketchy
outline drawn two or three times at falling opacity. `art2d.ts` has the
primitives: wobbly closed blobs as smooth beziers, wash fills with pooled
shade and a bleached highlight up-and-left, jittered ink loops, tapered
strokes for anything with a length.

Every object is drawn once at load into an offscreen canvas (`sprites2d.ts`)
with its origin at the point where it meets the ground, then blitted. A wood
of 150 trees costs six baked canvases, not 150.

Drawing in 2D means silhouette is decided directly rather than emerging from
geometry — which is the thing the 3D build kept losing. A canopy is the shape
drawn, not whatever a stack of rings happens to project to.

### Rendering

`render2d.ts` paints the ground canvas, then sorts everything standing on it
by world Y and draws back to front. That sort is doing what a depth buffer did:
a tree in front of the player occludes them, one behind doesn't. A tree
directly between the camera and the player fades — in 3D that needed a camera
boom march and a per-material dissolve; here it's a distance test on two
numbers.

Time of day is a single wash multiplied over the finished frame.

### Layout

```
index.html      All the UI — HUD, modals, photo overlay, touch controls.
src/
  art2d.ts      Drawing primitives: blobs, washes, ink, tapered strokes.
  sprites2d.ts  Every object in the park, baked to an offscreen canvas.
  player2d.ts   The photographer: four facings, four walk frames each.
  world2d.ts    Park layout — regions, paths, placement, the ground canvas.
  render2d.ts   Camera, depth sort, shadows, canopy fade.
  smudges2d.ts  Subjects: placement, wander, night gating.
  main2d.ts     Game loop and glue.
  daynight2d.ts Time of day, as a colour wash.
  photo.ts      Photo mode: focus ring, shutter, develop, result card.
  subjects.ts   Canvas-drawn illustration per subject.
  library.ts    Snapshots, sets, best-take bookkeeping.
  gear.ts       The five camera upgrades and what they change.
  input.ts      Keyboard, mouse, touch joystick.
  audio.ts      WebAudio synthesis for everything you hear.
public/         Icons, web manifest, service worker.
```

Textures and audio are still generated in code rather than loaded from files.
That's how it got built, not a rule to preserve — if an asset is easier to
author in a tool and ship as a file, ship it as a file.

## Deploying

GitHub Actions builds on push and publishes `dist` to Pages. `vite.config.ts`
switches `base` on a `GITHUB_PAGES` env var so the same source works locally
and under a repo subpath.

The service worker is network-first for HTML and cache-first for assets, so an
installed copy keeps working offline but still picks up new builds.

## Status

The single-player core is playable: eleven subjects across three sets, a
day/night cycle, and gear to spend coins on. No story — progression is the
whole of it.

Not carried over from the 3D build, and worth knowing about: the mountain and
waterfall behind the pond, the wandering pedestrians, the flip-through
cutscene on entering, and lamps that light at dusk.

Save state is `localStorage` only. That's the thing that has to change before
the trading and marketplace work in [DESIGN.md](DESIGN.md) — see the build
order there.

## Licence

MIT. See [LICENSE](LICENSE).
