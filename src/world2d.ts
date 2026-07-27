// The park, laid out in 2D.
//
// Same five regions as before — the layout logic was never the problem, only
// the rendering. Regions define their own planting mix, a hub-and-spoke path
// network connects them, and a rejection sampler keeps things off the walks
// and out of the water.
//
// The ground is painted once into a single large canvas: turf, region tints,
// worn earth, the shore, and the paths. Everything standing on it is a sprite
// with a world position, drawn back-to-front by depth.

import { hexA, seeded } from "./art2d.ts";
import {
  drawBench, drawBush, drawCairn, drawFern, drawFlower, drawGrassTuft,
  drawHedge, drawLamp, drawLog, drawReeds, drawRock, drawTree,
  type TreeKind,
} from "./sprites2d.ts";
import type { Sprite } from "./art2d.ts";

/** World units. One unit is about a third of the player's height. */
export const WORLD_W = 120;
export const WORLD_H = 90;
/** Pixels per world unit when drawing the ground canvas. */
const GROUND_PX = 14;

export interface Prop {
  x: number;
  y: number;
  sprite: Sprite;
  /** Drawn scale, so one baked sprite can serve several sizes. */
  scale: number;
  /** Collision radius; 0 means walk-through. */
  solid: number;
  /** Fades out when the player is behind it, so nothing hides them. */
  canopy?: boolean;
}

export interface Region { x: number; y: number; r: number }

export interface World2D {
  ground: HTMLCanvasElement;
  props: Prop[];
  regions: Record<string, Region>;
  pond: { x: number; y: number; r: number };
  spawn: [number, number];
  /** Ripple centres, for the pond animation. */
  lilies: { x: number; y: number; r: number }[];
}

function quad(t: number, a: number, b: number, c: number) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

export function buildWorld2D(): World2D {
  const rand = seeded(20260727);
  const pond = { x: WORLD_W * 0.78, y: WORLD_H * 0.22, r: 7.5 };
  const hub: [number, number] = [WORLD_W * 0.48, WORLD_H * 0.56];
  const regions: Record<string, Region> = {
    meadow: { x: hub[0], y: hub[1], r: 26 },
    grove: { x: WORLD_W * 0.24, y: WORLD_H * 0.28, r: 24 },
    garden: { x: WORLD_W * 0.8, y: WORLD_H * 0.74, r: 20 },
    wilds: { x: WORLD_W * 0.22, y: WORLD_H * 0.82, r: 20 },
    waterside: { x: pond.x, y: pond.y, r: pond.r + 8 },
  };

  // ---- Paths ----
  const spokes: [number, number, number, number][] = [
    [pond.x - 1, pond.y + pond.r + 3, WORLD_W * 0.72, WORLD_H * 0.42],
    [regions.garden.x, regions.garden.y, WORLD_W * 0.68, WORLD_H * 0.7],
    [regions.grove.x, regions.grove.y, WORLD_W * 0.32, WORLD_H * 0.44],
    [regions.wilds.x, regions.wilds.y, WORLD_W * 0.3, WORLD_H * 0.7],
  ];
  const pathPts: [number, number][] = [];
  for (const [ex, ey, vx, vy] of spokes) {
    for (let i = 0; i <= 60; i++) {
      const t = 0.05 + (i / 60) * 0.95;
      pathPts.push([quad(t, hub[0], vx, ex), quad(t, hub[1], vy, ey)]);
    }
  }

  // ---- Ground canvas ----
  const gw = Math.round(WORLD_W * GROUND_PX);
  const gh = Math.round(WORLD_H * GROUND_PX);
  const ground = document.createElement("canvas");
  ground.width = gw;
  ground.height = gh;
  const g = ground.getContext("2d")!;
  const px = (x: number) => x * GROUND_PX;

  g.fillStyle = "#9dbb6e";
  g.fillRect(0, 0, gw, gh);

  const wash = (
    cx: number, cy: number, r: number, hex: string, a: number
  ) => {
    const grad = g.createRadialGradient(px(cx), px(cy), px(r) * 0.1, px(cx), px(cy), px(r));
    grad.addColorStop(0, hexA(hex, a));
    grad.addColorStop(0.65, hexA(hex, a * 0.5));
    grad.addColorStop(1, hexA(hex, 0));
    g.fillStyle = grad;
    g.beginPath();
    // Wobbly, so region borders aren't circles.
    for (let i = 0; i <= 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rr = r * (0.75 + rand() * 0.45);
      const X = px(cx + Math.cos(ang) * rr);
      const Y = px(cy + Math.sin(ang) * rr);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.closePath();
    g.fill();
  };

  // Broad turf variation, then region character.
  for (let i = 0; i < 420; i++) {
    wash(rand() * WORLD_W, rand() * WORLD_H, 3 + rand() * 7,
      rand() < 0.5 ? "#728f4c" : "#b0cc84", 0.16 + rand() * 0.16);
  }
  const tint: [Region, string, number, number][] = [
    [regions.meadow, "#a8cf62", 90, 0.2],
    [regions.grove, "#405c2e", 120, 0.3],
    [regions.garden, "#8cc07c", 70, 0.18],
    [regions.wilds, "#a89b56", 110, 0.28],
    [regions.waterside, "#82b985", 60, 0.2],
  ];
  for (const [zone, hex, n, a] of tint) {
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * zone.r;
      wash(zone.x + Math.cos(ang) * d, zone.y + Math.sin(ang) * d, 2 + rand() * 5, hex, a);
    }
  }
  // Worn earth
  for (let i = 0; i < 120; i++) {
    wash(rand() * WORLD_W, rand() * WORLD_H, 1.2 + rand() * 2.4, "#a08256", 0.14 + rand() * 0.14);
  }

  // Paths, painted as a soft band with a scuffed core.
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const pass of [
    { w: 4.4, hex: "#cdb68e", a: 0.3 },
    { w: 2.5, hex: "#d8c49c", a: 0.5 },
  ]) {
    for (const [ex, ey, vx, vy] of spokes) {
      g.strokeStyle = hexA(pass.hex, pass.a);
      g.lineWidth = px(pass.w);
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = 0.05 + (i / 60) * 0.95;
        const X = px(quad(t, hub[0], vx, ex));
        const Y = px(quad(t, hub[1], vy, ey));
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
    }
  }
  // Gravel circle at the junction
  for (let i = 0; i < 9; i++) {
    wash(hub[0] + (rand() - 0.5) * 2, hub[1] + (rand() - 0.5) * 2, 1.6 + rand() * 1.6, "#d8c49c", 0.34);
  }

  // Sandy shore, then the water itself.
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2;
    const d = pond.r + 0.2 + rand() * 2.6;
    wash(pond.x + Math.cos(a) * d, pond.y + Math.sin(a) * d, 1 + rand() * 1.8, "#dcc9a0", 0.4);
  }
  {
    g.save();
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const rr = pond.r * (0.95 + Math.sin(ang * 5) * 0.04);
      const X = px(pond.x + Math.cos(ang) * rr);
      const Y = px(pond.y + Math.sin(ang) * rr * 0.86);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.closePath();
    g.clip();
    const wg = g.createRadialGradient(
      px(pond.x), px(pond.y), px(pond.r) * 0.1,
      px(pond.x), px(pond.y), px(pond.r)
    );
    wg.addColorStop(0, "#4d7f9c");
    wg.addColorStop(0.7, "#6e9ab2");
    wg.addColorStop(1, "#93b3c0");
    g.fillStyle = wg;
    g.fillRect(0, 0, gw, gh);
    // Hatching, the same ink language as everything else.
    g.strokeStyle = hexA("#2b3d47", 0.3);
    g.lineWidth = 1.4;
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * pond.r * 0.92;
      const X = px(pond.x + Math.cos(a) * d);
      const Y = px(pond.y + Math.sin(a) * d * 0.86);
      g.beginPath();
      g.moveTo(X - 6 - rand() * 8, Y);
      g.lineTo(X + 6 + rand() * 8, Y);
      g.stroke();
    }
    g.restore();
    // Rim
    g.strokeStyle = hexA("#2b2b2b", 0.55);
    g.lineWidth = 2.4;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const rr = pond.r * (0.95 + Math.sin(ang * 5) * 0.04);
      const X = px(pond.x + Math.cos(ang) * rr);
      const Y = px(pond.y + Math.sin(ang) * rr * 0.86);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.closePath();
    g.stroke();
  }

  // ---- Props ----
  const props: Prop[] = [];
  const placed: { x: number; y: number; r: number }[] = [];
  const free = (x: number, y: number, r: number) => {
    if (x < 2 || x > WORLD_W - 2 || y < 2 || y > WORLD_H - 2) return false;
    if (Math.hypot(x - pond.x, (y - pond.y) / 0.86) < pond.r + r + 0.6) return false;
    for (const p of pathPts) if (Math.hypot(x - p[0], y - p[1]) < 1.8 + r) return false;
    for (const p of placed) if (Math.hypot(x - p.x, y - p.y) < p.r + r) return false;
    return true;
  };
  const pick = (zone: Region, r: number, tries = 16): [number, number] | null => {
    for (let t = 0; t < tries; t++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * zone.r;
      const x = zone.x + Math.cos(a) * d;
      const y = zone.y + Math.sin(a) * d;
      if (free(x, y, r)) return [x, y];
    }
    return null;
  };
  const add = (x: number, y: number, sprite: Sprite, scale: number, solid: number, canopy = false) => {
    placed.push({ x, y, r: Math.max(solid, 0.7) });
    props.push({ x, y, sprite, scale, solid, canopy });
  };

  // Sprite pools — a handful of bakes per kind, reused across the park, so a
  // wood of 150 trees costs six canvases rather than a hundred and fifty.
  const treePool: Record<string, Sprite[]> = {};
  const poolFor = (kind: TreeKind, scale: number) => {
    const key = kind;
    if (!treePool[key]) {
      treePool[key] = [0, 1, 2, 3, 4, 5].map((i) => drawTree(kind, scale, 900 + i * 37));
    }
    return treePool[key][Math.floor(rand() * treePool[key].length)];
  };
  const bushPool = [0, 1, 2, 3].map((i) => drawBush(300 + i * 13));
  const rockPool = [0, 1, 2, 3, 4].map((i) => drawRock(400 + i * 17));
  const fernPool = [0, 1, 2].map((i) => drawFern(500 + i * 11));
  const reedPool = [0, 1, 2].map((i) => drawReeds(600 + i * 19));
  const hedgePool = [0, 1, 2].map((i) => drawHedge(700 + i * 23));
  const logPool = [0, 1].map((i) => drawLog(800 + i * 29));
  const cairnPool = [0, 1].map((i) => drawCairn(850 + i * 31));
  const tuftPool = [0, 1, 2, 3].map((i) => drawGrassTuft(1000 + i * 7));
  const FLOWERS = ["#e0708a", "#c98060", "#dcb85a", "#a37fc9", "#f2efe4"];
  const flowerPool = FLOWERS.map((c, i) => drawFlower(c, 1100 + i * 5));

  const treePlan: { zone: Region; n: number; mix: [TreeKind, number][]; s: [number, number] }[] = [
    { zone: regions.grove, n: 120, mix: [["birch", 5], ["mixed", 4], ["conifer", 2]], s: [2.6, 3.6] },
    { zone: regions.meadow, n: 22, mix: [["mixed", 1]], s: [2.8, 3.8] },
    { zone: regions.garden, n: 34, mix: [["ornamental", 7], ["mixed", 2]], s: [1.9, 2.5] },
    { zone: regions.wilds, n: 30, mix: [["snag", 5], ["conifer", 3], ["mixed", 2]], s: [1.8, 2.6] },
    { zone: regions.waterside, n: 24, mix: [["willow", 5], ["mixed", 3], ["birch", 2]], s: [2.3, 3.2] },
  ];
  const pickKind = (mix: [TreeKind, number][]): TreeKind => {
    const total = mix.reduce((s, m) => s + m[1], 0);
    let r = rand() * total;
    for (const [k, w] of mix) { r -= w; if (r <= 0) return k; }
    return mix[0][0];
  };
  for (const plan of treePlan) {
    for (let i = 0; i < plan.n; i++) {
      const p = pick(plan.zone, 1.1);
      if (!p) continue;
      if (Math.hypot(p[0] - hub[0], p[1] - hub[1]) < 8) continue;
      const kind = pickKind(plan.mix);
      const s = plan.s[0] + rand() * (plan.s[1] - plan.s[0]);
      add(p[0], p[1], poolFor(kind, 3), s / 3, 0.4, kind !== "snag");
    }
  }
  // Fill between the regions so the map has no bald ground.
  for (let i = 0; i < 60; i++) {
    const x = 3 + rand() * (WORLD_W - 6);
    const y = 3 + rand() * (WORLD_H - 6);
    if (Math.hypot(x - hub[0], y - hub[1]) < 8) continue;
    if (!free(x, y, 1.1)) continue;
    const host = treePlan.find((pl) => Math.hypot(x - pl.zone.x, y - pl.zone.y) < pl.zone.r);
    const kind = host ? pickKind(host.mix) : "mixed";
    add(x, y, poolFor(kind, 3), (2.4 + rand() * 0.9) / 3, 0.4, kind !== "snag");
  }

  const under: { zone: Region; n: number; pool: Sprite[]; solid: number }[] = [
    { zone: regions.grove, n: 70, pool: fernPool, solid: 0 },
    { zone: regions.grove, n: 30, pool: bushPool, solid: 0 },
    { zone: regions.wilds, n: 40, pool: bushPool, solid: 0 },
    { zone: regions.garden, n: 26, pool: hedgePool, solid: 0.8 },
    { zone: regions.garden, n: 20, pool: bushPool, solid: 0 },
    { zone: regions.meadow, n: 14, pool: bushPool, solid: 0 },
    { zone: regions.waterside, n: 16, pool: bushPool, solid: 0 },
  ];
  for (const u of under) {
    for (let i = 0; i < u.n; i++) {
      const p = pick(u.zone, 0.6);
      if (!p) continue;
      add(p[0], p[1], u.pool[Math.floor(rand() * u.pool.length)], 0.85 + rand() * 0.3, u.solid);
    }
  }

  // Reeds hug the bank, leaving the near shore clear so the water stays visible.
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rand() * 0.15;
    const d = pond.r + 0.3 + rand() * 1.0;
    const x = pond.x + Math.cos(a) * d;
    const y = pond.y + Math.sin(a) * d * 0.9;
    if (y > pond.y + pond.r * 0.4) continue;
    if (x < 2 || x > WORLD_W - 2 || y < 2) continue;
    props.push({ x, y, sprite: reedPool[Math.floor(rand() * 3)], scale: 0.8 + rand() * 0.4, solid: 0 });
  }

  const rockPlan: [Region, number][] = [
    [regions.wilds, 90], [regions.waterside, 26], [regions.grove, 30], [regions.meadow, 10],
  ];
  for (const [zone, n] of rockPlan) {
    for (let i = 0; i < n; i++) {
      const p = pick(zone, 0.5);
      if (!p) continue;
      add(p[0], p[1], rockPool[Math.floor(rand() * rockPool.length)], 0.7 + rand() * 0.6, 0.45);
    }
  }
  for (let i = 0; i < 12; i++) {
    const p = pick(regions.grove, 1.0);
    if (p) add(p[0], p[1], logPool[Math.floor(rand() * 2)], 0.9 + rand() * 0.3, 0.7);
  }
  for (let i = 0; i < 8; i++) {
    const p = pick(regions.wilds, 0.6);
    if (p) add(p[0], p[1], cairnPool[Math.floor(rand() * 2)], 0.85 + rand() * 0.3, 0.35);
  }

  // Flower beds: tight in the garden, loose drifts on the green.
  for (let bed = 0; bed < 20; bed++) {
    const p = pick(regions.garden, 1.0);
    if (!p) continue;
    for (let i = 0; i < 9 + Math.floor(rand() * 6); i++) {
      props.push({
        x: p[0] + (rand() - 0.5) * 2.4, y: p[1] + (rand() - 0.5) * 2.4,
        sprite: flowerPool[Math.floor(rand() * flowerPool.length)],
        scale: 0.9 + rand() * 0.3, solid: 0,
      });
    }
  }
  for (let drift = 0; drift < 9; drift++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * regions.meadow.r * 0.9;
    const cx = regions.meadow.x + Math.cos(a) * d;
    const cy = regions.meadow.y + Math.sin(a) * d;
    if (Math.hypot(cx - hub[0], cy - hub[1]) < 6) continue;
    const dir = rand() * Math.PI * 2;
    const len = 5 + rand() * 5;
    for (let i = 0; i < 36; i++) {
      const t = rand() - 0.5;
      const off = (rand() + rand() - 1) * 1.4;
      const x = cx + Math.cos(dir) * t * len - Math.sin(dir) * off;
      const y = cy + Math.sin(dir) * t * len + Math.cos(dir) * off;
      if (x < 2 || x > WORLD_W - 2 || y < 2 || y > WORLD_H - 2) continue;
      props.push({ x, y, sprite: flowerPool[4], scale: 0.8 + rand() * 0.3, solid: 0 });
    }
  }

  // Grass tufts everywhere, thickest on the green.
  for (let i = 0; i < 900; i++) {
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    if (Math.hypot(x - pond.x, (y - pond.y) / 0.86) < pond.r) continue;
    props.push({ x, y, sprite: tuftPool[Math.floor(rand() * 4)], scale: 0.8 + rand() * 0.5, solid: 0 });
  }

  // Benches looking onto the garden and the water; lamps along the walks.
  const benchSprite = drawBench(1200);
  for (const zone of [regions.garden, regions.meadow, regions.waterside, regions.garden]) {
    const p = pick(zone, 1.2);
    if (p) add(p[0], p[1], benchSprite, 1, 0.9);
  }
  const lampSprite = drawLamp(1300);
  for (let i = 0; i < 12; i++) {
    const p = pathPts[Math.floor((i + 0.5) / 12 * pathPts.length)];
    if (!p) continue;
    const off = 2.3 + rand() * 0.6;
    const side = i % 2 === 0 ? 1 : -1;
    const x = p[0] + off * side;
    const y = p[1] + off * 0.4 * side;
    if (!free(x, y, 0.7)) continue;
    add(x, y, lampSprite, 1, 0.35);
  }

  const lilies: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * pond.r * 0.7;
    lilies.push({ x: pond.x + Math.cos(a) * d, y: pond.y + Math.sin(a) * d * 0.86, r: 0.5 + rand() * 0.4 });
  }

  return { ground, props, regions, pond, spawn: hub, lilies };
}

export { GROUND_PX };
