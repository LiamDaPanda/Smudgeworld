// Every object in the park, baked once into an offscreen canvas at load.
//
// Drawing in 2D means the silhouette is decided directly rather than emerging
// from geometry — a canopy is the shape I draw, not whatever a stack of rings
// happens to project to. Each sprite is drawn with its origin at the point
// where the object meets the ground, so the renderer can place it by world
// position and sort by depth without knowing anything about what it is.

import {
  BAKE_PX, blobPath, hexA, inkLoop, makeSprite, mergedForm, mixHex, scribble,
  seeded, smooth, taperedStroke, washFill, type Pt, type Sprite,
} from "./art2d.ts";

// Warm charcoal rather than near-black. A true black line at a uniform weight
// is most of what makes flat 2D read as clip art; every outline in here is a
// dark relative of the colour it surrounds, thin, and partly transparent.
const INK = "#3a352c";

export interface Lobe { x: number; y: number; rx: number; ry: number }

/**
 * Foliage: however many lobes you hand it, drawn as one mass.
 *
 * The lobes still exist — they're what stops a crown reading as one smooth
 * egg — but they show up as soft shading inside a single silhouette rather
 * than as separate outlined blobs. Light comes from the upper left across the
 * whole form, not per lobe, which is the other half of why this reads as
 * volume instead of stickers.
 */
function foliageMass(
  ctx: CanvasRenderingContext2D,
  lobes: Lobe[],
  hex: string, shade: string, rand: () => number,
  opts: { line?: number; texture?: number } = {}
) {
  if (!lobes.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const wob = lobes.map(() => ({
    n: 2 + Math.floor(rand() * 3),
    p: rand() * Math.PI * 2,
  }));
  for (const l of lobes) {
    x0 = Math.min(x0, l.x - l.rx * 1.2); x1 = Math.max(x1, l.x + l.rx * 1.2);
    y0 = Math.min(y0, l.y - l.ry * 1.2); y1 = Math.max(y1, l.y + l.ry * 1.2);
  }
  const b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const lit = mixHex(hex, "#f4f2d6", 0.42);

  mergedForm(ctx, b, (c) => {
    c.fillStyle = hex;
    lobes.forEach((l, i) => {
      blobPath(c, l.x, l.y, l.rx, l.ry, 16, (_j, t) =>
        1 + Math.sin(t * Math.PI * 2 * wob[i].n + wob[i].p) * 0.12
          + Math.sin(t * Math.PI * 2 * 7 + wob[i].p) * 0.035);
      c.fill();
    });
  }, {
    line: mixHex(shade, INK, 0.45),
    lineWidth: opts.line ?? 1.5,
    lineAlpha: 0.5,
    shade: (c) => {
      // One light across the whole mass.
      const g = c.createLinearGradient(b.x, b.y, b.x + b.w * 0.5, b.y + b.h);
      g.addColorStop(0, hexA(lit, 0.5));
      g.addColorStop(0.42, hexA(lit, 0));
      g.addColorStop(1, hexA(shade, 0.55));
      c.fillStyle = g;
      c.fillRect(b.x, b.y, b.w, b.h);
      // Then each lobe as a soft bloom and a soft underside — radial, so there
      // is no edge anywhere and the lobes read as one surface rolling over.
      for (const l of lobes) {
        const r = Math.max(l.rx, l.ry);
        const bloom = c.createRadialGradient(
          l.x - l.rx * 0.3, l.y - l.ry * 0.42, r * 0.05,
          l.x - l.rx * 0.3, l.y - l.ry * 0.42, r * 1.05
        );
        bloom.addColorStop(0, hexA(lit, 0.34));
        bloom.addColorStop(1, hexA(lit, 0));
        c.fillStyle = bloom;
        c.fillRect(b.x, b.y, b.w, b.h);
        const under = c.createRadialGradient(
          l.x + l.rx * 0.2, l.y + l.ry * 0.95, r * 0.1,
          l.x + l.rx * 0.2, l.y + l.ry * 0.95, r * 0.95
        );
        under.addColorStop(0, hexA(shade, 0.4));
        under.addColorStop(1, hexA(shade, 0));
        c.fillStyle = under;
        c.fillRect(b.x, b.y, b.w, b.h);
      }
      // Leaf texture, kept faint — at full strength it just reads as dirt.
      for (const l of lobes) {
        scribble(c, l.x, l.y, l.rx * 0.8, l.ry * 0.8,
          Math.round(l.rx * (opts.texture ?? 0.7)), hexA(shade, 0.5), rand, 4);
      }
    },
  });
}

/** One lobe, for the places that only want a single soft mass. */
function canopy(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  hex: string, shade: string, rand: () => number
) {
  foliageMass(ctx, [{ x: cx, y: cy, rx, ry }], hex, shade, rand);
}

export type TreeKind = "mixed" | "birch" | "snag" | "willow" | "ornamental" | "conifer";

const LEAF: Record<string, [string, string]> = {
  mixed: ["#7d9a5c", "#4e6b39"],
  birch: ["#9fbd76", "#68854b"],
  willow: ["#8cab63", "#546f3c"],
  ornamental: ["#8fb268", "#5c7a42"],
  conifer: ["#5c7a49", "#37502f"],
};
const BLOSSOM: [string, string] = ["#e3b6c6", "#b98a9c"];
const BARK: Record<string, [string, string]> = {
  mixed: ["#8a7154", "#5d4a34"],
  birch: ["#cdc7b2", "#8f8878"],
  snag: ["#9c9384", "#6d6558"],
  willow: ["#7f6b51", "#54452f"],
  ornamental: ["#8d7458", "#5e4b36"],
  conifer: ["#705c45", "#453629"],
};

/**
 * A tree. `scale` is roughly its height in world units; the sprite is sized
 * from that so a big oak and a small ornamental are the same code.
 */
export function drawTree(kind: TreeKind, scale: number, seed: number): Sprite {
  const rand = seeded(seed);
  const h = scale * BAKE_PX;
  // Generous bounds. Lobes sit on branch tips that reach out from the trunk
  // and have a radius of their own on top of that; at a tighter canvas the
  // outermost ones were being cut off by the edge, which drew a hard straight
  // line across the crown and read as a pale rectangle behind every tree.
  const w = h * 2.0;
  const blossom = kind === "ornamental" && rand() < 0.45;
  const [leafHex, leafShade] = blossom ? BLOSSOM : (LEAF[kind] ?? LEAF.mixed);
  const [barkHex, barkShade] = BARK[kind] ?? BARK.mixed;

  return makeSprite(w, h * 1.5, w / 2, h * 1.4, (ctx) => {
    if (kind === "conifer") {
      // Trunk visible between the skirts.
      taperedStroke(ctx, smooth([[0, 0], [0, -h * 0.9]], 6),
        (t) => h * 0.055 * (1 - t * 0.6), barkHex, rand);
      // The skirts are one tree, not a stack of separate discs.
      const tiers = 5 + Math.floor(rand() * 2);
      const skirts: Lobe[] = [];
      for (let i = tiers - 1; i >= 0; i--) {
        const f = i / (tiers - 1);
        const r = h * (0.34 - f * 0.24) * (0.9 + rand() * 0.2);
        skirts.push({ x: 0, y: -h * (0.16 + f * 0.78), rx: r, ry: r * 0.4 });
      }
      foliageMass(ctx, skirts, leafHex, leafShade, rand, { line: 1.3, texture: 0.45 });
      return;
    }

    if (kind === "snag") {
      const lean = (rand() - 0.5) * h * 0.16;
      const spine = smooth([[0, 0], [lean * 0.3, -h * 0.4], [lean, -h * 0.82]], 8);
      taperedStroke(ctx, spine, (t) => h * (0.085 - t * 0.045), barkHex, rand);
      const forks = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < forks; i++) {
        const from = spine[Math.floor((0.35 + rand() * 0.6) * (spine.length - 1))];
        const dir = rand() < 0.5 ? -1 : 1;
        const len = h * (0.18 + rand() * 0.22);
        const end: Pt = [from[0] + dir * len, from[1] - len * (0.5 + rand() * 0.7)];
        taperedStroke(ctx, smooth([from, [(from[0] + end[0]) / 2 + dir * len * 0.1, (from[1] + end[1]) / 2], end], 6),
          (t) => h * 0.03 * (1 - t * 0.85), barkShade, rand);
      }
      return;
    }

    if (kind === "willow") {
      taperedStroke(ctx, smooth([[0, 0], [0, -h * 0.34]], 5),
        (t) => h * (0.13 - t * 0.05), barkHex, rand);
      // Wide low crown, then curtains hanging off its underside.
      const cw = h * 0.5, ch = h * 0.26;
      canopy(ctx, 0, -h * 0.52, cw, ch, leafHex, leafShade, rand);
      ctx.save();
      ctx.strokeStyle = hexA(leafShade, 0.85);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      for (let i = 0; i < 34; i++) {
        const t = rand();
        const x = (t - 0.5) * cw * 2;
        const edge = Math.sqrt(Math.max(0, 1 - (x / cw) ** 2));
        const y0 = -h * 0.52 + edge * ch * 0.75;
        const len = h * (0.1 + rand() * 0.22) * (0.4 + edge);
        ctx.globalAlpha = 0.5 + rand() * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 5, y0 + len * 0.6, x + (rand() - 0.5) * 8, y0 + len);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Deciduous family: a real trunk that forks, with masses on the forks.
    const lean = (rand() - 0.5) * h * (kind === "birch" ? 0.1 : 0.14);
    const trunkTop = kind === "birch" ? 0.62 : 0.5;
    const spine = smooth([[0, 0], [lean * 0.35, -h * trunkTop * 0.45], [lean, -h * trunkTop]], 8);
    taperedStroke(ctx, spine, (t) => h * (kind === "birch" ? 0.05 : 0.08) * (1 - t * 0.42), barkHex, rand);

    // Root flare: two short splays at the foot, the thing that stops a trunk
    // reading as a stick pushed into the ground. Drawn in the trunk's own
    // colour — in the shade tone they separated from the trunk and read as a
    // pair of dark claws rather than as the bottom of it.
    for (const side of [-1, 1]) {
      taperedStroke(ctx, smooth([
        [side * h * 0.01, -h * 0.045],
        [side * h * 0.038, -h * 0.014],
        [side * h * 0.062, 0],
      ], 5), (t) => h * 0.028 * (1 - t * 0.72), barkHex, rand, false);
    }

    if (kind === "birch") {
      ctx.save();
      ctx.strokeStyle = hexA(INK, 0.34);
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 9; i++) {
        const t = rand();
        const p = spine[Math.floor(t * (spine.length - 1))];
        const wdt = h * 0.05 * (0.4 + rand() * 0.7);
        ctx.beginPath();
        ctx.moveTo(p[0] - wdt / 2, p[1]);
        ctx.lineTo(p[0] + wdt / 2, p[1] + (rand() - 0.5) * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const top = spine[spine.length - 1];
    const boughs = kind === "ornamental" ? 2 : 3;
    const tips: Pt[] = [[top[0], top[1] - h * 0.06]];
    for (let i = 0; i < boughs; i++) {
      const dir = i === 0 ? -1 : i === 1 ? 1 : (rand() < 0.5 ? -1 : 1);
      const len = h * (0.1 + rand() * 0.12);
      const end: Pt = [top[0] + dir * len, top[1] - len * (0.7 + rand() * 0.6)];
      taperedStroke(ctx, smooth([top, end], 5), (t) => h * 0.035 * (1 - t * 0.7), barkShade, rand, false);
      tips.push(end);
    }

    // Lobes drawn back-to-front — the ones higher on the sprite are further
    // away, so they're laid down first and the nearer ones overlap them. One
    // merged blob has no internal structure and reads as broccoli.
    const masses = kind === "ornamental" ? 3 : 4 + Math.floor(rand() * 2);
    const lobes: { x: number; y: number; r: number; dark: number }[] = [];
    for (let i = 0; i < masses; i++) {
      const p = tips[i % tips.length];
      const r = h * (kind === "ornamental" ? 0.24 : 0.27) * (0.8 + rand() * 0.4);
      lobes.push({
        x: p[0] + (rand() - 0.5) * r * 0.9,
        y: p[1] - r * 0.35 + (rand() - 0.5) * r * 0.55,
        r,
        dark: rand(),
      });
    }
    lobes.sort((a, b) => a.y - b.y);
    foliageMass(
      ctx,
      lobes.map((l) => ({ x: l.x, y: l.y, rx: l.r, ry: l.r * 0.84 })),
      leafHex, leafShade, rand
    );
  });
}

export function drawBush(seed: number, scale = 1): Sprite {
  const rand = seeded(seed);
  const w = 54 * scale, h = 42 * scale;
  return makeSprite(w * 1.3, h * 1.5, w * 0.65, h * 1.15, (ctx) => {
    foliageMass(ctx, [
      { x: 0, y: -h * 0.42, rx: w * 0.42, ry: h * 0.42 },
      { x: w * 0.2, y: -h * 0.28, rx: w * 0.26, ry: h * 0.28 },
    ], "#6f8c52", "#41562f", rand, { line: 1.3 });
  });
}

export function drawRock(seed: number, scale = 1): Sprite {
  const rand = seeded(seed);
  const w = 46 * scale, h = 34 * scale;
  return makeSprite(w * 1.4, h * 1.8, w * 0.7, h * 1.25, (ctx) => {
    // Few lobes, flat base: stone is planes meeting at corners. Even so the
    // form gets one smooth gradient rather than a jittered ink loop — the
    // wobble belongs in the silhouette, not in the line drawn round it.
    const b = { x: -w * 0.6, y: -h * 0.8, w: w * 1.2, h: h * 0.85 };
    mergedForm(ctx, b, (c) => {
      c.fillStyle = "#a9a296";
      blobPath(c, 0, -h * 0.34, w * 0.44, h * 0.4, 9, (i) =>
        i % 3 === 0 ? 1.12 : 0.87 + rand() * 0.1);
      c.fill();
    }, {
      line: "#5f5a51", lineWidth: 1.4, lineAlpha: 0.5,
      shade: (c) => {
        const g = c.createLinearGradient(b.x, b.y, b.x + b.w * 0.6, b.y + b.h);
        g.addColorStop(0, hexA("#eeebe1", 0.55));
        g.addColorStop(0.45, hexA("#eeebe1", 0));
        g.addColorStop(1, hexA("#6f695f", 0.5));
        c.fillStyle = g;
        c.fillRect(b.x, b.y, b.w, b.h);
        c.strokeStyle = hexA("#5b554c", 0.28);
        c.lineWidth = 1.1;
        for (let i = 0; i < 2; i++) {
          const x0 = -w * 0.25 + rand() * w * 0.4;
          c.beginPath();
          c.moveTo(x0, -h * 0.6);
          c.quadraticCurveTo(x0 + (rand() - 0.5) * 10, -h * 0.35, x0 + (rand() - 0.5) * 16, -h * 0.08);
          c.stroke();
        }
      },
    });
  });
}

export function drawFern(seed: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(60, 52, 30, 46, (ctx) => {
    ctx.save();
    ctx.lineCap = "round";
    for (let f = 0; f < 7; f++) {
      const dir = (f / 6 - 0.5) * 2;
      const len = 16 + rand() * 12;
      const tipY = -14 - rand() * 12;
      ctx.strokeStyle = hexA("#41613033".slice(0, 7), 0.9);
      ctx.strokeStyle = hexA("#3f5c30", 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(dir * len * 0.6, tipY * 0.9, dir * len, tipY * 0.45);
      ctx.stroke();
      // barbs
      ctx.lineWidth = 1;
      for (let b = 1; b <= 5; b++) {
        const t = b / 6;
        const bx = dir * len * t * (0.6 + t * 0.4);
        const by = tipY * (0.9 * t * (2 - t)) * 0.75;
        const s = 4 * (1 - t) + 1.5;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - dir * s * 0.4, by - s);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + dir * s * 0.6, by - s * 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  });
}

export function drawReeds(seed: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(52, 76, 26, 70, (ctx) => {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 13; i++) {
      const x = (rand() - 0.5) * 26;
      const hgt = 26 + rand() * 34;
      const lean = (rand() - 0.5) * 14;
      ctx.strokeStyle = hexA(rand() < 0.5 ? "#5f7a45" : "#6f8b50", 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + lean * 0.4, -hgt * 0.6, x + lean, -hgt);
      ctx.stroke();
      if (rand() < 0.34) {
        ctx.fillStyle = "#7c5a3a";
        ctx.beginPath();
        ctx.ellipse(x + lean, -hgt - 3, 2.2, 5.5, lean * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });
}

export function drawHedge(seed: number): Sprite {
  const rand = seeded(seed);
  const w = 82, h = 44;
  return makeSprite(w * 1.2, h * 1.8, w * 0.6, h * 1.3, (ctx) => {
    // The one square silhouette in the park.
    const pts: Pt[] = [];
    const jag = () => (rand() - 0.5) * 3;
    for (let i = 0; i <= 8; i++) pts.push([-w / 2 + (i / 8) * w + jag(), -h + jag()]);
    pts.push([w / 2 + jag(), 0]);
    for (let i = 8; i >= 0; i--) pts.push([-w / 2 + (i / 8) * w + jag(), jag() * 0.4]);
    pts.push([-w / 2 + jag(), -h * 0.5]);
    const b = { x: -w * 0.6, y: -h * 1.1, w: w * 1.2, h: h * 1.2 };
    mergedForm(ctx, b, (c) => {
      c.fillStyle = "#5f7f4a";
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
      c.closePath();
      c.fill();
    }, {
      line: "#3d4d2a", lineWidth: 1.3, lineAlpha: 0.5,
      shade: (c) => {
        const g = c.createLinearGradient(b.x, b.y, b.x + b.w * 0.5, b.y + b.h);
        g.addColorStop(0, hexA("#cfe0a8", 0.5));
        g.addColorStop(0.45, hexA("#cfe0a8", 0));
        g.addColorStop(1, hexA("#33421f", 0.52));
        c.fillStyle = g;
        c.fillRect(b.x, b.y, b.w, b.h);
        scribble(c, 0, -h * 0.5, w * 0.46, h * 0.42, 50, hexA("#33421f", 0.45), rand, 4);
      },
    });
  });
}

export function drawFlower(hex: string, seed: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(16, 26, 8, 24, (ctx) => {
    ctx.strokeStyle = hexA("#4a6236", 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo((rand() - 0.5) * 3, -13);
    ctx.stroke();
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc((rand() - 0.5) * 3, -15, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(INK, 0.55);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
}

export function drawGrassTuft(seed: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(22, 20, 11, 18, (ctx) => {
    ctx.strokeStyle = hexA("#4f6b39", 0.75);
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 9;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 4, -6, x + (rand() - 0.5) * 8, -9 - rand() * 5);
      ctx.stroke();
    }
  });
}

export function drawBench(seed: number): Sprite {
  const rand = seeded(seed);
  const w = 74, h = 46;
  return makeSprite(w * 1.3, h * 1.6, w * 0.65, h * 1.1, (ctx) => {
    const plank = (x0: number, y0: number, x1: number, y1: number, t: number) => {
      const pts: Pt[] = [[x0, y0 - t], [x1, y1 - t], [x1, y1 + t], [x0, y0 + t]];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      washFill(ctx, "#c39a63", rand, { x: x0 - 4, y: Math.min(y0, y1) - t - 4, w: x1 - x0 + 8, h: Math.abs(y1 - y0) + t * 2 + 8 },
        { pools: 2, shade: "#8a6438" });
      inkLoop(ctx, pts, rand, { width: 1.1, passes: 1, jitter: 0.4, color: INK });
    };
    // Legs first, then seat, then back — painter's order within the sprite.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const lx of [-w * 0.4, w * 0.4]) {
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, -h * 0.34);
      ctx.stroke();
    }
    plank(-w / 2, -h * 0.36, w / 2, -h * 0.36, 3.5);
    plank(-w / 2, -h * 0.62, w / 2, -h * 0.62, 3);
    plank(-w / 2, -h * 0.82, w / 2, -h * 0.82, 3);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const lx of [-w * 0.42, w * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(lx, -h * 0.36);
      ctx.lineTo(lx, -h * 0.86);
      ctx.stroke();
    }
  });
}

export function drawLamp(seed: number): Sprite {
  const rand = seeded(seed);
  const h = 120;
  return makeSprite(44, h * 1.15, 22, h * 1.02, (ctx) => {
    taperedStroke(ctx, smooth([[0, 0], [0, -h]], 5), (t) => 5 - t * 1.5, "#3b3f44", rand);
    // Housing: a tapered lantern, wider at the bottom.
    const pts: Pt[] = [[-9, -h], [9, -h], [6, -h - 17], [-6, -h - 17]];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    washFill(ctx, "#4a4f55", rand, { x: -12, y: -h - 20, w: 24, h: 24 }, { pools: 2, shade: "#23262a" });
    inkLoop(ctx, pts, rand, { width: 1.1, passes: 1, jitter: 0.4, color: INK });
    ctx.fillStyle = hexA("#f6e6b4", 0.9);
    ctx.beginPath();
    ctx.ellipse(0, -h - 8, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A stack of stones. Wilds. */
export function drawCairn(seed: number): Sprite {
  const rand = seeded(seed);
  return makeSprite(48, 66, 24, 60, (ctx) => {
    let y = 0;
    const n = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const rw = 15 - f * 7;
      const rh = 5 + rand() * 3;
      const pts = blobPath(ctx, (rand() - 0.5) * 3, y - rh, rw, rh, 7, () => 0.9 + rand() * 0.2);
      washFill(ctx, "#a49d92", rand, { x: -20, y: y - 16, w: 40, h: 20 }, { pools: 2, shade: "#6f695f" });
      inkLoop(ctx, pts, rand, { width: 1.1, passes: 1, jitter: 0.4, color: INK });
      y -= rh * 1.85;
    }
  });
}

/** A mossy fallen log. Grove. */
export function drawLog(seed: number): Sprite {
  const rand = seeded(seed);
  const w = 96;
  return makeSprite(w * 1.3, 56, w * 0.65, 42, (ctx) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push([-w / 2 + (i / 10) * w, -14 + (rand() - 0.5) * 2]);
    for (let i = 10; i >= 0; i--) pts.push([-w / 2 + (i / 10) * w, 0 + (rand() - 0.5) * 2]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    washFill(ctx, "#8b7355", rand, { x: -w, y: -20, w: w * 2, h: 26 }, { pools: 3, shade: "#59452c" });
    inkLoop(ctx, pts, rand, { width: 1.1, passes: 1, jitter: 0.4, color: INK });
    // Moss along the top
    ctx.save();
    ctx.strokeStyle = hexA("#4d6b34", 0.9);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const x = (rand() - 0.5) * w * 0.94;
      ctx.beginPath();
      ctx.moveTo(x, -14);
      ctx.lineTo(x + (rand() - 0.5) * 3, -18 - rand() * 4);
      ctx.stroke();
    }
    ctx.restore();
    // End grain
    const end = blobPath(ctx, w / 2, -7, 5, 7, 8, () => 0.95 + rand() * 0.1);
    washFill(ctx, "#a58a63", rand, { x: w / 2 - 8, y: -16, w: 16, h: 18 }, { pools: 1, shade: "#6d5738" });
    inkLoop(ctx, end, rand, { width: 1.1, passes: 1, jitter: 0.4, color: INK });
  });
}
