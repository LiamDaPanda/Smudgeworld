// The side-scrolling renderer.
//
// Everything stands on one ground line. Layers move at different fractions of
// the camera, which is the whole depth model: a far hill at 0.2 drifts slowly,
// the grass in front of you at 1.35 whips past. Within a layer, items draw in
// order, and the layers draw back to front — no sorting at all.

import { hexA, seeded, BAKE_PX } from "./art2d.ts";
import { type Item, type Scene2D } from "./scene2d.ts";

/** Screen pixels per world unit. */
export const UNIT = 46;
/** Where the ground line sits, as a fraction of viewport height. */
export const GROUND_AT = 0.72;
/** How tall the river stands above the ground line, in world units. */
const WATER_H = 1.55;

export interface Camera { x: number }

export function groundY(vh: number) { return Math.round(vh * GROUND_AT); }

/**
 * Parallax placement.
 *
 * An item sits at world x, and the *offset* from the camera is what shrinks
 * with distance — so a far mountain still arrives when you walk to it, it just
 * takes longer to slide past. Scaling the camera instead of the offset (which
 * is what this used to do) sends anything with a large x off the end of the
 * world and it never appears at all.
 */
export function worldToScreenX(cam: Camera, x: number, parallax: number, vw: number) {
  return (x - cam.x) * parallax * UNIT + vw / 2;
}

// ---------------------------------------------------------------- ground ----

/**
 * Scatter for the ground band, baked once and tiled. Positions come from the
 * tile rather than from world x so it costs one blit per screen-width instead
 * of a few hundred paths per frame.
 */
const TILE_W = 10 * UNIT;
let groundTile: HTMLCanvasElement | null = null;

function bakeGroundTile(bandH: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_W;
  c.height = Math.max(80, Math.ceil(bandH));
  const ctx = c.getContext("2d")!;
  const rand = seeded(90210);
  const h = c.height;

  // Pebbles and grit across the trail.
  for (let i = 0; i < 130; i++) {
    const x = rand() * TILE_W;
    const y = rand() * h * 0.42;
    const r = 0.7 + rand() * 2.1;
    ctx.fillStyle = hexA("#5d5541", 0.10 + rand() * 0.16);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grass ticks over the near band, longer the closer they are.
  ctx.lineCap = "round";
  for (let i = 0; i < 240; i++) {
    const x = rand() * TILE_W;
    const t = rand();
    const y = h * (0.4 + t * 0.6);
    const len = 5 + t * 20;
    const lean = (rand() - 0.5) * 9;
    ctx.strokeStyle = hexA(rand() < 0.5 ? "#3f5730" : "#6c8449", 0.16 + rand() * 0.24);
    ctx.lineWidth = 1 + t * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + lean, y - len);
    ctx.stroke();
  }
  return c;
}

/**
 * The ground band: a strip below the ground line, tinted by whichever section
 * of the park the camera is over, with the joins blended so a border reads as
 * a change of country rather than a seam.
 */
export function drawGround(
  ctx: CanvasRenderingContext2D, scene: Scene2D, cam: Camera, vw: number, vh: number
) {
  const gy = groundY(vh);
  const band = vh - gy;

  // Sample the section tone across the visible width and paint it as a
  // gradient, so a section boundary crossfades instead of stepping.
  const grad = ctx.createLinearGradient(0, 0, vw, 0);
  const stops = 12;
  for (let i = 0; i <= stops; i++) {
    const wx = ((i / stops) * vw - vw / 2) / UNIT + cam.x;
    grad.addColorStop(i / stops, toneAt(scene, wx));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, gy, vw, band);

  // The trail you actually walk on: a worn strip hanging off the ground line,
  // with a wobbled lower edge derived from world x so it scrolls with you.
  const pathBot = (sx: number) => {
    const wx = (sx - vw / 2) / UNIT + cam.x;
    return gy + band * (0.36 + 0.055 * Math.sin(wx * 0.62) + 0.03 * Math.sin(wx * 1.73 + 1.4));
  };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(vw, gy);
  for (let sx = vw; sx >= 0; sx -= 12) ctx.lineTo(sx, pathBot(sx));
  ctx.closePath();
  const pg = ctx.createLinearGradient(0, gy, 0, gy + band * 0.42);
  pg.addColorStop(0, hexA("#b09a72", 0.62));
  pg.addColorStop(1, hexA("#c8b691", 0.30));
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.restore();

  // Scatter.
  if (!groundTile || groundTile.height !== Math.max(80, Math.ceil(band))) {
    groundTile = bakeGroundTile(band);
  }
  ctx.save();
  ctx.globalAlpha = 0.85;
  const off = ((-cam.x * UNIT) % TILE_W + TILE_W) % TILE_W;
  for (let x = off - TILE_W; x < vw; x += TILE_W) {
    ctx.drawImage(groundTile, Math.round(x), gy, TILE_W, band);
  }
  ctx.restore();

  // A darker lip right at the line, so the ground doesn't meet the sky flat.
  const lip = ctx.createLinearGradient(0, gy - 2, 0, gy + band * 0.1);
  lip.addColorStop(0, hexA("#43512f", 0.34));
  lip.addColorStop(1, hexA("#43512f", 0));
  ctx.fillStyle = lip;
  ctx.fillRect(0, gy - 2, vw, band * 0.1);

  // And a shade at the very bottom, so the frame closes.
  const foot = ctx.createLinearGradient(0, vh - band * 0.34, 0, vh);
  foot.addColorStop(0, hexA("#2f3a24", 0));
  foot.addColorStop(1, hexA("#2f3a24", 0.3));
  ctx.fillStyle = foot;
  ctx.fillRect(0, vh - band * 0.34, vw, band * 0.34);
}

function toneAt(scene: Scene2D, wx: number): string {
  const secs = scene.sections;
  const last = secs[secs.length - 1];
  if (wx >= last.to) return last.ground;
  for (let s = 0; s < secs.length; s++) {
    const sec = secs[s];
    if (wx < sec.from || wx >= sec.to) continue;
    const next = secs[s + 1];
    if (next && sec.to - wx < 8) return mix(sec.ground, next.ground, 1 - (sec.to - wx) / 8);
    const prev = secs[s - 1];
    if (prev && wx - sec.from < 8) return mix(sec.ground, prev.ground, 1 - (wx - sec.from) / 8);
    return sec.ground;
  }
  return secs[0].ground;
}

// ----------------------------------------------------------------- water ----

/**
 * The river, standing *above* the ground line rather than cut into it.
 *
 * A side-scroller has one walkable line, so water on that line has nowhere to
 * be except under the player's feet. Putting it behind the trail instead means
 * it reads as a river you walk along — and it gets to hold reflections, which
 * a puddle at your feet never could.
 */
export function drawWater(
  ctx: CanvasRenderingContext2D, scene: Scene2D, cam: Camera, vw: number, vh: number
) {
  const gy = groundY(vh);
  const h = WATER_H * UNIT;
  for (const w of scene.water) {
    const x0 = worldToScreenX(cam, w.from, 1, vw);
    const x1 = worldToScreenX(cam, w.to, 1, vw);
    if (x1 < -60 || x0 > vw + 60) continue;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, gy);
    ctx.lineTo(x0 + h * 0.22, gy - h);
    ctx.lineTo(x1 - h * 0.22, gy - h);
    ctx.lineTo(x1, gy);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createLinearGradient(0, gy - h, 0, gy);
    g.addColorStop(0, "#8fb3c4");
    g.addColorStop(0.45, "#5f8ea8");
    g.addColorStop(1, "#43708c");
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 4, gy - h - 4, x1 - x0 + 8, h + 8);

    // Ripples: horizontal dashes keyed to world position so they scroll with
    // the bank instead of crawling across it.
    const rand = seeded(7717);
    ctx.strokeStyle = hexA("#eef6fa", 0.34);
    ctx.lineCap = "round";
    for (let i = 0; i < 90; i++) {
      const wx = w.from + rand() * (w.to - w.from);
      const y = gy - h * (0.08 + rand() * 0.88);
      const len = 10 + rand() * 40;
      ctx.lineWidth = 1 + rand() * 1.4;
      ctx.globalAlpha = 0.25 + rand() * 0.4;
      const sx = worldToScreenX(cam, wx, 1, vw);
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Far shore: a lip of bank sitting on top of the water, wobbled, so the
    // far edge is a shoreline and not the rim of a swimming pool.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(Math.max(x0, -20), gy - h + 10);
    for (let sx = Math.max(x0, -20); sx <= Math.min(x1, vw + 20); sx += 10) {
      const wx = (sx - vw / 2) / UNIT + cam.x;
      ctx.lineTo(sx, gy - h - 3 + Math.sin(wx * 1.7) * 3 + Math.sin(wx * 4.3 + 2) * 1.8);
    }
    ctx.lineTo(Math.min(x1, vw + 20), gy - h + 10);
    ctx.closePath();
    ctx.fillStyle = toneAt(scene, cam.x);
    ctx.fill();
    ctx.strokeStyle = hexA("#33402c", 0.4);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = hexA("#2b2b2b", 0.4);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x0, gy);
    ctx.lineTo(x0 + h * 0.22, gy - h);
    ctx.moveTo(x1, gy);
    ctx.lineTo(x1 - h * 0.22, gy - h);
    ctx.stroke();
  }
}

/**
 * The rise behind the trail.
 *
 * The tree band stands above the ground line, which is how a side-scroller
 * says "further back" — but standing above the line with nothing under you is
 * also how it says "floating". This is the slope those trees are rooted in.
 * It stops at the water, which has its own bank.
 */
export function drawBackRise(
  ctx: CanvasRenderingContext2D, scene: Scene2D, cam: Camera, vw: number, vh: number
) {
  const gy = groundY(vh);
  const top = (sx: number) => {
    const wx = (sx - vw / 2) / UNIT + cam.x;
    return gy - UNIT * (1.05 + 0.3 * Math.sin(wx * 0.24) + 0.16 * Math.sin(wx * 0.71 + 2.1));
  };
  const dry: [number, number][] = [];
  let cursor = -40;
  for (const w of scene.water) {
    const x0 = worldToScreenX(cam, w.from, 1, vw);
    const x1 = worldToScreenX(cam, w.to, 1, vw);
    if (x1 < cursor) continue;
    if (x0 > vw + 40) break;
    dry.push([cursor, Math.max(cursor, x0)]);
    cursor = Math.max(cursor, x1);
  }
  dry.push([cursor, vw + 40]);

  for (const [a, b] of dry) {
    if (b - a < 2) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a, gy + 4);
    for (let sx = a; sx <= b; sx += 12) ctx.lineTo(sx, top(sx));
    ctx.lineTo(b, top(b));
    ctx.lineTo(b, gy + 4);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, gy - UNIT * 1.5, 0, gy);
    g.addColorStop(0, hexA("#7d966a", 0.95));
    g.addColorStop(1, hexA("#5f7a4c", 0.95));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = hexA("#3c4b30", 0.4);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(a, top(a));
    for (let sx = a; sx <= b; sx += 12) ctx.lineTo(sx, top(sx));
    ctx.stroke();
    ctx.restore();
  }
}

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

// ---------------------------------------------------------------- layers ----

/** The sky, painted straight into the frame behind everything. */
export function drawSky(
  ctx: CanvasRenderingContext2D, vw: number, vh: number,
  top: string, mid: string, horizon: string
) {
  const gy = groundY(vh);
  const g = ctx.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, top);
  g.addColorStop(0.62, mid);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, gy + 1);
}

/** Draw one parallax layer. */
export function drawLayer(
  ctx: CanvasRenderingContext2D, items: Item[], parallax: number,
  cam: Camera, vw: number, vh: number
) {
  const gy = groundY(vh);
  const k = UNIT / BAKE_PX;
  for (const it of items) {
    const sc = k * it.scale;
    const w = it.sprite.canvas.width * sc;
    const hpx = it.sprite.canvas.height * sc;
    const sy = gy - it.lift * UNIT;
    // A tiled item repeats forever; `tile: -1` means "one sprite width", which
    // is what a hill band needs to join up with no seam.
    const step = it.tile === undefined ? 0
      : it.tile < 0 ? w / (parallax * UNIT)
      : it.tile;
    if (step > 0) {
      const reach = (vw / 2 + w) / (parallax * UNIT);
      const from = Math.ceil((cam.x - reach - it.x) / step);
      const to = Math.floor((cam.x + reach - it.x) / step);
      for (let n = from; n <= to; n++) {
        const sx = worldToScreenX(cam, it.x + n * step, parallax, vw);
        ctx.drawImage(it.sprite.canvas, sx - it.sprite.anchorX * sc, sy - it.sprite.anchorY * sc, w, hpx);
      }
      continue;
    }
    const sx = worldToScreenX(cam, it.x, parallax, vw);
    if (sx + w < -60 || sx - w > vw + 60) continue;
    ctx.drawImage(it.sprite.canvas, sx - it.sprite.anchorX * sc, sy - it.sprite.anchorY * sc, w, hpx);
  }
}

/** A contact shadow on the ground line. */
export function drawShadow(
  ctx: CanvasRenderingContext2D, sx: number, gy: number, r: number, alpha = 0.22
) {
  const g = ctx.createRadialGradient(sx, gy, r * 0.1, sx, gy, r);
  g.addColorStop(0, `rgba(40,44,32,${alpha})`);
  g.addColorStop(1, "rgba(40,44,32,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, gy, r, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}
