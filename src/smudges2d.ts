// The subjects: dark, unresolvable shapes standing in the park.
//
// The look matters here more than anywhere — a smudge has to read as
// *something that won't come into focus*, not as a grey circle. It's drawn as
// several overlapping soft blobs at low alpha with no ink outline at all,
// which is the one thing in the world with no line on it.

import { hexA, seeded } from "./art2d.ts";
import { WORLD_H, WORLD_W, type Region } from "./world2d.ts";

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

/** One shared sprite, drawn large and scaled down — it's a blur either way. */
export function bakeSmudge(): HTMLCanvasElement {
  const size = 150;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seeded(4242);
  // A tall standing mass, densest at the middle, dissolving at the edges.
  for (let i = 0; i < 22; i++) {
    const x = size / 2 + (rand() - 0.5) * size * 0.34;
    const y = size * 0.55 + (rand() - 0.5) * size * 0.48;
    const r = size * (0.12 + rand() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#2e2b26", 0.2 + rand() * 0.14));
    g.addColorStop(1, hexA("#2e2b26", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function createSmudges2D(
  regions: Record<string, Region>,
  pond: { x: number; y: number; r: number }
): Smudge2D[] {
  const rand = seeded(3141);
  const out: Smudge2D[] = [];
  let n = 0;

  const place = (zone: Region, minR: number, maxR: number): [number, number] => {
    for (let t = 0; t < 40; t++) {
      const a = rand() * Math.PI * 2;
      const d = minR + Math.sqrt(rand()) * (maxR - minR);
      const x = zone.x + Math.cos(a) * d;
      const y = zone.y + Math.sin(a) * d;
      if (x > 4 && x < WORLD_W - 4 && y > 4 && y < WORLD_H - 4
          && Math.hypot(x - pond.x, (y - pond.y) / 0.86) > pond.r + 1.5) {
        return [x, y];
      }
    }
    return [zone.x, zone.y];
  };

  const push = (name: string, set: string, kind: "common" | "timed", zone: Region, minR: number, maxR: number) => {
    const [x, y] = place(zone, minR, maxR);
    out.push({
      id: `s${n++}`, name, set, kind,
      homeX: x, homeY: y, x, y,
      wander: 0.8 + rand() * 1.4,
      seed: rand() * 100,
      visible: kind === "common",
      captured: false,
      timedWindow: null,
    });
  };

  for (const name of NAMES_PARK) push(name, "Park Life", "common", regions.meadow, 6, regions.meadow.r);
  for (const name of NAMES_WATER) push(name, "Waterside", "common", regions.waterside, pond.r + 1.5, pond.r + 7);
  for (const name of NAMES_DARK) push(name, "After Dark", "timed", regions.grove, 4, regions.grove.r);
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
    const t = time * 0.35 + s.seed;
    s.x = s.homeX + Math.sin(t) * s.wander + Math.sin(t * 0.43) * s.wander * 0.4;
    s.y = s.homeY + Math.cos(t * 0.82) * s.wander * 0.6 + Math.cos(t * 0.31) * s.wander * 0.25;
  }
}
