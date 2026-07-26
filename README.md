# Smudgeworld

A photography collection game. You play a stickman with a camera in a
hand-drawn park. Scattered through it are dark, blurry figures — **smudges** —
that the eye can't resolve. Only a photograph can un-smudge one.

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
| Look | Right-drag | Drag the right half of the screen |
| Photograph | `E`, `Space`, or left-click | The camera button, bottom right |
| Collection | `I` | Collection button |
| Pause | `Esc` | — |

Movement is camera-relative — `W` is always into the screen. You don't have to
stop walking to raise the camera; it works mid-stride, and whatever you're
photographing holds still until you're done.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc && vite build → dist/
npm run preview  # serve the built bundle
```

Node 22. No other setup — there are no assets to fetch.

## How it's built

Vite + TypeScript (strict) + Three.js. Three runtime dependencies total.

**Nothing is loaded from disk.** There are no model files, no texture images,
no audio files:

- **Geometry** is Three primitives — cones, icosahedrons, cylinders — plus
  hand-built `BufferGeometry` for the paths and all the line work.
- **Textures** are drawn into a `<canvas>` at load and wrapped in
  `CanvasTexture`: the watercolour washes, the rock strata, the painted park
  floor, the cloud puffs, the subject illustrations on the photo cards.
- **Audio** is synthesised with WebAudio oscillators and noise buffers — wind,
  water, footsteps, a two-part shutter click, birds, crickets, UI stings.

The payoff is that the whole game is one JS bundle (~640 KB, 167 KB gzipped)
plus a handful of icons, which makes the offline install trivially small.

### The look

Two techniques carry the hand-drawn style:

- `outlinedMesh()` wraps every solid — a `MeshToonMaterial` against a
  hand-authored three-band gradient ramp, plus `sketchyEdges()`, which draws
  the same `EdgesGeometry` two or three times with per-vertex jitter and
  falling opacity so silhouettes read as pencil rather than laser-cut.
- Colour comes from splotchy canvas washes rather than flat fills, over a CSS
  paper-grain multiply layer and a vignette. Nightfall is largely a CSS
  multiply tint, because much of the world uses `MeshBasicMaterial` and
  ignores scene lights entirely.

Every canvas texture is flagged `SRGBColorSpace`. Without that, three treats
the canvas as linear data and the output transform lifts it — everything comes
out a stop paler and flatter than it was painted.

### Layout

```
index.html      All the UI — HUD, modals, photo overlay, touch controls.
                Real DOM above the canvas; only the 3D world is Three.
src/
  world.ts      The world generator: seeded RNG, regions, path network,
                placement sampler, every flora and prop factory, hills,
                clouds, sky. Deterministic — same seed, same park.
  main.ts       Game loop and glue: HUD, save/load, proximity, camera boom.
  player.ts     Rig, walk cycle, camera-relative movement, collision.
  input.ts      Keyboard, mouse, touch joystick, orbit drag.
  smudges.ts    Subject placement, wander, night gating.
  photo.ts      Photo mode: focus ring, shutter, develop, result card.
  subjects.ts   Canvas-drawn illustration per subject.
  library.ts    Snapshots, sets, best-take bookkeeping.
  gear.ts       The five camera upgrades and what they change.
  story.ts      The Survey letters.
  daynight.ts   Time of day driving sky, lights, fog, lamps, stars.
  water.ts      Pond, fish, waterfall.
  mountain.ts   The massif and cliff behind the falls.
  npc.ts        Pedestrians.
  celestial.ts  Sun and moon bodies.
  audio.ts      WebAudio synthesis for everything you hear.
public/         Icons, web manifest, service worker.
```

`world.ts` is about a third of the codebase. That's deliberate — the park is
generated, not authored, so all of that complexity lives in one place.

## Deploying

GitHub Actions builds on push and publishes `dist` to Pages. `vite.config.ts`
switches `base` on a `GITHUB_PAGES` env var so the same source works locally
and under a repo subpath.

The service worker is network-first for HTML and cache-first for assets, so an
installed copy keeps working offline but still picks up new builds.

## Status

The single-player core is playable: eleven subjects across three sets, a
day/night cycle, gear to spend coins on, and an epistolary frame that sets up
the economy before it exists.

Save state is `localStorage` only. That's the thing that has to change before
the trading and marketplace work in [DESIGN.md](DESIGN.md) — see the build
order there.

## Licence

MIT. See [LICENSE](LICENSE).
