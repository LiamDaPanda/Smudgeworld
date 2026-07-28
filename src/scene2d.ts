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
  drawBench, drawBush, drawCairn, drawFern, drawFlower, drawGrassTuft,
  drawHedge, drawLamp, drawLog, drawReeds, drawRock, drawTree, type TreeKind,
} from "./sprites2d.ts";

/** How far the park runs, left to right. */
export const WORLD_W = 340;

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

export interface Scene2D {
  layers: Layer[];
  sections: Section[];
  /** Water spans, drawn into the ground band. */
  water: { from: number; to: number }[];
  /** Solids the player stops against, as x-intervals. */
  blockers: { x: number; r: number }[];
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

export function buildScene2D(): Scene2D {
  const rand = seeded(20260727);

  const sections: Section[] = [
    { name: "green", from: 0, to: 60, ground: "#9dc06a", ground2: "#7fa354" },
    { name: "grove", from: 60, to: 130, ground: "#6d8c4c", ground2: "#4a6434" },
    { name: "wilds", from: 130, to: 190, ground: "#a89b5e", ground2: "#867a46" },
    { name: "waterside", from: 190, to: 260, ground: "#94bc84", ground2: "#6f9463" },
    { name: "garden", from: 260, to: WORLD_W, ground: "#8fc079", ground2: "#6b9457" },
  ];
  const water = [{ from: 214, to: 240 }];

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
  const hillFar = hazed(drawHills(3001, 1800, 300, "#7d8f9e", 9), 0.42, HAZE);
  const hillMid = hazed(drawHills(3002, 1600, 235, "#63795e", 11), 0.24, HAZE);
  far.items.push({ x: 0, lift: 0, sprite: hillFar, scale: 1, tile: -1 });
  mid.items.push({ x: 0, lift: 0, sprite: hillMid, scale: 1, tile: -1 });
  // The massif sits behind the waterside stretch — the one long view in the
  // park, and the reason the waterfall survived the move to 2D.
  far.items.push({ x: 226, lift: 0, sprite: hazed(drawMassif(4001), 0.14, HAZE), scale: 1.15 });

  // --- Trees ---
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
  const logs = [0, 1].map((i) => drawLog(800 + i * 29));
  const cairns = [0, 1].map((i) => drawCairn(850 + i * 31));
  const tufts = [0, 1, 2, 3].map((i) => drawGrassTuft(1000 + i * 7));
  const FLOWERS = ["#e0708a", "#c98060", "#dcb85a", "#a37fc9", "#f2efe4"];
  const flowers = FLOWERS.map((c, i) => drawFlower(c, 1100 + i * 5));

  const mixFor: Record<string, [TreeKind, number][]> = {
    green: [["mixed", 1]],
    grove: [["birch", 5], ["mixed", 4], ["conifer", 2]],
    wilds: [["snag", 5], ["conifer", 3], ["mixed", 2]],
    waterside: [["willow", 5], ["mixed", 3], ["birch", 2]],
    garden: [["ornamental", 7], ["mixed", 2]],
  };
  const pickKind = (mix: [TreeKind, number][]): TreeKind => {
    const total = mix.reduce((s, m) => s + m[1], 0);
    let r = rand() * total;
    for (const [k, w] of mix) { r -= w; if (r <= 0) return k; }
    return mix[0][0];
  };
  const inWater = (x: number) => water.some((w) => x > w.from - 2 && x < w.to + 2);

  const blockers: { x: number; r: number }[] = [];

  for (const sec of sections) {
    const span = sec.to - sec.from;
    const density = sec.name === "grove" ? 1.5 : sec.name === "green" ? 0.32 : 0.7;

    // A band of trees behind the playfield gives the strip depth. It sits
    // above the ground line, which is the side-scroller's only way of saying
    // "further back" for something standing on the same floor as you.
    for (let i = 0; i < span * density * 0.9; i++) {
      const x = sec.from + rand() * span;
      if (inWater(x)) continue;
      back.items.push({
        x, lift: 0.55 + rand() * 0.55,
        sprite: hazed(treeOf(pickKind(mixFor[sec.name])), 0.16, HAZE),
        scale: 0.6 + rand() * 0.2,
      });
    }
    // The playfield band — these are the ones you walk past.
    for (let i = 0; i < span * density * 0.4; i++) {
      const x = sec.from + rand() * span;
      if (inWater(x)) continue;
      play.items.push({
        x, lift: 0, sprite: treeOf(pickKind(mixFor[sec.name])),
        scale: 0.95 + rand() * 0.3,
      });
      blockers.push({ x, r: 0.35 });
    }
    // Undergrowth
    const under = sec.name === "grove" ? ferns : sec.name === "garden" ? hedges : bushes;
    for (let i = 0; i < span * 0.5; i++) {
      const x = sec.from + rand() * span;
      if (inWater(x)) continue;
      play.items.push({ x, lift: 0, sprite: under[Math.floor(rand() * under.length)], scale: 0.85 + rand() * 0.35 });
    }
    // Rocks, thickest in the wilds
    const rockN = sec.name === "wilds" ? span * 0.7 : span * 0.16;
    for (let i = 0; i < rockN; i++) {
      const x = sec.from + rand() * span;
      if (inWater(x)) continue;
      play.items.push({ x, lift: 0, sprite: rocks[Math.floor(rand() * rocks.length)], scale: 0.7 + rand() * 0.6 });
    }
    if (sec.name === "grove") {
      for (let i = 0; i < 6; i++) {
        play.items.push({ x: sec.from + rand() * span, lift: 0, sprite: logs[Math.floor(rand() * 2)], scale: 0.9 });
      }
    }
    if (sec.name === "wilds") {
      for (let i = 0; i < 5; i++) {
        play.items.push({ x: sec.from + rand() * span, lift: 0, sprite: cairns[Math.floor(rand() * 2)], scale: 0.9 });
      }
    }
    if (sec.name === "garden") {
      for (let bed = 0; bed < 14; bed++) {
        const bx = sec.from + rand() * span;
        for (let i = 0; i < 7; i++) {
          play.items.push({
            x: bx + (rand() - 0.5) * 2.4, lift: 0,
            sprite: flowers[Math.floor(rand() * flowers.length)], scale: 0.9 + rand() * 0.3,
          });
        }
      }
    }
    if (sec.name === "green") {
      for (let d = 0; d < 5; d++) {
        const bx = sec.from + rand() * span;
        for (let i = 0; i < 12; i++) {
          play.items.push({
            x: bx + (rand() - 0.5) * 6, lift: 0,
            sprite: flowers[4], scale: 0.85 + rand() * 0.3,
          });
        }
      }
    }
  }

  // Reeds along the water's edges, standing where the bank rises out of it.
  for (const w of water) {
    for (let i = 0; i < 20; i++) {
      const side = rand() < 0.5 ? w.from - rand() * 2.5 : w.to + rand() * 2.5;
      play.items.push({ x: side, lift: 0, sprite: reeds[Math.floor(rand() * 3)], scale: 0.9 + rand() * 0.5 });
    }
  }

  // Benches and lamps down the walk
  const bench = drawBench(1200);
  const lamp = drawLamp(1300);
  for (let i = 0; i < 7; i++) {
    const x = 12 + rand() * (WORLD_W - 24);
    if (inWater(x)) continue;
    play.items.push({ x, lift: 0, sprite: rand() < 0.5 ? bench : lamp, scale: 1 });
  }

  // Foreground: grass drawn over everything and moving fastest. It runs down
  // into the near band rather than sitting on the line, so the bottom of the
  // frame is somewhere you are rather than an empty slab of colour.
  for (let i = 0; i < 340; i++) {
    const depth = rand();
    fore.items.push({
      x: rand() * WORLD_W, lift: -0.15 - depth * 2.6,
      sprite: tufts[Math.floor(rand() * 4)], scale: 1.3 + depth * 2.4,
    });
  }
  // Grass on the playfield itself, including the bank in front of the river.
  for (let i = 0; i < 700; i++) {
    play.items.push({
      x: rand() * WORLD_W, lift: 0,
      sprite: tufts[Math.floor(rand() * 4)], scale: 0.8 + rand() * 0.5,
    });
  }

  return {
    layers: [sky, far, mid, back, play, fore],
    sections, water, blockers,
    spawn: 26,
  };
}

export { HAZE };
