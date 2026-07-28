# Smudgeworld

A 2D side-scrolling photography collection game. You play a stickman with a
camera walking a hand-drawn park, seen from the side. Scattered along it are
dark, blurry figures — **smudges** — that the eye can't resolve. Only a
photograph can un-smudge one.

**[Play it →](https://liamdapanda.github.io/Smudgeworld/)**

Installs to a phone home screen and runs offline.

---

## The loop

Walk the park until you find a smudge, get close without frightening it, and
raise the camera. The shot develops into a **snapshot** — a collectible card
stamped with a clarity percentage and the moment it was caught.

The world stays smudged forever. The only clear likeness of any of these
creatures is the one in your library.

Snapshots slot into sets — **Park Life**, **Waterside**, **After Dark**.
Completing one pays coins, which buy camera gear, which makes the next plate
sharper.

### Taking the shot

Three things decide a plate, and the viewfinder shows all three live:

- **Focus** — a ring pulses in and out, closing exactly onto the centre
  reticle. Fire when the two circles meet. The subject in the frame is blurred
  to whatever the ring is currently worth, so tightening it is something you
  watch happen rather than a number you're told about.
- **Framing** — the subject drifts around the frame, and the lens only resolves
  what's under the reticle. Pan to keep it there: `A` `D` `W` `S`, the arrow
  keys, or drag the frame.
- **Distance** — how close you walked in before you raised the camera. A
  subject filling the frame beats a speck across the lawn.

The result card breaks the grade into those three, so a bad plate tells you
which part to do differently.

### Not spooking it

Subjects are skittish. Sprinting near one frightens it and it bolts; walking
in is safe until you're almost on top of it, and standing still settles it
again. That's the whole reason the movement has both a walk and a run.

A photographed subject wanders off and comes back a while later somewhere else
in its stretch of the park, so a better plate is always chaseable — the library
keeps your best of each.

## Controls

| | Desktop | Touch |
|---|---|---|
| Walk | `A` `D` or arrows | Joystick, bottom left |
| Run | `Shift` | Push the joystick to its rim |
| Photograph | `E`, `Space`, or left-click | The camera button, bottom right |
| Pan the lens | `A` `D` `W` `S` or arrows, in photo mode | Drag the frame |
| Collection | `I` | Collection button |
| Pause | `Esc` | — |

You don't have to stop walking to raise the camera; it works mid-stride, and
whatever you're photographing holds still on the strip until you're done —
though it still drifts inside the frame.

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

It was a Three.js game until recently. The 3D is gone; what's here is the
side-scrolling view the design doc asked for in the first place.

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

The park is a 340-unit horizontal strip and everything stands on one ground
line. Depth is **parallax layers**, not a sort: six of them, from clouds at
0.1 to foreground grass at 1.4, drawn back to front with no sorting at all.
An item's screen position is `(x - camera.x) * parallax` — the *offset* from
the camera shrinks with distance, so a far mountain still arrives when you
walk to it, it just takes longer to slide past.

Two things carry the rest of the depth. Aerial perspective: distant sprites
are baked into hazed copies washed toward the horizon colour, cached per
sprite. And a **rise** behind the trail — the tree band stands above the
ground line, which is how a side-scroller says "further back", and the rise
is the slope those trees are rooted in so they aren't floating.

The river stands *above* the ground line rather than being cut into it. A
side-scroller has one walkable line, so water on that line has nowhere to be
except under the player's feet; putting it behind the trail means it reads as
a river you walk along, and it gets to hold a far shore.

Time of day is a single wash multiplied over the finished frame.

### Layout

```
index.html      All the UI — HUD, modals, photo overlay, touch controls.
src/
  art2d.ts      Drawing primitives: blobs, washes, ink, tapered strokes.
  sprites2d.ts  Every object in the park, baked to an offscreen canvas.
  player2d.ts   The photographer in profile: two-bone limbs, six walk frames.
  scene2d.ts    Park layout — sections, parallax layers, hills, the massif.
  render2d.ts   Parallax, ground band, river, back rise, shadows.
  smudges2d.ts  Subjects: placement, wander, nerves, respawn, night gating.
  main2d.ts     Game loop and glue.
  daynight2d.ts Time of day, as a colour wash.
  photo.ts      Photo mode: focus, framing, distance, develop, result card.
  subjects.ts   Canvas-drawn illustration per subject.
  library.ts    Snapshots, sets, best-take bookkeeping.
  gear.ts       The seven camera upgrades and what they change.
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
