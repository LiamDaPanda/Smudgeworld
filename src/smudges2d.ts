// The subjects: dark, unresolvable shapes standing in the park.
//
// The look matters here more than anywhere — a smudge has to read as
// *something that won't come into focus*, not as a grey circle. It's drawn as
// several overlapping soft blobs at low alpha with no ink outline at all,
// which is the one thing in the world with no line on it.

import { hexA, seeded } from "./art2d.ts";
import { WORLD_W, type Section } from "./scene2d.ts";

export interface Smudge2D {
  id: string;
  name: string;
  set: string;
  kind: "common" | "timed";
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  wander: number;
  seed: number;
  visible: boolean;
  captured: boolean;
  /** Set for timed subjects while their one-second window is open. */
  timedWindow: { start: number; end: number } | null;
  /** photo.ts writes the finished shot here. */
  __lastShot?: unknown;
}

const NAMES_PARK = ["Park Cat", "Bench Sitter", "Pigeon Council", "Kite Runner", "Fountain Diver"];
const NAMES_WATER = ["Heron", "Koi Shadow", "Dragonfly", "Frog Chorus"];
const NAMES_DARK = ["Comet Sparrow", "Blink Fox"];

/**
 * One shared sprite, drawn large and scaled down — it's a blur either way.
 *
 * The trick is that a smudge has to look *out of focus*, not burnt. Piling up
 * near-black blobs gets you a scorch mark on the grass; what reads as a figure
 * refusing to resolve is a cool, mid-value mass with a suggestion of head and
 * shoulders in it and a pale bloom around the edge, the way a blown highlight
 * eats into a dark subject on film.
 */
export function bakeSmudge(): HTMLCanvasElement {
  const size = 150;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seeded(4242);
  const cx = size / 2;

  // A pale bloom first, so the shape lifts off whatever is behind it.
  const halo = ctx.createRadialGradient(cx, size * 0.55, size * 0.1, cx, size * 0.55, size * 0.46);
  halo.addColorStop(0, hexA("#f2f4f2", 0.24));
  halo.addColorStop(1, hexA("#f2f4f2", 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Head, shoulders, mass — the three lumps that say "somebody".
  const lumps: [number, number, number][] = [
    [cx, size * 0.30, size * 0.115],   // head
    [cx, size * 0.47, size * 0.20],    // shoulders
    [cx, size * 0.68, size * 0.235],   // body
  ];
  for (const [x, y, r] of lumps) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#5a5c63", 0.5));
    g.addColorStop(0.55, hexA("#5a5c63", 0.32));
    g.addColorStop(1, hexA("#5a5c63", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Then break the edges up so it never settles into a silhouette.
  for (let i = 0; i < 18; i++) {
    const x = cx + (rand() - 0.5) * size * 0.4;
    const y = size * 0.52 + (rand() - 0.5) * size * 0.52;
    const r = size * (0.07 + rand() * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#4c4e56", 0.13 + rand() * 0.11));
    g.addColorStop(1, hexA("#4c4e56", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function createSmudges2D(sections: Section[]): Smudge2D[] {
  const rand = seeded(3141);
  const out: Smudge2D[] = [];
  let n = 0;
  const byName = (nm: string) => sections.find((s) => s.name === nm)!;

  const push = (name: string, set: string, kind: "common" | "timed", sec: Section) => {
    // Kept off the section's edges so a subject never straddles a border, and
    // spread along it so you don't find two in the same stride.
    const pad = 6;
    const x = sec.from + pad + rand() * Math.max(1, (sec.to - sec.from) - pad * 2);
    out.push({
      id: `s${n++}`, name, set, kind,
      homeX: x, homeY: 0, x, y: 0,
      wander: 1.2 + rand() * 1.8,
      seed: rand() * 100,
      visible: kind === "common",
      captured: false,
      timedWindow: null,
    });
  };

  // Park Life spreads across the green and the garden; Waterside hugs the
  // water; After Dark hides in the grove.
  const parkSecs = [byName("green"), byName("garden"), byName("green"), byName("garden"), byName("green")];
  NAMES_PARK.forEach((nm, i) => push(nm, "Park Life", "common", parkSecs[i]));
  for (const nm of NAMES_WATER) push(nm, "Waterside", "common", byName("waterside"));
  for (const nm of NAMES_DARK) push(nm, "After Dark", "timed", byName("grove"));
  return out;
}

export function updateSmudges2D(
  smudges: Smudge2D[], time: number, night: number, held: Smudge2D | null
) {
  for (const s of smudges) {
    if (s.kind === "timed") {
      // Night only, and even then blinking through a one-second window on a
      // six-second cycle — you have to be there at the hour AND catch it.
      const dark = night > 0.5;
      const cycle = 6;
      const phase = ((time + s.seed) % cycle) / cycle;
      if (dark && phase > 0.9) {
        const start = time - (phase - 0.9) * cycle;
        s.timedWindow = { start, end: start + 1 };
        s.visible = true;
      } else {
        s.visible = false;
        s.timedWindow = null;
      }
    }
    if (s === held) continue;
    // Drift along the strip, and bob a little — a subject that sits perfectly
    // still reads as scenery.
    const t = time * 0.35 + s.seed;
    s.x = s.homeX + Math.sin(t) * s.wander + Math.sin(t * 0.43) * s.wander * 0.4;
    s.x = Math.max(2, Math.min(WORLD_W - 2, s.x));
    s.y = Math.sin(t * 1.6) * 0.12;
  }
}
