// The side-scrolling park: a long horizontal strip, built in parallax layers.
//
// Everything stands on one ground line. Depth is layers rather than a y-sort:
// a far hill moves a fraction as fast as the playfield, so the world has
// distance without anything being drawn in perspective. That's the trade a
// side-scroller makes, and in exchange it gets back the one thing the
// top-down view had no room for — a sky, and something on the horizon.

import {
  hazed, hexA, makeSprite, seeded, smooth, washFill, type Pt, type Sprite,
} from "./art2d.ts";
import {
  drawAerial, drawBench, drawBush, drawCairn, drawChimney, drawCrate, drawFern,
  drawFlower, drawGrassTuft, drawHedge, drawLamp, drawLighthouse, drawLog,
  drawMushroom, drawPortal, drawReeds, drawRock, drawTree, drawWashing,
  type TreeKind,
} from "./sprites2d.ts";
import { sectionRanges, worldWidth, WORLDS, type Prop, type WorldDef } from "./worlds.ts";

export interface Item {
  x: number;
  /** Lift off the ground line, in world units. Small, for scatter depth. */
  lift: number;
  sprite: Sprite;
  scale: number;
  /**
   * Repeat forever every N world units. `-1` means "exactly one sprite width",
   * which is what a hill band needs to tile with no seam.
   */
  tile?: number;
}

export interface Layer {
  /** 0 pins to the camera (sky); 1 moves with the player; >1 is foreground. */
  parallax: number;
  items: Item[];
}

export interface Section {
  name: string;
  from: number;
  to: number;
  /** Ground tone for this stretch. */
  ground: string;
  ground2: string;
}

export interface Portal {
  x: number;
  to: string;
  /** Name of the world it opens onto, for the prompt. */
  name: string;
}

export interface Scene2D {
  id: string;
  name: string;
  blurb: string;
  width: number;
  layers: Layer[];
  sections: Section[];
  /** Water spans, drawn into the ground band. */
  water: { from: number; to: number }[];
  portals: Portal[];
  skyTint?: { hex: string; alpha: number };
  trail: string | null;
  rise: [string, string];
  lip: string;
  texture: "grass" | "sand" | "tile";
  spawn: number;
}

const HAZE = "#c2ccd2";

/** A rolling hill silhouette for the background layers. */
function drawHills(seed: number, width: number, height: number, hex: string, detail: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(width, height + 4, 0, height, (ctx) => {
    const pts: Pt[] = [[0, 4]];
    let x = 0;
    while (x < width) {
      const step = width / detail * (0.6 + rand() * 0.8);
      x += step;
      pts.push([Math.min(x, width), -height * (0.35 + rand() * 0.6)]);
    }
    pts.push([width, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], n = pts[i + 1];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
    }
    ctx.lineTo(width, 4);
    ctx.closePath();
    washFill(ctx, hex, rand, { x: 0, y: -height, w: width, h: height + 8 },
      { pools: 8, shade: hex, base: 0.9 });
  });
}

/** The massif and its waterfall — the one long view in the park. */
function drawMassif(seed: number): Sprite {
  const rand = seeded(seed);
  // The canvas is much wider than the range it holds. A peak's half-width can
  // reach 520px and its centre can sit 430px out, so at a canvas the width of
  // the range itself the outer peaks were sliced off by the sprite edge and
  // left a hard vertical cut down the sky.
  const W = 1500, H = 560, SPREAD = 860;
  return makeSprite(W, H + 8, W / 2, H, (ctx) => {
    // Peaks, back to front, each paler than the one behind is nearer.
    const bands = [
      { n: 5, h: 0.98, hex: "#a8b0bd", spread: 1.0 },
      { n: 4, h: 0.8, hex: "#8d95a3", spread: 0.82 },
      { n: 3, h: 0.62, hex: "#79787c", spread: 0.6 },
    ];
    for (const b of bands) {
      for (let i = 0; i < b.n; i++) {
        const cx = (i / (b.n - 1) - 0.5) * SPREAD * b.spread + (rand() - 0.5) * 90;
        // Kept under the canvas height on purpose: at `0.62 + rand() * 0.5`
        // the tallest peaks came to 614px in a 560px canvas and were sliced
        // off square at the top, so the range's highest summit was a mesa.
        const ph = Math.min(H * 0.94, H * b.h * (0.62 + rand() * 0.42));
        const pw = ph * (0.5 + rand() * 0.35);
        // Each flank is smoothed on its own and the two are joined at the
        // summit, so the long slopes roll but the top still comes to a point.
        // Smoothing the ridge as one run rounds the summit off with it and
        // leaves a range of bullets.
        const top: Pt = [cx + pw * 0.04, -ph];
        const ridge: Pt[] = [
          ...smooth([
            [cx - pw, 0], [cx - pw * 0.66, -ph * 0.26],
            [cx - pw * 0.44, -ph * 0.54], [cx - pw * 0.14, -ph * 0.9], top,
          ], 18),
          ...smooth([
            top, [cx + pw * 0.2, -ph * 0.84], [cx + pw * 0.46, -ph * 0.5],
            [cx + pw * 0.72, -ph * 0.24], [cx + pw, 0],
          ], 18).slice(1),
        ];
        const face = (pts: Pt[]) => {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
          ctx.closePath();
        };
        face([...ridge, [cx + pw, 4], [cx - pw, 4]]);
        washFill(ctx, b.hex, rand, { x: cx - pw - 4, y: -ph - 4, w: pw * 2 + 8, h: ph + 8 },
          { pools: 5, shade: "#7b7f88", light: "#f4f6f8" });

        // Everything below is clipped to the peak, so the snowline and the
        // shaded face follow the silhouette exactly instead of being separate
        // shapes floating on top of it.
        ctx.save();
        face([...ridge, [cx + pw, 4], [cx - pw, 4]]);
        ctx.clip();
        // Sun from the left: the whole right flank falls into shade.
        const lightG = ctx.createLinearGradient(cx - pw, 0, cx + pw, 0);
        lightG.addColorStop(0, hexA("#f6f8fa", 0.22));
        lightG.addColorStop(0.42, hexA("#f6f8fa", 0));
        lightG.addColorStop(1, hexA("#4d525d", 0.45));
        ctx.fillStyle = lightG;
        ctx.fillRect(cx - pw - 4, -ph - 8, pw * 2 + 8, ph + 16);
        if (ph > H * b.h * 0.95) {
          const snow = ctx.createLinearGradient(0, -ph, 0, -ph * 0.7);
          snow.addColorStop(0, hexA("#f4f7fa", 0.92));
          snow.addColorStop(0.55, hexA("#f4f7fa", 0.7));
          snow.addColorStop(1, hexA("#f4f7fa", 0));
          ctx.fillStyle = snow;
          ctx.fillRect(cx - pw - 4, -ph - 8, pw * 2 + 8, ph * 0.32);
        }
        ctx.restore();

        // One soft line along the ridge only — a closed loop put a hard edge
        // along the bottom of every peak, where it should vanish behind the
        // peaks in front of it.
        ctx.save();
        ctx.strokeStyle = hexA("#5f6670", 0.4);
        ctx.lineWidth = 1.2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(ridge[0][0], ridge[0][1]);
        for (const p of ridge.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // The fall is drawn *into* the rock, not onto it.
    //
    // Any shape with its own silhouette placed in front of a mountain range
    // reads as a thing standing there — a doorway, an arch, an obelisk. A
    // recess can only be suggested with soft edges, so the cleft is a blurred
    // dark smear with no outline anywhere, and the pale ribbon sits inside it.
    const ch = H * 0.72;
    const cleft = ctx.createLinearGradient(-70, 0, 70, 0);
    cleft.addColorStop(0, hexA("#4a4842", 0));
    cleft.addColorStop(0.28, hexA("#4a4842", 0.5));
    cleft.addColorStop(0.5, hexA("#3a3833", 0.62));
    cleft.addColorStop(0.72, hexA("#4a4842", 0.5));
    cleft.addColorStop(1, hexA("#4a4842", 0));
    ctx.save();
    ctx.fillStyle = cleft;
    ctx.beginPath();
    ctx.moveTo(-24, -ch * 1.02);
    ctx.quadraticCurveTo(-52, -ch * 0.5, -70, 6);
    ctx.lineTo(70, 6);
    ctx.quadraticCurveTo(52, -ch * 0.5, 24, -ch * 1.02);
    ctx.closePath();
    ctx.fill();
    // The cleft has to die out at the top rather than stop. A linear fade would
    // do it vertically and leave a hard rectangle edge either side; a radial one
    // reaches zero in every direction, so there is no edge to see.
    const fade = ctx.createRadialGradient(0, -ch * 0.99, 0, 0, -ch * 0.99, 104);
    fade.addColorStop(0, hexA("#c3c8d0", 0.85));
    fade.addColorStop(1, hexA("#c3c8d0", 0));
    ctx.fillStyle = fade;
    ctx.fillRect(-104, -ch * 0.99 - 104, 208, 208);
    ctx.restore();

    // The fall itself — a pale ribbon widening as it drops.
    const fw = 40;
    // The top stop is transparent so the water emerges from the cleft. Starting
    // it opaque gives the ribbon a flat top edge, and a pale rectangle hanging
    // in the rock is exactly what you see instead of a waterfall.
    const gwater = ctx.createLinearGradient(0, -ch, 0, 0);
    gwater.addColorStop(0, hexA("#f2f7f9", 0));
    gwater.addColorStop(0.18, hexA("#f2f7f9", 0.9));
    gwater.addColorStop(0.7, hexA("#d6e5ec", 0.88));
    gwater.addColorStop(1, hexA("#eef4f6", 0.55));
    ctx.fillStyle = gwater;
    ctx.beginPath();
    ctx.moveTo(-fw * 0.42, -ch * 0.99);
    ctx.lineTo(fw * 0.42, -ch * 0.99);
    ctx.quadraticCurveTo(fw * 0.72, -ch * 0.4, fw * 0.9, 0);
    ctx.lineTo(-fw * 0.9, 0);
    ctx.quadraticCurveTo(-fw * 0.72, -ch * 0.4, -fw * 0.42, -ch * 0.99);
    ctx.closePath();
    ctx.fill();
    // Strands, kept inside the ribbon and off the top — seen from across the
    // park a stray white line reads as a scratch on the screen.
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 22; i++) {
      const x = (rand() - 0.5) * fw * 0.9;
      const y0 = -ch * (0.16 + rand() * 0.58);
      ctx.strokeStyle = hexA("#ffffff", 0.3 + rand() * 0.3);
      ctx.lineWidth = 1.2 + rand() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + (rand() - 0.5) * 4, y0 + 14 + rand() * 24);
      ctx.stroke();
    }
    ctx.restore();
    // Spray at the foot
    for (let i = 0; i < 14; i++) {
      const x = (rand() - 0.5) * fw * 2.4;
      const r = 12 + rand() * 26;
      const g2 = ctx.createRadialGradient(x, -r * 0.3, 0, x, -r * 0.3, r);
      g2.addColorStop(0, hexA("#f4f8fa", 0.5));
      g2.addColorStop(1, hexA("#f4f8fa", 0));
      ctx.fillStyle = g2;
      ctx.fillRect(x - r, -r * 1.4, r * 2, r * 2);
    }
  });
}

/** A soft cloud bank for the sky layer. */
function drawCloud(seed: number): Sprite {
  const rand = seeded(seed);
  const w = 260 + rand() * 220;
  const h = w * 0.34;
  return makeSprite(w * 1.2, h * 2.2, w * 0.6, h * 1.4, (ctx) => {
    for (let i = 0; i < 4; i++) {
      const cx = (rand() - 0.5) * w * 0.6;
      const cy = -h * 0.3 + (rand() - 0.5) * h * 0.3;
      const r = h * (0.55 + rand() * 0.5);
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, hexA("#ffffff", 0.85));
      g.addColorStop(0.6, hexA("#f2f0e6", 0.55));
      g.addColorStop(1, hexA("#f2f0e6", 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  });
}

/**
 * Build a world.
 *
 * Everything that used to be a literal in here — sections, tree mixes, water,
 * the one mountain — now comes off a `WorldDef`, because the second world is
 * only worth walking to if it isn't the first one with the greens swapped.
 */
export function buildScene2D(def: WorldDef): Scene2D {
  const rand = seeded(hashId(def.id));
  const W = worldWidth(def);
  const ranges = sectionRanges(def);
  const sections: Section[] = ranges.map((s) => ({
    name: s.name, from: s.from, to: s.to, ground: s.ground, ground2: s.ground2,
  }));
  const water = def.water;

  const sky: Layer = { parallax: 0.1, items: [] };
  const far: Layer = { parallax: 0.2, items: [] };
  const mid: Layer = { parallax: 0.45, items: [] };
  const back: Layer = { parallax: 0.78, items: [] };
  const play: Layer = { parallax: 1, items: [] };
  const fore: Layer = { parallax: 1.4, items: [] };

  // --- Sky ---
  // Clouds tile on a long period so the band never runs out and never bunches.
  for (let i = 0; i < 8; i++) {
    sky.items.push({
      x: i * 112 + rand() * 60, lift: 6.5 + rand() * 5.5,
      sprite: drawCloud(2000 + i * 13), scale: 0.55 + rand() * 0.55, tile: 900,
    });
  }

  // --- Horizon ---
  // Two tiling hill bands. They carry most of the aerial perspective, so they
  // are painted darker than they read and then washed back toward the haze —
  // washing a pale colour toward a pale colour just gives you paper.
  const haze = def.hills.haze;
  far.items.push({
    x: 0, lift: 0, tile: -1, scale: 1,
    sprite: hazed(drawHills(3001, 1800, def.hills.farH, def.hills.far, 9), 0.42, haze),
  });
  mid.items.push({
    x: 0, lift: 0, tile: -1, scale: 1,
    sprite: hazed(drawHills(3002, 1600, def.hills.midH, def.hills.mid, 11), 0.24, haze),
  });
  if (def.massif !== undefined) {
    far.items.push({ x: def.massif, lift: 0, sprite: hazed(drawMassif(4001), 0.14, haze), scale: 1.15 });
  }

  // --- Sprite pools, baked once per world ---
  const pool: Record<string, Sprite[]> = {};
  const treeOf = (kind: TreeKind) => {
    if (!pool[kind]) pool[kind] = [0, 1, 2, 3, 4, 5].map((i) => drawTree(kind, 3, 900 + i * 37));
    return pool[kind][Math.floor(rand() * 6)];
  };
  const bushes = [0, 1, 2, 3].map((i) => drawBush(300 + i * 13));
  const rocks = [0, 1, 2, 3, 4].map((i) => drawRock(400 + i * 17));
  const ferns = [0, 1, 2].map((i) => drawFern(500 + i * 11));
  const reeds = [0, 1, 2].map((i) => drawReeds(600 + i * 19));
  const hedges = [0, 1, 2].map((i) => drawHedge(700 + i * 23));
  const tufts = [0, 1, 2, 3].map((i) => drawGrassTuft(1000 + i * 7));
  const propCache: Partial<Record<Prop, Sprite[]>> = {};
  const propOf = (kind: Prop): Sprite => {
    let list = propCache[kind];
    if (!list) {
      const make = (i: number): Sprite => {
        switch (kind) {
          case "log": return drawLog(800 + i * 29);
          case "cairn": return drawCairn(850 + i * 31);
          case "bench": return drawBench(1200 + i * 11);
          case "lamp": return drawLamp(1300 + i * 13);
          case "mushroom": return drawMushroom(1400 + i * 17);
          case "chimney": return drawChimney(1500 + i * 19);
          case "aerial": return drawAerial(1600 + i * 23);
          case "washing": return drawWashing(1700 + i * 29);
          case "crate": return drawCrate(1800 + i * 31);
          case "lighthouse": return drawLighthouse(1900);
        }
      };
      list = propCache[kind] = (kind === "lighthouse" ? [0] : [0, 1, 2]).map(make);
    }
    return list[Math.floor(rand() * list.length)];
  };
  const flowerCache = new Map<string, Sprite>();
  const flowerOf = (hex: string) => {
    let f = flowerCache.get(hex);
    if (!f) flowerCache.set(hex, (f = drawFlower(hex, 1100 + flowerCache.size * 5)));
    return f;
  };

  const pickKind = (mixArr: [TreeKind, number][]): TreeKind => {
    const total = mixArr.reduce((n, m) => n + m[1], 0);
    let r = rand() * total;
    for (const [k, wgt] of mixArr) { r -= wgt; if (r <= 0) return k; }
    return mixArr[0][0];
  };
  const inWater = (x: number) => water.some((w) => x > w.from - 2 && x < w.to + 2);
  // Nothing solid may stand where you arrive or where a door is. Placement is
  // random, and a tree that lands on the spawn point pins the player against
  // it — the park generated exactly that and walking right moved 0.28 units in
  // a second instead of five.
  const keepClear = [def.spawn, ...def.portals.map((p) => p.x)];
  // 7 units, not 3: you arrive four units to the side of a door, and a tree
  // standing on the arrival point pins you against it exactly the way one on
  // the spawn point did.
  const crowded = (x: number) => keepClear.some((k) => Math.abs(x - k) < 7);
  const blocked = (x: number) => inWater(x) || crowded(x);

  for (const sec of ranges) {
    const span = sec.span;
    const density = sec.density ?? 0.7;

    if (sec.trees && density > 0) {
      // A band of trees behind the playfield gives the strip depth. It sits
      // above the ground line, which is the side-scroller's only way of saying
      // "further back" for something standing on the same floor as you.
      for (let i = 0; i < span * density * 0.9; i++) {
        const x = sec.from + rand() * span;
        if (inWater(x)) continue;
        back.items.push({
          x, lift: 0.55 + rand() * 0.55,
          sprite: hazed(treeOf(pickKind(sec.trees)), 0.16, haze),
          scale: 0.6 + rand() * 0.2,
        });
      }
      // The playfield band — these are the ones you walk past.
      for (let i = 0; i < span * density * 0.4; i++) {
        const x = sec.from + rand() * span;
        if (blocked(x)) continue;
        play.items.push({ x, lift: 0, sprite: treeOf(pickKind(sec.trees)), scale: 0.95 + rand() * 0.3 });
      }
    }

    const under = sec.under ?? "bush";
    if (under !== "none") {
      const set = under === "fern" ? ferns : under === "hedge" ? hedges : under === "reed" ? reeds : bushes;
      for (let i = 0; i < span * 0.5; i++) {
        const x = sec.from + rand() * span;
        if (inWater(x)) continue;
        play.items.push({ x, lift: 0, sprite: set[Math.floor(rand() * set.length)], scale: 0.85 + rand() * 0.35 });
      }
    }

    for (let i = 0; i < span * (sec.rocks ?? 0.16); i++) {
      const x = sec.from + rand() * span;
      if (inWater(x)) continue;
      play.items.push({ x, lift: 0, sprite: rocks[Math.floor(rand() * rocks.length)], scale: 0.7 + rand() * 0.6 });
    }

    for (const kind of sec.props ?? []) {
      // The lighthouse is a landmark, not scatter — exactly one, near the end.
      const n = kind === "lighthouse" ? 1 : Math.max(1, Math.round(span * 0.055));
      for (let i = 0; i < n; i++) {
        const x = kind === "lighthouse" ? sec.from + span * 0.72 : sec.from + rand() * span;
        if (blocked(x)) continue;
        play.items.push({ x, lift: 0, sprite: propOf(kind), scale: 1 });
      }
    }

    for (let bed = 0; bed < (sec.flowers ? Math.round(span * 0.16) : 0); bed++) {
      const bx = sec.from + rand() * span;
      for (let i = 0; i < 7; i++) {
        const hex = sec.flowers![Math.floor(rand() * sec.flowers!.length)];
        play.items.push({
          x: bx + (rand() - 0.5) * 3, lift: 0, sprite: flowerOf(hex), scale: 0.9 + rand() * 0.3,
        });
      }
    }

    const grass = sec.grass ?? 2;
    for (let i = 0; i < span * grass; i++) {
      play.items.push({
        x: sec.from + rand() * span, lift: 0,
        sprite: tufts[Math.floor(rand() * 4)], scale: 0.8 + rand() * 0.5,
      });
    }
    for (let i = 0; i < span * grass * 0.5; i++) {
      const depth = rand();
      fore.items.push({
        x: sec.from + rand() * span, lift: -0.15 - depth * 2.6,
        sprite: tufts[Math.floor(rand() * 4)], scale: 1.3 + depth * 2.4,
      });
    }
  }

  // Reeds along the water's edges, standing where the bank rises out of it.
  for (const w of water) {
    for (let i = 0; i < 20; i++) {
      const side = rand() < 0.5 ? w.from - rand() * 2.5 : w.to + rand() * 2.5;
      play.items.push({ x: side, lift: 0, sprite: reeds[Math.floor(rand() * 3)], scale: 0.9 + rand() * 0.5 });
    }
  }

  // --- Portals ---
  const portals: Portal[] = def.portals.map((p) => ({
    x: p.x, to: p.to, name: WORLDS[p.to]?.name ?? p.to,
  }));
  for (const p of portals) {
    // Tinted with a colour from the world it opens onto, so a portal is a
    // preview as well as a door.
    const dest = WORLDS[p.to];
    const tint = dest ? dest.sections[0].ground : "#cfd9de";
    play.items.push({ x: p.x, lift: 0, sprite: drawPortal(tint, 5100 + p.x), scale: 1 });
  }

  return {
    id: def.id, name: def.name, blurb: def.blurb, width: W,
    layers: [sky, far, mid, back, play, fore],
    sections, water, portals,
    skyTint: def.skyTint,
    trail: def.trail === undefined ? "#b09a72" : def.trail,
    rise: def.ground.rise, lip: def.ground.lip, texture: def.ground.texture,
    spawn: def.spawn,
  };
}

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export { HAZE };
