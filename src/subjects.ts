// The developed plates: one drawing per subject.
//
// These are the payoff. Everything else in the game exists so that one of
// these lands in the library, so they can't be an ellipse with an ellipse for
// a head — which is what they were.
//
// Drawn as doodles: confident, inaccurate lines that run past the corner, a
// colour wash laid down slightly off the ink, and pen hatching for shadow. The
// wash offset is doing a lot of work here — colour that doesn't quite line up
// with the outline is most of what reads as "drawn by a person".

import { hatch, hexA, seeded, sketch, tracePath, type Pt } from "./art2d.ts";

const cache = new Map<string, HTMLCanvasElement>();
const cutouts = new Map<string, HTMLCanvasElement>();

const INK = "#2f2a24";
const PAPER = "#e8e2d0";

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  s: number;
  rand: () => number;
}

// ------------------------------------------------------------- toolkit ----

/** A closed hand-drawn shape: wash first (offset), then ink over it. */
function shape(
  d: DrawCtx, pts: Pt[],
  fill: string | null,
  opts: { width?: number; wobble?: number; ink?: string; alpha?: number; offset?: number } = {}
) {
  const { ctx, rand } = d;
  if (fill) {
    const o = opts.offset ?? 2.2;
    ctx.save();
    ctx.translate((rand() - 0.5) * o * 2, (rand() - 0.5) * o * 2 + o * 0.4);
    tracePath(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  sketch(ctx, pts, rand, {
    closed: true, color: opts.ink ?? INK,
    width: opts.width ?? 2.1, wobble: opts.wobble ?? 1.5, alpha: opts.alpha ?? 0.92,
  });
}

/** An open hand-drawn line that runs past both ends. */
function line(d: DrawCtx, pts: Pt[], opts: { width?: number; wobble?: number; color?: string; over?: number; alpha?: number } = {}) {
  sketch(d.ctx, pts, d.rand, {
    color: opts.color ?? INK, width: opts.width ?? 2,
    wobble: opts.wobble ?? 1.1, overshoot: opts.over ?? 3, alpha: opts.alpha ?? 0.9,
    passes: 1,
  });
}

/** Points around an ellipse, with a slow wobble so nothing is machined. */
function oval(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 26, warp = 0.07, seed = 1): Pt[] {
  const r = seeded(Math.round(seed * 9973));
  const f = 2 + Math.floor(r() * 3), p = r() * 7;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * f + p) * warp;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

/** Shade a shape: clip to it and lay pen hatching across the lower right. */
function shade(d: DrawCtx, pts: Pt[], amount = 0.22, angle = -0.85) {
  const { ctx, rand } = d;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const b = {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
  };
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  // Only the shaded half gets hatched, so the light has a direction.
  ctx.beginPath();
  ctx.rect(b.x + b.w * 0.34, b.y + b.h * 0.28, b.w, b.h);
  ctx.clip();
  hatch(ctx, b, rand, { angle, spacing: Math.max(4.5, b.w * 0.075), alpha: amount, width: 1.15, color: INK });
  ctx.restore();
}

function dot(d: DrawCtx, x: number, y: number, r: number, fill = INK) {
  d.ctx.fillStyle = fill;
  d.ctx.beginPath();
  d.ctx.arc(x, y, r, 0, Math.PI * 2);
  d.ctx.fill();
}

/** An eye with a highlight — the difference between alive and taxidermy. */
function eye(d: DrawCtx, x: number, y: number, r: number) {
  dot(d, x, y, r);
  d.ctx.fillStyle = "#ffffff";
  d.ctx.beginPath();
  d.ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.34, 0, Math.PI * 2);
  d.ctx.fill();
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / (n - 1));
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function poly(...pts: Pt[]): Pt[] { return pts; }

/** The ground the subject stands on: one scribbled line, not a horizon. */
function groundLine(d: DrawCtx, y: number, x0: number, x1: number) {
  const { s } = d;
  line(d, [[x0, y], [x0 + (x1 - x0) * 0.4, y - s * 0.006], [x1, y + s * 0.004]],
    { width: 2.4, over: 6, alpha: 0.5 });
}

// ------------------------------------------------------------ subjects ----

function drawParkCat(d: DrawCtx) {
  const { ctx, s } = d;
  const FUR = "#d09a5e", FUR_D = "#a9713c";
  groundLine(d, s * 0.86, s * 0.14, s * 0.86);

  // Curled tail first — it sits behind the body.
  const tail: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const a = -0.5 + t * 3.5;
    const r = s * (0.1 + t * 0.06);
    tail.push([s * 0.63 + Math.cos(a) * r, s * 0.76 + Math.sin(a) * r * 0.55]);
  }
  ctx.save();
  ctx.strokeStyle = FUR;
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = "round";
  tracePath(ctx, tail, false);
  ctx.stroke();
  ctx.restore();
  line(d, tail, { width: 1.9, over: 1 });

  // Body: sitting, so a teardrop wide at the base.
  const body = poly(
    [s * 0.42, s * 0.84], [s * 0.36, s * 0.72], [s * 0.36, s * 0.58],
    [s * 0.41, s * 0.47], [s * 0.5, s * 0.44], [s * 0.58, s * 0.5],
    [s * 0.62, s * 0.63], [s * 0.64, s * 0.78], [s * 0.61, s * 0.85],
  );
  shape(d, body, FUR);
  shade(d, body, 0.2);

  // Head
  const head = oval(s * 0.47, s * 0.37, s * 0.115, s * 0.1, -0.06, 22, 0.06, 3);
  shape(d, head, FUR);
  // Ears — two triangles, inked separately so they read as ears not lumps.
  for (const k of [-1, 1]) {
    const ex = s * 0.47 + k * s * 0.075;
    const ear = poly(
      [ex - k * s * 0.028, s * 0.31], [ex + k * s * 0.012, s * 0.245], [ex + k * s * 0.048, s * 0.315],
    );
    shape(d, ear, FUR, { width: 1.9 });
    shape(d, poly(
      [ex - k * s * 0.008, s * 0.303], [ex + k * s * 0.012, s * 0.268], [ex + k * s * 0.03, s * 0.305],
    ), "#e0b193", { width: 1.2, alpha: 0.5 });
  }
  shade(d, head, 0.16);

  // Face: eyes shut, contented.
  for (const k of [-1, 1]) {
    line(d, arc(s * 0.47 + k * s * 0.045, s * 0.365, s * 0.026, 3.5, 5.9, 8),
      { width: 1.8, over: 1.4, wobble: 0.4 });
  }
  const nose = poly([s * 0.462, s * 0.398], [s * 0.478, s * 0.398], [s * 0.47, s * 0.412]);
  shape(d, nose, "#c4736f", { width: 1.3 });
  line(d, [[s * 0.47, s * 0.412], [s * 0.47, s * 0.424]], { width: 1.4, over: 1 });
  for (const k of [-1, 1]) {
    line(d, arc(s * 0.47, s * 0.43, s * 0.022, k > 0 ? 0.3 : 2.85, k > 0 ? 1.1 : 2.1, 6), { width: 1.4, over: 1 });
  }
  // Whiskers
  for (const k of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = s * (0.405 + i * 0.014);
      line(d, [[s * 0.47 + k * s * 0.03, y], [s * 0.47 + k * s * 0.16, y - s * (0.02 - i * 0.016)]],
        { width: 1.1, over: 2, alpha: 0.55 });
    }
  }

  // Front paws, tucked.
  for (const k of [0, 1]) {
    const px = s * 0.44 + k * s * 0.08;
    shape(d, oval(px, s * 0.82, s * 0.04, s * 0.026, 0, 16, 0.05, 5 + k), FUR, { width: 1.7 });
    for (let i = 0; i < 2; i++) {
      line(d, [[px - s * 0.012 + i * s * 0.024, s * 0.806], [px - s * 0.012 + i * s * 0.024, s * 0.826]],
        { width: 1.1, over: 0.6, alpha: 0.5 });
    }
  }
  // Chest stripes
  for (let i = 0; i < 3; i++) {
    line(d, arc(s * 0.44, s * 0.6 + i * s * 0.07, s * 0.05, -0.9, 0.7, 8),
      { width: 1.6, color: FUR_D, over: 1, alpha: 0.6 });
  }
}

function drawBenchSitter(d: DrawCtx) {
  const { s } = d;
  const COAT = "#6b7f96", HAT = "#3f5a44", SKIN = "#e7cfae";
  groundLine(d, s * 0.88, s * 0.1, s * 0.9);

  // Bench: back slats, seat, legs. Drawn round the figure.
  const slat = (y: number, x0: number, x1: number) =>
    shape(d, poly([x0, y], [x1, y], [x1, y + s * 0.035], [x0, y + s * 0.035]), "#a9764a", { width: 1.8 });
  slat(s * 0.44, s * 0.16, s * 0.84);
  slat(s * 0.52, s * 0.16, s * 0.84);
  for (const x of [s * 0.2, s * 0.8]) {
    line(d, [[x, s * 0.42], [x, s * 0.72]], { width: 2.4 });
  }

  // Figure: seated, leaning back, legs crossed.
  const torso = poly(
    [s * 0.41, s * 0.68], [s * 0.4, s * 0.52], [s * 0.44, s * 0.42],
    [s * 0.56, s * 0.41], [s * 0.6, s * 0.52], [s * 0.6, s * 0.68],
  );
  shape(d, torso, COAT);
  shade(d, torso, 0.2);

  const head = oval(s * 0.5, s * 0.335, s * 0.062, s * 0.07, 0, 20, 0.05, 7);
  shape(d, head, SKIN);
  // Hat: crown plus a brim that overshoots on both sides.
  shape(d, poly(
    [s * 0.437, s * 0.305], [s * 0.45, s * 0.245], [s * 0.55, s * 0.245], [s * 0.563, s * 0.305],
  ), HAT, { width: 1.9 });
  shape(d, poly(
    [s * 0.41, s * 0.305], [s * 0.59, s * 0.3], [s * 0.592, s * 0.318], [s * 0.408, s * 0.322],
  ), HAT, { width: 1.7 });
  dot(d, s * 0.478, s * 0.34, s * 0.008);
  line(d, arc(s * 0.5, s * 0.345, s * 0.03, 0.5, 1.5, 6), { width: 1.3, over: 1, alpha: 0.5 });

  // Seat: thighs out, then shins down, one crossed over.
  shape(d, poly(
    [s * 0.42, s * 0.66], [s * 0.72, s * 0.63], [s * 0.73, s * 0.69], [s * 0.43, s * 0.72],
  ), "#4e5a68", { width: 1.9 });
  line(d, [[s * 0.7, s * 0.68], [s * 0.72, s * 0.8], [s * 0.68, s * 0.87]], { width: 3 });
  line(d, [[s * 0.62, s * 0.7], [s * 0.66, s * 0.82], [s * 0.62, s * 0.87]], { width: 3 });
  for (const x of [s * 0.68, s * 0.62]) {
    shape(d, poly([x - s * 0.03, s * 0.87], [x + s * 0.03, s * 0.865], [x + s * 0.032, s * 0.885], [x - s * 0.03, s * 0.888]),
      "#3b332a", { width: 1.6 });
  }

  // Newspaper — the thing that says "sitter" rather than "person".
  shape(d, poly(
    [s * 0.33, s * 0.5], [s * 0.46, s * 0.47], [s * 0.47, s * 0.63], [s * 0.34, s * 0.65],
  ), "#efe9dc", { width: 1.8 });
  for (let i = 0; i < 5; i++) {
    line(d, [[s * 0.35, s * 0.52 + i * s * 0.025], [s * 0.45, s * 0.508 + i * s * 0.025]],
      { width: 1, over: 0.5, alpha: 0.45 });
  }
  line(d, [[s * 0.44, s * 0.52], [s * 0.42, s * 0.6]], { width: 2.2, over: 1 });
}

function drawPigeonCouncil(d: DrawCtx) {
  const { s } = d;
  groundLine(d, s * 0.84, s * 0.1, s * 0.9);

  const pigeon = (x: number, y: number, r: number, faceLeft: boolean, seed: number, strut: boolean) => {
    const k = faceLeft ? -1 : 1;
    const body = oval(x, y, r * 1.35, r * 0.95, faceLeft ? 0.12 : -0.12, 22, 0.07, seed);
    shape(d, body, "#8e93a0");
    shade(d, body, 0.2);
    // Tail
    shape(d, poly(
      [x - k * r * 1.1, y - r * 0.1], [x - k * r * 2.1, y - r * 0.55],
      [x - k * r * 2.05, y + r * 0.15], [x - k * r * 1.1, y + r * 0.35],
    ), "#767c8a", { width: 1.8 });
    // Neck + head, one continuous shape so it isn't a ball on a body.
    const head = oval(x + k * r * 1.25, y - r * (strut ? 1.15 : 0.95), r * 0.56, r * 0.52, 0, 18, 0.06, seed + 1);
    shape(d, poly(
      [x + k * r * 0.4, y - r * 0.6], [x + k * r * 1.0, y - r * (strut ? 1.3 : 1.1)],
      [x + k * r * 1.5, y - r * (strut ? 1.05 : 0.85)], [x + k * r * 0.7, y - r * 0.15],
    ), "#6f7a95", { width: 1.6 });
    shape(d, head, "#8e93a0", { width: 1.9 });
    // Beak
    shape(d, poly(
      [x + k * r * 1.7, y - r * (strut ? 1.25 : 1.05)],
      [x + k * r * 2.35, y - r * (strut ? 1.1 : 0.92)],
      [x + k * r * 1.7, y - r * (strut ? 0.98 : 0.8)],
    ), "#d0a266", { width: 1.5 });
    eye(d, x + k * r * 1.35, y - r * (strut ? 1.25 : 1.05), r * 0.14);
    // Feet
    for (const o of [-0.35, 0.35]) {
      line(d, [[x + r * o, y + r * 0.8], [x + r * o * 1.2, y + r * 1.5]], { width: 1.7, over: 1 });
      for (const t of [-1, 0, 1]) {
        line(d, [[x + r * o * 1.2, y + r * 1.5], [x + r * o * 1.2 + t * r * 0.28, y + r * 1.72]],
          { width: 1.2, over: 0.6 });
      }
    }
    // Wing line
    line(d, arc(x, y + r * 0.1, r * 0.85, faceLeft ? 0.4 : 2.6, faceLeft ? 1.9 : 4.1, 9),
      { width: 1.5, over: 1, alpha: 0.6, color: "#5c6270" });
  };

  // A ring: two facing in, one strutting between them.
  pigeon(s * 0.28, s * 0.68, s * 0.072, false, 11, false);
  pigeon(s * 0.74, s * 0.66, s * 0.076, true, 23, false);
  pigeon(s * 0.5, s * 0.75, s * 0.085, true, 37, true);

  // The crumb they are all here about.
  shape(d, oval(s * 0.5, s * 0.885, s * 0.018, s * 0.012, 0.3, 12, 0.15, 41), "#d9c48d", { width: 1.4 });
}

function drawKiteRunner(d: DrawCtx) {
  const { s } = d;
  const SHIRT = "#c9635a", HAIR = "#4a3526";

  // Kite, high and small — the whole point of the picture is the diagonal.
  const kx = s * 0.75, ky = s * 0.2;
  shape(d, poly([kx, ky - s * 0.1], [kx + s * 0.08, ky], [kx, ky + s * 0.11], [kx - s * 0.08, ky]),
    "#e0b054", { width: 2 });
  line(d, [[kx, ky - s * 0.1], [kx, ky + s * 0.11]], { width: 1.4, alpha: 0.6, over: 1 });
  line(d, [[kx - s * 0.08, ky], [kx + s * 0.08, ky]], { width: 1.4, alpha: 0.6, over: 1 });
  // Tail bows
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const bx = kx + s * (0.02 + t * 0.12), by = ky + s * (0.12 + t * 0.14);
    line(d, [[bx - s * 0.018, by - s * 0.014], [bx + s * 0.018, by + s * 0.014]], { width: 1.6, over: 0.8 });
  }
  // String: one long confident curve down to the hand.
  line(d, [[kx - s * 0.02, ky + s * 0.1], [s * 0.6, s * 0.36], [s * 0.44, s * 0.47]],
    { width: 1.5, over: 2, alpha: 0.75, wobble: 0.6 });

  groundLine(d, s * 0.9, s * 0.08, s * 0.92);

  // Limbs get width, not stroke weight — a run reads through the *shapes* the
  // arms and legs make, and two thin sticks can't hold a pose.
  const limb = (a: Pt, b: Pt, c: Pt, w: number, fill: string) => {
    const seg = (p: Pt, q: Pt, ww: number) => {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * ww, ny = (dx / l) * ww;
      shape(d, poly(
        [p[0] + nx, p[1] + ny], [q[0] + nx * 0.7, q[1] + ny * 0.7],
        [q[0] - nx * 0.7, q[1] - ny * 0.7], [p[0] - nx, p[1] - ny],
      ), fill, { width: 1.7, offset: 1.3 });
    };
    seg(a, b, w);
    seg(b, c, w * 0.78);
  };

  // Trailing arm and back leg first — they sit behind the body.
  limb([s * 0.34, s * 0.53], [s * 0.24, s * 0.57], [s * 0.17, s * 0.52], s * 0.026, "#b0524a");
  limb([s * 0.36, s * 0.68], [s * 0.27, s * 0.77], [s * 0.2, s * 0.73], s * 0.032, "#3f4d5e");
  shape(d, oval(s * 0.185, s * 0.735, s * 0.032, s * 0.017, -0.3, 12, 0.1, 17), "#3b332a", { width: 1.5 });

  // Torso: shoulders wide, waist narrow, leaning into the run.
  const torso = poly(
    [s * 0.31, s * 0.7], [s * 0.29, s * 0.6], [s * 0.3, s * 0.5],
    [s * 0.36, s * 0.455], [s * 0.44, s * 0.47], [s * 0.45, s * 0.56],
    [s * 0.42, s * 0.66], [s * 0.4, s * 0.71],
  );
  shape(d, torso, SHIRT);
  shade(d, torso, 0.2);

  // Front leg, driving forward.
  limb([s * 0.38, s * 0.69], [s * 0.47, s * 0.75], [s * 0.55, s * 0.71], s * 0.034, "#4d5d70");
  shape(d, oval(s * 0.565, s * 0.712, s * 0.032, s * 0.017, 0.2, 12, 0.1, 19), "#3b332a", { width: 1.5 });

  const head = oval(s * 0.38, s * 0.375, s * 0.062, s * 0.066, 0.15, 20, 0.05, 13);
  shape(d, head, "#e7cfae");
  // Hair streaming back — the other thing that says "moving fast".
  shape(d, poly(
    [s * 0.345, s * 0.325], [s * 0.4, s * 0.3], [s * 0.435, s * 0.335],
    [s * 0.38, s * 0.35], [s * 0.3, s * 0.325], [s * 0.24, s * 0.285],
    [s * 0.29, s * 0.315], [s * 0.32, s * 0.345],
  ), HAIR, { width: 1.8 });
  eye(d, s * 0.412, s * 0.378, s * 0.01);
  line(d, arc(s * 0.408, s * 0.402, s * 0.024, 0.1, 1.1, 6), { width: 1.4, over: 0.8, alpha: 0.65 });

  // Raised arm holding the string — drawn last so the hand is on top.
  limb([s * 0.4, s * 0.5], [s * 0.44, s * 0.47], [s * 0.45, s * 0.475], s * 0.026, SHIRT);
  dot(d, s * 0.452, s * 0.474, s * 0.017, "#e7cfae");

  // Speed lines, anchored to the body rather than floating in the corner.
  for (let i = 0; i < 3; i++) {
    const y = s * (0.5 + i * 0.08);
    line(d, [[s * (0.24 - i * 0.03), y], [s * (0.12 - i * 0.02), y - s * 0.012]],
      { width: 1.5, over: 2, alpha: 0.32 });
  }
}

function drawFountainDiver(d: DrawCtx) {
  const { s, ctx } = d;
  // Basin
  const basin = poly(
    [s * 0.16, s * 0.66], [s * 0.84, s * 0.66], [s * 0.76, s * 0.86], [s * 0.24, s * 0.86],
  );
  shape(d, basin, "#b9b2a2");
  shade(d, basin, 0.2);
  // Water surface in it
  const water = oval(s * 0.5, s * 0.665, s * 0.335, s * 0.055, 0, 24, 0.03, 19);
  shape(d, water, "#8fb6c9", { width: 1.8 });
  // Central spout
  line(d, [[s * 0.5, s * 0.64], [s * 0.5, s * 0.44]], { width: 2.6, color: "#7fa8bd" });
  for (const k of [-1, 1]) {
    line(d, [[s * 0.5, s * 0.44], [s * 0.5 + k * s * 0.1, s * 0.52], [s * 0.5 + k * s * 0.14, s * 0.64]],
      { width: 1.8, color: "#7fa8bd", alpha: 0.7 });
  }

  // The bird, mid-splash, wings up.
  const bx = s * 0.38, by = s * 0.58;
  // Wings up and open — feathered along the trailing edge so they read as
  // wings rather than as two brown flags stuck to a bird.
  for (const k of [-1, 1]) {
    const tipX = bx + k * s * 0.145, tipY = by - s * 0.185;
    const wing: Pt[] = [
      [bx + k * s * 0.01, by - s * 0.02],
      [bx + k * s * 0.06, by - s * 0.13],
      [tipX, tipY],
      [tipX + k * s * 0.005, tipY + s * 0.04],
      [bx + k * s * 0.08, by - s * 0.055],
      [bx + k * s * 0.03, by + s * 0.005],
    ];
    shape(d, wing, k < 0 ? "#8a6a4c" : "#a1805f", { width: 1.8 });
    for (let i = 0; i < 3; i++) {
      const t = 0.35 + i * 0.22;
      line(d, [
        [bx + k * s * (0.02 + t * 0.05), by - s * (0.03 + t * 0.09)],
        [bx + k * s * (0.055 + t * 0.075), by - s * (0.05 + t * 0.1)],
      ], { width: 1.2, over: 1, alpha: 0.5 });
    }
  }
  const body = oval(bx, by, s * 0.075, s * 0.055, 0.25, 20, 0.07, 23);
  shape(d, body, "#8a6a4c");
  shade(d, body, 0.18);
  // Tail, cocked up out of the water.
  shape(d, poly(
    [bx + s * 0.06, by + s * 0.01], [bx + s * 0.155, by - s * 0.03],
    [bx + s * 0.15, by + s * 0.015], [bx + s * 0.06, by + s * 0.04],
  ), "#7d5c3d", { width: 1.6 });
  const head = oval(bx - s * 0.075, by - s * 0.045, s * 0.036, s * 0.033, 0, 16, 0.06, 29);
  shape(d, head, "#8a6a4c", { width: 1.8 });
  shape(d, poly(
    [bx - s * 0.108, by - s * 0.05], [bx - s * 0.15, by - s * 0.042], [bx - s * 0.108, by - s * 0.032],
  ), "#d0a266", { width: 1.4 });
  eye(d, bx - s * 0.082, by - s * 0.052, s * 0.009);

  // Splash: a ring of droplets and a couple of arcs. Drawn last so it sits
  // over everything, the way spray does.
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI * 0.15 - (i / 15) * Math.PI * 0.7;
    const r = s * (0.11 + (i % 3) * 0.035);
    const px = bx + Math.cos(a) * r * 1.5, py = by + Math.sin(a) * r;
    dot(d, px, py, s * (0.006 + (i % 2) * 0.004), "#9ec4d6");
  }
  ctx.restore();
  for (const k of [-1, 1]) {
    line(d, arc(bx, by + s * 0.02, s * 0.14, k > 0 ? -1.2 : -1.94, k > 0 ? -0.3 : -2.85, 8),
      { width: 1.5, color: "#7fa8bd", over: 2, alpha: 0.65 });
  }
}

function drawHeron(d: DrawCtx) {
  const { s } = d;
  const GREY = "#a8b3bd";
  // Reeds behind
  for (let i = 0; i < 7; i++) {
    const x = s * (0.1 + i * 0.045);
    line(d, [[x, s * 0.9], [x - s * 0.02, s * 0.66], [x + s * 0.015, s * 0.44 - i * s * 0.01]],
      { width: 1.8, color: "#5c7a45", over: 1, alpha: 0.75 });
  }
  // Waterline
  line(d, [[s * 0.06, s * 0.86], [s * 0.5, s * 0.845], [s * 0.94, s * 0.865]], { width: 2.2, color: "#6d93a8", over: 4 });
  for (let i = 0; i < 4; i++) {
    line(d, [[s * (0.2 + i * 0.16), s * 0.9], [s * (0.32 + i * 0.16), s * 0.898]],
      { width: 1.3, color: "#6d93a8", over: 2, alpha: 0.5 });
  }

  // One leg in the water, one folded up — the heron pose.
  line(d, [[s * 0.5, s * 0.62], [s * 0.505, s * 0.87]], { width: 2.6 });
  line(d, [[s * 0.5, s * 0.62], [s * 0.44, s * 0.72], [s * 0.5, s * 0.78]], { width: 2.3 });

  // Body: a leaning teardrop, tail to the left, breast to the right.
  const body = poly(
    [s * 0.3, s * 0.5], [s * 0.42, s * 0.42], [s * 0.56, s * 0.44],
    [s * 0.6, s * 0.55], [s * 0.55, s * 0.65], [s * 0.42, s * 0.66], [s * 0.32, s * 0.58],
  );
  shape(d, body, GREY);
  shade(d, body, 0.2);
  // Folded wing
  line(d, arc(s * 0.46, s * 0.53, s * 0.11, -0.5, 1.4, 10), { width: 1.6, over: 1.5, alpha: 0.6, color: "#7f8b96" });
  // Trailing plumes
  for (let i = 0; i < 3; i++) {
    line(d, [[s * 0.34, s * 0.55 + i * s * 0.03], [s * 0.2, s * 0.6 + i * s * 0.04]],
      { width: 1.5, over: 2, alpha: 0.55 });
  }

  // The S-neck. This is the whole silhouette of a heron.
  const neck: Pt[] = [
    [s * 0.55, s * 0.47], [s * 0.62, s * 0.41], [s * 0.63, s * 0.33],
    [s * 0.58, s * 0.27], [s * 0.6, s * 0.2], [s * 0.66, s * 0.17],
  ];
  d.ctx.save();
  d.ctx.strokeStyle = GREY;
  d.ctx.lineWidth = s * 0.042;
  d.ctx.lineCap = "round";
  tracePath(d.ctx, neck, false);
  d.ctx.stroke();
  d.ctx.restore();
  line(d, neck, { width: 1.9, over: 0.5, wobble: 0.7 });

  const head = oval(s * 0.675, s * 0.165, s * 0.042, s * 0.032, -0.15, 16, 0.05, 31);
  shape(d, head, GREY, { width: 1.9 });
  // Long dagger beak
  shape(d, poly([s * 0.71, s * 0.155], [s * 0.87, s * 0.185], [s * 0.71, s * 0.183]),
    "#d8b45e", { width: 1.6 });
  eye(d, s * 0.688, s * 0.158, s * 0.011);
  // Crest
  line(d, [[s * 0.655, s * 0.145], [s * 0.6, s * 0.115], [s * 0.57, s * 0.12]], { width: 1.6, over: 1.5 });
}

function drawKoiShadow(d: DrawCtx) {
  const { s, ctx } = d;
  // Seen from above, through water: ripple rings first.
  for (let i = 0; i < 4; i++) {
    const r = s * (0.16 + i * 0.11);
    line(d, oval(s * 0.5, s * 0.52, r, r * 0.82, 0, 30, 0.05, 43 + i),
      { width: 1.4, color: "#6f9ab0", over: 0, alpha: 0.4 - i * 0.07 });
  }

  const koi = (cx: number, cy: number, len: number, rot: number, seed: number, pale: boolean) => {
    const body: Pt[] = [];
    const n = 24;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = t * Math.PI * 2;
      // Fish outline: fat at the shoulder, tapering to the tail.
      const u = Math.cos(a);
      const w = (0.24 - u * 0.06) * (1 - Math.abs(u) * 0.35);
      body.push([Math.cos(a) * len * 0.5, Math.sin(a) * len * w]);
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const pts = body;
    shape(d, pts, pale ? "#f0e3d2" : "#dd8a52", { offset: 1.6 });
    // Tail fan
    shape(d, poly(
      [-len * 0.46, 0], [-len * 0.72, -len * 0.16], [-len * 0.66, 0], [-len * 0.72, len * 0.16],
    ), pale ? "#e6d8c6" : "#c9793f", { width: 1.6 });
    // Side fins
    for (const k of [-1, 1]) {
      shape(d, poly([0, k * len * 0.1], [-len * 0.16, k * len * 0.26], [len * 0.06, k * len * 0.12]),
        pale ? "#e6d8c6" : "#c9793f", { width: 1.3 });
    }
    // Blotches
    const r = seeded(seed);
    for (let i = 0; i < 3; i++) {
      const bx = (r() - 0.5) * len * 0.5;
      shape(d, oval(bx, (r() - 0.5) * len * 0.08, len * 0.09, len * 0.06, 0, 14, 0.16, seed + i),
        pale ? "#d9603f" : "#f2e6d2", { width: 1.1, alpha: 0.45 });
    }
    dot(d, len * 0.38, -len * 0.06, len * 0.022);
    ctx.restore();
  };

  koi(s * 0.42, s * 0.44, s * 0.46, 0.35, 51, false);
  koi(s * 0.6, s * 0.66, s * 0.38, -0.5, 67, true);

  // Surface dapple over the top, so they read as being *under* something.
  ctx.save();
  ctx.globalAlpha = 0.28;
  const r = d.rand;
  for (let i = 0; i < 14; i++) {
    line(d, arc(s * (0.15 + r() * 0.7), s * (0.15 + r() * 0.7), s * 0.05, 0.4, 2.2, 6),
      { width: 1.6, color: "#d6ecf5", over: 1 });
  }
  ctx.restore();
}

function drawDragonfly(d: DrawCtx) {
  const { s, ctx } = d;
  // The reed it's perched on.
  line(d, [[s * 0.24, s * 0.95], [s * 0.3, s * 0.66], [s * 0.34, s * 0.42]], { width: 2.6, color: "#5c7a45", over: 2 });

  const cx = s * 0.52, cy = s * 0.42;
  // Wings first, behind: four long leaves, drawn translucent.
  ctx.save();
  ctx.globalAlpha = 0.5;
  const wing = (ax: number, ay: number, len: number, rot: number, seed: number) => {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(rot);
    const pts = oval(len * 0.5, 0, len * 0.5, len * 0.1, 0, 22, 0.06, seed);
    shape(d, pts, "#cfe2ea", { width: 1.4, alpha: 0.7, offset: 1.2 });
    // Veins
    for (let i = 1; i < 5; i++) {
      line(d, [[len * (0.12 * i), -len * 0.07], [len * (0.12 * i + 0.05), len * 0.07]],
        { width: 0.8, over: 0, alpha: 0.35, color: "#6d8b99" });
    }
    ctx.restore();
  };
  wing(cx - s * 0.02, cy - s * 0.02, s * 0.4, -0.42, 61);
  wing(cx - s * 0.02, cy - s * 0.02, s * 0.36, Math.PI + 0.36, 62);
  wing(cx - s * 0.05, cy + s * 0.03, s * 0.36, -0.16, 63);
  wing(cx - s * 0.05, cy + s * 0.03, s * 0.33, Math.PI + 0.12, 64);
  ctx.restore();

  // Long segmented abdomen trailing back and down.
  const seg = 7;
  for (let i = 0; i < seg; i++) {
    const t = i / (seg - 1);
    const x = cx - s * (0.02 + t * 0.3), y = cy + s * (0.02 + t * 0.22);
    const r = s * (0.026 - t * 0.013);
    shape(d, oval(x, y, r * 1.25, r, 0.6, 14, 0.05, 70 + i),
      i % 2 ? "#3f7a86" : "#59a3ad", { width: 1.4, offset: 1.2 });
  }
  // Thorax
  const thorax = oval(cx + s * 0.02, cy - s * 0.005, s * 0.055, s * 0.045, -0.3, 18, 0.06, 77);
  shape(d, thorax, "#4b8f99");
  shade(d, thorax, 0.18);
  // Head, mostly eyes.
  const head = oval(cx + s * 0.085, cy - s * 0.03, s * 0.045, s * 0.04, 0, 18, 0.05, 79);
  shape(d, head, "#57a0aa", { width: 1.8 });
  for (const k of [-1, 1]) {
    shape(d, oval(cx + s * 0.088 + k * s * 0.018, cy - s * 0.042, s * 0.026, s * 0.024, 0, 14, 0.05, 81 + k),
      "#2c4f57", { width: 1.3 });
  }
  dot(d, cx + s * 0.098, cy - s * 0.048, s * 0.008, "#cfe8ee");
  // Legs gripping the reed
  for (let i = 0; i < 3; i++) {
    line(d, [[cx - s * 0.01 + i * s * 0.024, cy + s * 0.03],
      [cx - s * 0.06 + i * s * 0.02, cy + s * 0.09],
      [s * 0.33 + i * s * 0.006, s * 0.44 + i * s * 0.02]], { width: 1.4, over: 1 });
  }
}

function drawFrogChorus(d: DrawCtx) {
  const { s } = d;
  // Pond surface
  line(d, [[s * 0.04, s * 0.78], [s * 0.5, s * 0.765], [s * 0.96, s * 0.785]], { width: 2.2, color: "#6d93a8", over: 4 });
  // Lily pad
  const pad = oval(s * 0.5, s * 0.78, s * 0.36, s * 0.09, 0, 26, 0.05, 91);
  shape(d, pad, "#68914f");
  line(d, [[s * 0.5, s * 0.78], [s * 0.2, s * 0.755]], { width: 1.4, over: 1, alpha: 0.5 });

  const frog = (x: number, y: number, r: number, seed: number, singing: boolean) => {
    // Haunches
    for (const k of [-1, 1]) {
      shape(d, oval(x + k * r * 0.85, y + r * 0.15, r * 0.5, r * 0.42, k * 0.4, 16, 0.07, seed + 5),
        "#5f8f45", { width: 1.6 });
      line(d, [[x + k * r * 1.05, y + r * 0.45], [x + k * r * 1.35, y + r * 0.6]], { width: 1.5, over: 1 });
      for (const t of [-0.5, 0, 0.5]) {
        line(d, [[x + k * r * 1.35, y + r * 0.6], [x + k * r * (1.35 + 0.3), y + r * (0.6 + t * 0.4)]],
          { width: 1.1, over: 0.6 });
      }
    }
    const body = oval(x, y, r, r * 0.8, 0, 20, 0.06, seed);
    shape(d, body, "#6d9e50");
    shade(d, body, 0.18);
    // Throat, inflated if it's singing.
    const tr = singing ? r * 0.62 : r * 0.3;
    shape(d, oval(x, y + r * 0.62, tr, tr * 0.78, 0, 16, 0.06, seed + 1), "#c7d78a", { width: 1.6 });
    // Eyes on top, the frog tell.
    for (const k of [-1, 1]) {
      shape(d, oval(x + k * r * 0.42, y - r * 0.72, r * 0.3, r * 0.28, 0, 14, 0.05, seed + 2 + k), "#6d9e50", { width: 1.6 });
      eye(d, x + k * r * 0.42, y - r * 0.72, r * 0.14);
    }
    line(d, arc(x, y + r * 0.05, r * 0.7, 0.55, 2.6, 8), { width: 1.6, over: 1, alpha: 0.65 });
    // Sound: ripple arcs off the throat, not notes.
    if (singing) {
      for (let i = 1; i <= 3; i++) {
        line(d, arc(x, y + r * 0.6, r * (0.9 + i * 0.5), -2.5, -0.7, 8),
          { width: 1.3, over: 1, alpha: 0.42 - i * 0.08, color: "#4a6f7d" });
      }
    }
  };

  frog(s * 0.5, s * 0.62, s * 0.13, 101, true);
  frog(s * 0.24, s * 0.7, s * 0.085, 113, false);
  frog(s * 0.76, s * 0.69, s * 0.09, 127, false);
}

function drawCometSparrow(d: DrawCtx) {
  const { s, ctx } = d;
  // Night: a few stars, drawn as little crosses. Positions come off the one
  // shared stream — `seeded(base + i)` looks like a scatter and isn't: an LCG
  // maps neighbouring seeds to neighbouring first outputs, so the stars came
  // out in a tidy diagonal line.
  const r = d.rand;
  for (let i = 0; i < 9; i++) {
    const x = s * (0.08 + r() * 0.85), y = s * (0.06 + r() * 0.5);
    const k = s * (0.012 + r() * 0.01);
    line(d, [[x - k, y], [x + k, y]], { width: 1.2, over: 0.6, alpha: 0.6, color: "#8c93a8" });
    line(d, [[x, y - k], [x, y + k]], { width: 1.2, over: 0.6, alpha: 0.6, color: "#8c93a8" });
  }

  // The trail: a widening comet tail behind the bird.
  ctx.save();
  const grad = ctx.createLinearGradient(s * 0.05, s * 0.85, s * 0.62, s * 0.42);
  grad.addColorStop(0, hexA("#e8c46a", 0));
  grad.addColorStop(1, hexA("#f2d98e", 0.65));
  ctx.fillStyle = grad;
  tracePath(ctx, poly(
    [s * 0.05, s * 0.9], [s * 0.62, s * 0.44], [s * 0.66, s * 0.54], [s * 0.14, s * 0.95],
  ));
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    line(d, [[s * (0.1 + i * 0.02), s * (0.88 - i * 0.02)], [s * (0.5 + i * 0.03), s * (0.52 - i * 0.02)]],
      { width: 1.4, over: 2, alpha: 0.4 - i * 0.05, color: "#f2d98e" });
  }

  // Sparrow, wings back, in a dive.
  const bx = s * 0.66, by = s * 0.42;
  const body = oval(bx, by, s * 0.085, s * 0.058, -0.6, 20, 0.06, 151);
  shape(d, body, "#9a7550");
  shade(d, body, 0.2);
  shape(d, poly(
    [bx - s * 0.04, by + s * 0.04], [bx - s * 0.16, by + s * 0.15], [bx - s * 0.06, by + s * 0.09],
  ), "#7d5c3d", { width: 1.7 });
  for (const k of [0, 1]) {
    shape(d, poly(
      [bx - s * 0.01, by - s * 0.02],
      [bx - s * 0.1 - k * s * 0.03, by - s * 0.13 - k * s * 0.04],
      [bx - s * 0.02 + k * s * 0.02, by - s * 0.14 - k * s * 0.02],
      [bx + s * 0.03, by - s * 0.02],
    ), k ? "#8a6845" : "#a8835c", { width: 1.7 });
  }
  const head = oval(bx + s * 0.07, by - s * 0.045, s * 0.042, s * 0.038, -0.3, 16, 0.05, 157);
  shape(d, head, "#a8835c", { width: 1.8 });
  shape(d, poly([bx + s * 0.108, by - s * 0.058], [bx + s * 0.155, by - s * 0.04], [bx + s * 0.105, by - s * 0.032]),
    "#d8b45e", { width: 1.4 });
  eye(d, bx + s * 0.082, by - s * 0.058, s * 0.011);
}

function drawBlinkFox(d: DrawCtx) {
  const { s } = d;
  const FUR = "#c9743a", FUR_L = "#e7dccb";
  groundLine(d, s * 0.87, s * 0.08, s * 0.92);

  // Fireflies in the dark around it.
  const r = d.rand;
  for (let i = 0; i < 7; i++) {
    const x = s * (0.1 + r() * 0.82), y = s * (0.12 + r() * 0.55);
    dot(d, x, y, s * 0.012, hexA("#f4e08a", 0.35));
    dot(d, x, y, s * 0.005, "#f8ecae");
  }

  // Brush tail, low and heavy.
  shape(d, poly(
    [s * 0.34, s * 0.66], [s * 0.2, s * 0.6], [s * 0.1, s * 0.66],
    [s * 0.13, s * 0.78], [s * 0.26, s * 0.79], [s * 0.36, s * 0.75],
  ), FUR, { width: 1.9 });
  shape(d, poly([s * 0.14, s * 0.63], [s * 0.09, s * 0.67], [s * 0.12, s * 0.76], [s * 0.19, s * 0.73]),
    FUR_L, { width: 1.4, alpha: 0.6 });

  // Body, turned away, head looking back over the shoulder. The neck is part
  // of the body outline: drawn as a separate head sitting above a separate
  // body, a fox reads as two orange lumps that happen to be near each other.
  const body = poly(
    [s * 0.3, s * 0.64], [s * 0.36, s * 0.53], [s * 0.48, s * 0.49],
    [s * 0.58, s * 0.46], [s * 0.64, s * 0.4], [s * 0.7, s * 0.44],
    [s * 0.66, s * 0.55], [s * 0.66, s * 0.76], [s * 0.34, s * 0.76],
  );
  shape(d, body, FUR);
  shade(d, body, 0.24);
  // Legs
  for (const x of [s * 0.4, s * 0.58]) {
    line(d, [[x, s * 0.72], [x + s * 0.012, s * 0.86]], { width: 3.2 });
    shape(d, oval(x + s * 0.014, s * 0.865, s * 0.026, s * 0.014, 0, 12, 0.1, 181), "#2f2a24", { width: 1.3 });
  }

  const head = oval(s * 0.7, s * 0.36, s * 0.082, s * 0.072, 0.12, 20, 0.05, 191);
  shape(d, head, FUR);
  // Ears — big triangles, the fox silhouette.
  for (const k of [-1, 1]) {
    const ex = s * 0.7 + k * s * 0.052;
    shape(d, poly([ex - k * s * 0.02, s * 0.312], [ex + k * s * 0.008, s * 0.215], [ex + k * s * 0.045, s * 0.312]),
      FUR, { width: 1.8 });
    shape(d, poly([ex, s * 0.305], [ex + k * s * 0.009, s * 0.246], [ex + k * s * 0.028, s * 0.305]),
      "#7a4630", { width: 1.1, alpha: 0.55 });
  }
  // Snout: a wedge in the fur colour with only the tip pale, so it doesn't
  // read as something the fox is holding in its mouth.
  shape(d, poly([s * 0.752, s * 0.35], [s * 0.845, s * 0.392], [s * 0.84, s * 0.418], [s * 0.75, s * 0.408]),
    FUR, { width: 1.7 });
  shape(d, poly([s * 0.812, s * 0.378], [s * 0.848, s * 0.393], [s * 0.843, s * 0.417], [s * 0.808, s * 0.404]),
    FUR_L, { width: 1.3, alpha: 0.6 });
  dot(d, s * 0.848, s * 0.4, s * 0.013);
  // Cheek ruff
  shape(d, poly([s * 0.672, s * 0.4], [s * 0.74, s * 0.418], [s * 0.716, s * 0.462], [s * 0.648, s * 0.432]),
    FUR_L, { width: 1.4, alpha: 0.55 });

  // One eye caught in the light, one closed — the blink.
  eye(d, s * 0.738, s * 0.352, s * 0.016);
  line(d, arc(s * 0.676, s * 0.356, s * 0.02, 3.5, 5.9, 8), { width: 1.8, over: 1.2, wobble: 0.4 });
}

const drawers: Record<string, (d: DrawCtx) => void> = {
  "Heron": drawHeron,
  "Koi Shadow": drawKoiShadow,
  "Dragonfly": drawDragonfly,
  "Frog Chorus": drawFrogChorus,
  "Park Cat": drawParkCat,
  "Bench Sitter": drawBenchSitter,
  "Pigeon Council": drawPigeonCouncil,
  "Kite Runner": drawKiteRunner,
  "Fountain Diver": drawFountainDiver,
  "Comet Sparrow": drawCometSparrow,
  "Blink Fox": drawBlinkFox,
};

// --------------------------------------------------------------- render ----

function render(name: string, card: boolean): HTMLCanvasElement {
  const size = 320;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seeded(hashName(name));

  if (card) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    // Paper tooth: sparse speckle, so a flat cream field doesn't read as a
    // JPEG background behind the drawing.
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = hexA("#8a8069", 0.02 + rand() * 0.05);
      ctx.fillRect(rand() * size, rand() * size, 1.2, 1.2);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const d: DrawCtx = { ctx, s: size, rand };
  const draw = drawers[name];
  if (draw) draw(d);
  else {
    shape(d, oval(size / 2, size / 2, size * 0.2, size * 0.18, 0, 20, 0.1, 3), "#9c8a68");
  }

  if (card) {
    // A drawn border, inset — it's a plate in an album. Four separate strokes
    // that run past each other at the corners: a closed loop through four
    // points gets smoothed into a rounded blob, and drawn corners overshoot
    // anyway, so this is both more correct and more honest.
    const m = size * 0.045, n = size - m;
    const edges: Pt[][] = [
      [[m, m], [size / 2, m], [n, m]],
      [[n, m], [n, size / 2], [n, n]],
      [[n, n], [size / 2, n], [m, n]],
      [[m, n], [m, size / 2], [m, m]],
    ];
    for (const e of edges) {
      sketch(ctx, e, rand, {
        width: 1.6, wobble: 1.1, alpha: 0.34, color: INK, passes: 1, overshoot: size * 0.02,
      });
    }
    const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.72);
    v.addColorStop(0, hexA("#6b5f48", 0));
    v.addColorStop(1, hexA("#6b5f48", 0.16));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

function hashName(n: string) {
  let h = 2166136261;
  for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The developed plate: subject on its paper card. */
export function subjectIllustration(name: string): HTMLCanvasElement {
  let c = cache.get(name);
  if (!c) cache.set(name, (c = render(name, true)));
  return c;
}

/**
 * The same subject with no card behind it, for the viewfinder — through the
 * glass you're looking at a thing in the park, and a cream rectangle floating
 * in the frame reads as a photograph of a photograph.
 */
export function subjectCutout(name: string): HTMLCanvasElement {
  let c = cutouts.get(name);
  if (!c) cutouts.set(name, (c = render(name, false)));
  return c;
}
