// Every object in the park, baked once into an offscreen canvas at load.
//
// Drawing in 2D means the silhouette is decided directly rather than emerging
// from geometry — a canopy is the shape I draw, not whatever a stack of rings
// happens to project to. Each sprite is drawn with its origin at the point
// where the object meets the ground, so the renderer can place it by world
// position and sort by depth without knowing anything about what it is.

import {
  BAKE_PX, blobPath, hexA, inkLoop, makeSprite, scribble, seeded, smooth,
  taperedStroke, washFill, type Pt, type Sprite,
} from "./art2d.ts";

const INK = "#2b2b2b";

/** Blend two hex colours; t=0 is a, t=1 is b. */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** Foliage mass: a lumpy blob with scribbled texture and a lit upper-left. */
function canopy(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  hex: string, shade: string, rand: () => number
) {
  // Low-frequency radius variation: a few big lobes, not a crinkled edge.
  const lobes = 2 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  const pts = blobPath(ctx, cx, cy, rx, ry, 14, (_i, t) =>
    1 + Math.sin(t * Math.PI * 2 * lobes + phase) * 0.13 + Math.sin(t * Math.PI * 2 * 7) * 0.04
  );
  washFill(ctx, hex, rand, { x: cx - rx * 1.4, y: cy - ry * 1.4, w: rx * 2.8, h: ry * 2.8 }, {
    pools: 5, shade, light: "#f2f0d8",
  });
  // Shade pooled along the underside, which is what gives a flat blob volume.
  ctx.save();
  const p2 = blobPath(ctx, cx, cy, rx, ry, 14, (_i, t) =>
    1 + Math.sin(t * Math.PI * 2 * lobes + phase) * 0.13 + Math.sin(t * Math.PI * 2 * 7) * 0.04
  );
  void p2;
  ctx.clip();
  const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, hexA(shade, 0));
  g.addColorStop(1, hexA(shade, 0.42));
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx * 1.4, cy - ry * 1.4, rx * 2.8, ry * 2.8);
  ctx.restore();

  scribble(ctx, cx, cy, rx * 0.85, ry * 0.85, Math.round(rx * 1.4), hexA(shade, 1), rand, 4);
  inkLoop(ctx, pts, rand, { width: 1.7, passes: 3, jitter: 1.3 });
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
  birch: ["#ded9c6", "#9a9280"],
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
      const tiers = 5 + Math.floor(rand() * 2);
      for (let i = tiers - 1; i >= 0; i--) {
        const f = i / (tiers - 1);
        const y = -h * (0.16 + f * 0.78);
        const r = h * (0.34 - f * 0.24) * (0.9 + rand() * 0.2);
        // A drooping skirt: wide, shallow, dipping at the edges.
        const pts = blobPath(ctx, 0, y, r, r * 0.34, 12, (_i, t) => {
          const a = t * Math.PI * 2;
          return Math.sin(a) > 0 ? 1.1 : 0.82; // heavier below than above
        });
        washFill(ctx, leafHex, rand, { x: -r * 1.3, y: y - r, w: r * 2.6, h: r * 2 },
          { pools: 3, shade: leafShade, light: "#e9edc9" });
        scribble(ctx, 0, y, r * 0.8, r * 0.28, Math.round(r * 0.5), hexA(leafShade, 1), rand, 4);
        inkLoop(ctx, pts, rand, { width: 1.5, passes: 2, jitter: 1.1 });
      }
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
    // reading as a stick pushed into the ground.
    for (const side of [-1, 1]) {
      taperedStroke(ctx, smooth([
        [side * h * 0.012, -h * 0.03],
        [side * h * 0.045, -h * 0.012],
        [side * h * 0.075, 0],
      ], 4), (t) => h * 0.03 * (1 - t * 0.6), barkShade, rand, false);
    }

    if (kind === "birch") {
      ctx.save();
      ctx.strokeStyle = hexA(INK, 0.65);
      ctx.lineWidth = 1.6;
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
    lobes.forEach((l, i) => {
      // Further lobes sit a shade darker, which is most of what sells depth
      // in a flat drawing.
      const f = i / Math.max(1, lobes.length - 1);
      const lit = mixHex(leafShade, leafHex, 0.35 + f * 0.65);
      canopy(ctx, l.x, l.y, l.r, l.r * 0.84, lit, leafShade, rand);
    });
  });
}

export function drawBush(seed: number, scale = 1): Sprite {
  const rand = seeded(seed);
  const w = 54 * scale, h = 42 * scale;
  return makeSprite(w * 1.3, h * 1.5, w * 0.65, h * 1.15, (ctx) => {
    canopy(ctx, 0, -h * 0.42, w * 0.42, h * 0.42, "#6f8c52", "#41562f", rand);
    canopy(ctx, w * 0.2, -h * 0.28, w * 0.26, h * 0.28, "#7b9a5c", "#41562f", rand);
  });
}

export function drawRock(seed: number, scale = 1): Sprite {
  const rand = seeded(seed);
  const w = 46 * scale, h = 34 * scale;
  return makeSprite(w * 1.4, h * 1.8, w * 0.7, h * 1.25, (ctx) => {
    // Few lobes, flat base: stone is planes meeting at corners.
    const pts = blobPath(ctx, 0, -h * 0.34, w * 0.44, h * 0.4, 8, (i) =>
      i % 3 === 0 ? 1.14 : 0.86 + rand() * 0.12
    );
    washFill(ctx, "#a9a296", rand, { x: -w, y: -h * 1.2, w: w * 2, h: h * 1.8 },
      { pools: 4, shade: "#6f695f", light: "#efece2" });
    inkLoop(ctx, pts, rand, { width: 1.7, passes: 3, jitter: 1.2 });
    // Two cracks, following the form rather than crossing it.
    ctx.save();
    ctx.strokeStyle = hexA("#5b554c", 0.5);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      const x0 = -w * 0.25 + rand() * w * 0.4;
      ctx.moveTo(x0, -h * 0.6);
      ctx.quadraticCurveTo(x0 + (rand() - 0.5) * 10, -h * 0.35, x0 + (rand() - 0.5) * 16, -h * 0.08);
      ctx.stroke();
    }
    ctx.restore();
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
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    washFill(ctx, "#5f7f4a", rand, { x: -w, y: -h * 1.4, w: w * 2, h: h * 2 },
      { pools: 5, shade: "#33421f", light: "#cfe0a8" });
    scribble(ctx, 0, -h * 0.5, w * 0.46, h * 0.42, 60, hexA("#33421f", 1), rand, 4);
    inkLoop(ctx, pts, rand, { width: 1.5, passes: 2, jitter: 0.9 });
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
      inkLoop(ctx, pts, rand, { width: 1.3, passes: 2, jitter: 0.7 });
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
    inkLoop(ctx, pts, rand, { width: 1.4, passes: 2, jitter: 0.6 });
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
      inkLoop(ctx, pts, rand, { width: 1.3, passes: 2, jitter: 0.8 });
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
    inkLoop(ctx, pts, rand, { width: 1.4, passes: 2, jitter: 0.8 });
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
    inkLoop(ctx, end, rand, { width: 1.1, passes: 2, jitter: 0.6 });
  });
}
