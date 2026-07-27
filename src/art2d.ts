// The drawing primitives the 2D art is built from.
//
// The look is watercolour under ink: soft irregular washes of colour with a
// sketchy outline drawn over them two or three times at falling opacity. That
// was the 3D game's style too, but there it had to be faked through textures
// and edge geometry. In 2D it's just drawing, which means full control over
// silhouette — the thing the 3D version kept losing.
//
// Everything here works on a plain CanvasRenderingContext2D so sprites can be
// baked once into offscreen canvases at load and then blitted.

export type Pt = [number, number];

/**
 * Pixels per world unit that every sprite is baked at. Kept in one place so
 * the renderer's scale factor can't drift away from the bake scale.
 */
export const BAKE_PX = 64;

/** Deterministic RNG so the park is identical every session. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * A closed blob: a radius-varying loop through `n` points, drawn as a smooth
 * closed curve. This is the shape language of the whole game — canopies,
 * bushes, boulders, clouds are all blobs with different radius functions.
 */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rx: number, ry: number,
  n: number,
  radiusAt: (i: number, t: number) => number
) {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2;
    const k = radiusAt(i, t);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  ctx.beginPath();
  // Catmull-Rom through the points, as bezier segments, so the outline is a
  // continuous curve rather than a polygon.
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (i === 0) ctx.moveTo(p1[0], p1[1]);
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]
    );
  }
  ctx.closePath();
  return pts;
}

/**
 * Fill the current path as a watercolour wash: a base fill, then a few darker
 * pools drifting off-centre, then a lighter bleed. Flat fills are what make
 * cheap 2D look cheap; the unevenness is most of the style.
 */
export function washFill(
  ctx: CanvasRenderingContext2D,
  hex: string,
  rand: () => number,
  bounds: { x: number; y: number; w: number; h: number },
  opts: { base?: number; pools?: number; shade?: string; light?: string } = {}
) {
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hexA(hex, opts.base ?? 0.95);
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  const pools = opts.pools ?? 5;
  const shade = opts.shade ?? hex;
  for (let i = 0; i < pools; i++) {
    const px = bounds.x + rand() * bounds.w;
    const py = bounds.y + rand() * bounds.h;
    const pr = (0.25 + rand() * 0.5) * Math.max(bounds.w, bounds.h);
    const g = ctx.createRadialGradient(px, py, pr * 0.05, px, py, pr);
    g.addColorStop(0, hexA(shade, 0.24 + rand() * 0.2));
    g.addColorStop(1, hexA(shade, 0));
    ctx.fillStyle = g;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
  if (opts.light) {
    // One bleached highlight, up and to the left — a consistent light source
    // across every object is what stops a scene reading as stickers.
    const px = bounds.x + bounds.w * 0.32;
    const py = bounds.y + bounds.h * 0.26;
    const pr = Math.max(bounds.w, bounds.h) * 0.55;
    const g = ctx.createRadialGradient(px, py, pr * 0.05, px, py, pr);
    g.addColorStop(0, hexA(opts.light, 0.34));
    g.addColorStop(1, hexA(opts.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
  ctx.restore();
}

/**
 * Ink the current path: three passes with a little jitter and falling
 * opacity, so the line reads as pencil rather than as a vector stroke.
 *
 * Canvas can't jitter an existing path, so the caller passes the points back
 * and we redraw them offset.
 */
export function inkLoop(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  rand: () => number,
  opts: { color?: string; width?: number; passes?: number; jitter?: number } = {}
) {
  const passes = opts.passes ?? 3;
  const jitter = opts.jitter ?? 1.1;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let p = 0; p < passes; p++) {
    const j = p === 0 ? jitter * 0.25 : jitter * (0.6 + p * 0.5);
    ctx.strokeStyle = hexA(opts.color ?? "#2b2b2b", p === 0 ? 0.85 : 0.34 - p * 0.08);
    ctx.lineWidth = (opts.width ?? 1.6) * (p === 0 ? 1 : 0.8);
    ctx.beginPath();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const jx = () => (rand() - 0.5) * j;
      if (i === 0) ctx.moveTo(p1[0] + jx(), p1[1] + jx());
      ctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6 + jx(), p1[1] + (p2[1] - p0[1]) / 6 + jx(),
        p2[0] - (p3[0] - p1[0]) / 6 + jx(), p2[1] - (p3[1] - p1[1]) / 6 + jx(),
        p2[0] + jx(), p2[1] + jx()
      );
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** A tapered stroke — trunks, boughs, limbs, stems. */
export function taperedStroke(
  ctx: CanvasRenderingContext2D,
  spine: Pt[],
  widthAt: (t: number) => number,
  fill: string,
  rand: () => number,
  ink = true
): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < spine.length; i++) {
    const t = i / (spine.length - 1);
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const w = widthAt(t) / 2;
    left.push([spine[i][0] + nx * w, spine[i][1] + ny * w]);
    right.push([spine[i][0] - nx * w, spine[i][1] - ny * w]);
  }
  const outline: Pt[] = [...left, ...right.reverse()];
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  washFill(ctx, fill, rand, {
    x: Math.min(...xs) - 2, y: Math.min(...ys) - 2,
    w: Math.max(...xs) - Math.min(...xs) + 4, h: Math.max(...ys) - Math.min(...ys) + 4,
  }, { pools: 3 });
  if (ink) inkLoop(ctx, outline, rand, { width: 1.3, passes: 2, jitter: 0.9 });
  return outline;
}

/** Smooth a coarse spine so a stroke doesn't kink. */
export function smooth(points: Pt[], steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (points.length - 1);
    const i0 = Math.min(points.length - 1, Math.floor(t));
    const i1 = Math.min(points.length - 1, i0 + 1);
    const f = t - i0;
    const p0 = points[Math.max(0, i0 - 1)];
    const p1 = points[i0];
    const p2 = points[i1];
    const p3 = points[Math.min(points.length - 1, i1 + 1)];
    const q = (a: number, b: number, c: number, d: number) =>
      0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/** Short scribbled marks — foliage texture, grass, bark. */
export function scribble(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  count: number, color: string, rand: () => number, len = 5
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    const ang = rand() * Math.PI * 2;
    const l = len * (0.5 + rand());
    ctx.globalAlpha = 0.18 + rand() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l);
    ctx.stroke();
  }
  ctx.restore();
}

/** An offscreen canvas with its origin at the object's ground contact point. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Where the ground point sits inside the canvas. */
  anchorX: number;
  anchorY: number;
}

export function makeSprite(
  w: number, h: number, anchorX: number, anchorY: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(anchorX, anchorY);
  draw(ctx);
  return { canvas, anchorX, anchorY };
}

/**
 * Aerial perspective: a copy of a sprite washed toward the horizon colour.
 *
 * This has to happen on the sprite's own canvas. Doing it at draw time with a
 * `source-atop` fill would tint everything already in the frame under that
 * rectangle — sky, ground and all — which is exactly the pale rectangles that
 * used to sit behind every distant tree.
 */
const hazeCache = new Map<string, Sprite>();
const spriteIds = new WeakMap<HTMLCanvasElement, number>();
let nextSpriteId = 0;

export function hazed(s: Sprite, amount: number, hex: string): Sprite {
  const a = Math.round(Math.min(1, Math.max(0, amount)) * 20) / 20;
  if (a <= 0.001) return s;
  let id = spriteIds.get(s.canvas);
  if (id === undefined) { id = nextSpriteId++; spriteIds.set(s.canvas, id); }
  const key = `${id}|${a}|${hex}`;
  const hit = hazeCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = s.canvas.width;
  canvas.height = s.canvas.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(s.canvas, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = a;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const out: Sprite = { canvas, anchorX: s.anchorX, anchorY: s.anchorY };
  hazeCache.set(key, out);
  return out;
}
