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


// ------------------------------------------- Shoreline (The Long Shore) ----

function drawGullParliament(d: DrawCtx) {
  const { s } = d;
  groundLine(d, s * 0.86, s * 0.08, s * 0.92);
  const gull = (x: number, y: number, r: number, faceLeft: boolean, seed: number, open: boolean) => {
    const k = faceLeft ? -1 : 1;
    const body = oval(x, y, r * 1.4, r * 0.9, faceLeft ? 0.1 : -0.1, 22, 0.06, seed);
    shape(d, body, "#f0ece1");
    shade(d, body, 0.16);
    shape(d, poly(
      [x - k * r * 1.2, y - r * 0.15], [x - k * r * 2.2, y - r * 0.5],
      [x - k * r * 1.15, y + r * 0.3],
    ), "#c9c5ba", { width: 1.6 });
    // Grey mantle over the shoulders — the gull tell.
    shape(d, poly(
      [x - k * r * 0.6, y - r * 0.7], [x + k * r * 0.4, y - r * 0.55],
      [x + k * r * 0.2, y + r * 0.1], [x - k * r * 0.9, y - r * 0.05],
    ), "#a8b0b8", { width: 1.4, alpha: 0.7 });
    const head = oval(x + k * r * 1.3, y - r * 0.85, r * 0.5, r * 0.46, 0, 18, 0.05, seed + 1);
    shape(d, head, "#f0ece1", { width: 1.8 });
    // Beak, open if it's the one shouting.
    if (open) {
      shape(d, poly([x + k * r * 1.7, y - r * 0.95], [x + k * r * 2.6, y - r * 1.15], [x + k * r * 1.7, y - r * 0.85]),
        "#e0a83f", { width: 1.4 });
      shape(d, poly([x + k * r * 1.7, y - r * 0.8], [x + k * r * 2.5, y - r * 0.62], [x + k * r * 1.7, y - r * 0.72]),
        "#e0a83f", { width: 1.4 });
    } else {
      shape(d, poly([x + k * r * 1.7, y - r * 0.95], [x + k * r * 2.5, y - r * 0.82], [x + k * r * 1.68, y - r * 0.74]),
        "#e0a83f", { width: 1.4 });
    }
    eye(d, x + k * r * 1.4, y - r * 0.95, r * 0.12);
    for (const o of [-0.4, 0.4]) {
      line(d, [[x + r * o, y + r * 0.8], [x + r * o * 1.1, y + r * 1.5]], { width: 1.7, over: 1, color: "#d99f3c" });
      for (const t of [-1, 0, 1]) {
        line(d, [[x + r * o * 1.1, y + r * 1.5], [x + r * o * 1.1 + t * r * 0.3, y + r * 1.72]],
          { width: 1.2, over: 0.6, color: "#d99f3c" });
      }
    }
  };
  gull(s * 0.22, s * 0.66, s * 0.07, false, 211, false);
  gull(s * 0.5, s * 0.7, s * 0.085, true, 223, true);
  gull(s * 0.78, s * 0.64, s * 0.075, true, 227, false);
  // One chip on the sand, the actual subject of the debate.
  shape(d, oval(s * 0.5, s * 0.87, s * 0.03, s * 0.012, 0.2, 12, 0.14, 229), "#e6c98a", { width: 1.4 });
}

function drawRockpoolCrab(d: DrawCtx) {
  const { s, ctx } = d;
  // The pool: a ragged rim with water in it.
  const pool = oval(s * 0.5, s * 0.66, s * 0.42, s * 0.24, 0, 28, 0.12, 233);
  shape(d, pool, "#7fa8b8");
  ctx.save();
  tracePath(ctx, pool);
  ctx.clip();
  for (let i = 0; i < 7; i++) {
    line(d, [[s * (0.16 + i * 0.1), s * (0.6 + (i % 3) * 0.06)], [s * (0.28 + i * 0.1), s * (0.6 + (i % 3) * 0.06)]],
      { width: 1.3, color: "#dfeef4", over: 1, alpha: 0.55 });
  }
  ctx.restore();
  // Weed round the rim.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const x = s * 0.5 + Math.cos(a) * s * 0.42, y = s * 0.66 + Math.sin(a) * s * 0.24;
    line(d, [[x, y], [x + s * 0.02, y - s * 0.07], [x - s * 0.01, y - s * 0.12]],
      { width: 1.6, color: "#5d7a3f", over: 1, alpha: 0.8 });
  }

  // The crab, side on, one claw up.
  const cx = s * 0.5, cy = s * 0.62, r = s * 0.13;
  for (const k of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      line(d, [
        [cx + k * r * 0.5, cy + r * 0.2],
        [cx + k * r * (1.1 + t * 0.3), cy + r * (0.5 + t * 0.2)],
        [cx + k * r * (1.4 + t * 0.5), cy + r * 1.0],
      ], { width: 2, over: 1, color: "#8d3a2c" });
    }
  }
  const shell = oval(cx, cy, r, r * 0.66, 0, 22, 0.06, 239);
  shape(d, shell, "#c4553c");
  shade(d, shell, 0.2);
  // Claws: one raised, one low.
  const claw = (x: number, y: number, k: number, up: boolean) => {
    line(d, [[cx + k * r * 0.8, cy - r * 0.1], [x, y]], { width: 3, color: "#c4553c" });
    shape(d, poly([x, y], [x + k * r * 0.42, y - r * (up ? 0.34 : 0.1)], [x + k * r * 0.3, y + r * 0.22]),
      "#b04832", { width: 1.6 });
    line(d, [[x + k * r * 0.06, y - r * 0.02], [x + k * r * 0.4, y - r * (up ? 0.22 : 0.02)]],
      { width: 1.3, over: 0.6, alpha: 0.6 });
  };
  claw(cx - r * 1.3, cy - r * 0.5, -1, true);
  claw(cx + r * 1.25, cy + r * 0.12, 1, false);
  // Stalked eyes.
  for (const k of [-1, 1]) {
    line(d, [[cx + k * r * 0.28, cy - r * 0.5], [cx + k * r * 0.34, cy - r * 0.95]], { width: 1.8, over: 0.4 });
    eye(d, cx + k * r * 0.35, cy - r * 1.02, r * 0.13);
  }
}

function drawSealLoaf(d: DrawCtx) {
  const { s } = d;
  line(d, [[s * 0.04, s * 0.82], [s * 0.5, s * 0.805], [s * 0.96, s * 0.825]],
    { width: 2.2, color: "#6d93a8", over: 4 });
  // Wet rock it has hauled out onto.
  shape(d, oval(s * 0.5, s * 0.83, s * 0.38, s * 0.09, 0, 22, 0.1, 241), "#8b8578");

  // A seal at rest is a banana: head up, tail up, middle sagging.
  const body: Pt[] = [
    [s * 0.22, s * 0.7], [s * 0.3, s * 0.6], [s * 0.45, s * 0.58],
    [s * 0.62, s * 0.61], [s * 0.74, s * 0.58], [s * 0.8, s * 0.5],
    [s * 0.84, s * 0.56], [s * 0.78, s * 0.68], [s * 0.6, s * 0.74],
    [s * 0.38, s * 0.76], [s * 0.24, s * 0.76],
  ];
  shape(d, body, "#8b8a86");
  shade(d, body, 0.22);
  // Tail flippers at the raised end.
  shape(d, poly([s * 0.79, s * 0.53], [s * 0.9, s * 0.44], [s * 0.88, s * 0.56], [s * 0.94, s * 0.56]),
    "#7a7975", { width: 1.6 });
  // Fore flipper folded on the rock.
  shape(d, poly([s * 0.36, s * 0.7], [s * 0.5, s * 0.73], [s * 0.46, s * 0.79], [s * 0.34, s * 0.76]),
    "#7a7975", { width: 1.6 });

  const head = oval(s * 0.24, s * 0.66, s * 0.085, s * 0.075, -0.2, 20, 0.05, 251);
  shape(d, head, "#8b8a86");
  // Muzzle and whiskers.
  shape(d, oval(s * 0.175, s * 0.69, s * 0.045, s * 0.036, -0.1, 16, 0.06, 257), "#a19f99", { width: 1.5 });
  dot(d, s * 0.145, s * 0.685, s * 0.013);
  for (const k of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      line(d, [[s * 0.16, s * (0.69 + k * 0.008)], [s * (0.07 - i * 0.005), s * (0.69 + k * (0.03 + i * 0.014))]],
        { width: 1, over: 1.5, alpha: 0.5 });
    }
  }
  // Eyes shut — it is asleep, that is the whole picture.
  line(d, arc(s * 0.245, s * 0.645, s * 0.022, 3.4, 6, 8), { width: 1.8, over: 1.2, wobble: 0.4 });
  // Spots
  for (let i = 0; i < 12; i++) {
    const r = d.rand;
    dot(d, s * (0.32 + r() * 0.44), s * (0.6 + r() * 0.14), s * 0.008, hexA("#5f5e5a", 0.5));
  }
}

function drawLighthouseKeeper(d: DrawCtx) {
  const { s, ctx } = d;
  // Night, a tower, and the one lit window.
  for (let i = 0; i < 8; i++) {
    const r = d.rand;
    const x = s * (0.05 + r() * 0.9), y = s * (0.04 + r() * 0.4);
    dot(d, x, y, s * 0.008, hexA("#c9d2e0", 0.7));
  }
  const tower: Pt[] = [
    [s * 0.36, s * 0.92], [s * 0.42, s * 0.5], [s * 0.44, s * 0.3],
    [s * 0.62, s * 0.3], [s * 0.64, s * 0.5], [s * 0.7, s * 0.92],
  ];
  shape(d, tower, "#d8d2c2");
  shade(d, tower, 0.26);
  for (let i = 0; i < 2; i++) {
    shape(d, poly(
      [s * (0.4 - i * 0.01), s * (0.72 - i * 0.24)], [s * (0.66 + i * 0.01), s * (0.72 - i * 0.24)],
      [s * (0.665 + i * 0.01), s * (0.79 - i * 0.24)], [s * (0.395 - i * 0.01), s * (0.79 - i * 0.24)],
    ), "#b8503c", { width: 1.4, alpha: 0.7 });
  }
  // Lamp room, lit.
  shape(d, poly([s * 0.42, s * 0.3], [s * 0.64, s * 0.3], [s * 0.63, s * 0.26], [s * 0.43, s * 0.26]),
    "#54626a", { width: 1.6 });
  shape(d, poly([s * 0.45, s * 0.26], [s * 0.61, s * 0.26], [s * 0.6, s * 0.15], [s * 0.46, s * 0.15]),
    "#f6e6a4", { width: 1.6 });
  shape(d, poly([s * 0.43, s * 0.15], [s * 0.53, s * 0.07], [s * 0.63, s * 0.15]), "#3f4a4e", { width: 1.6 });
  // The beam.
  ctx.save();
  const g = ctx.createLinearGradient(s * 0.55, s * 0.2, s * 1.0, s * 0.06);
  g.addColorStop(0, hexA("#f8eec0", 0.55));
  g.addColorStop(1, hexA("#f8eec0", 0));
  ctx.fillStyle = g;
  tracePath(ctx, poly([s * 0.58, s * 0.17], [s * 1.02, s * 0.0], [s * 1.02, s * 0.34]));
  ctx.fill();
  ctx.restore();

  // The keeper, a silhouette at the door with a lamp.
  const fig = poly(
    [s * 0.47, s * 0.92], [s * 0.465, s * 0.78], [s * 0.5, s * 0.72],
    [s * 0.545, s * 0.78], [s * 0.55, s * 0.92],
  );
  shape(d, fig, "#3a3b42");
  shape(d, oval(s * 0.507, s * 0.685, s * 0.03, s * 0.032, 0, 16, 0.05, 263), "#3a3b42", { width: 1.6 });
  shape(d, poly([s * 0.472, s * 0.672], [s * 0.545, s * 0.668], [s * 0.55, s * 0.68], [s * 0.468, s * 0.684]),
    "#2c2d33", { width: 1.3 });
  line(d, [[s * 0.548, s * 0.78], [s * 0.6, s * 0.8]], { width: 2.4 });
  dot(d, s * 0.615, s * 0.81, s * 0.022, hexA("#f6e6a4", 0.9));
  dot(d, s * 0.615, s * 0.81, s * 0.045, hexA("#f6e6a4", 0.2));
}

// ---------------------------------------------- Deep Wood (Hollow Wood) ----

function drawMushroomRing(d: DrawCtx) {
  const { s } = d;
  groundLine(d, s * 0.84, s * 0.06, s * 0.94);
  // A ring seen in perspective: an ellipse of caps, big at the front.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.15 + (i / (n - 1)) * Math.PI * 1.7;
    const x = s * 0.5 + Math.cos(a) * s * 0.36;
    const y = s * 0.68 + Math.sin(a) * s * 0.16;
    const near = (Math.sin(a) + 1) / 2;
    const r = s * (0.035 + near * 0.045);
    const h = s * (0.05 + near * 0.06);
    shape(d, poly(
      [x - 2.2 - near * 1.6, y], [x - 1.4 - near * 1.2 + (i % 2 ? 2 : -2), y - h],
      [x + 1.4 + near * 1.2 + (i % 2 ? 2 : -2), y - h], [x + 2.2 + near * 1.6, y],
    ), "#ded4bb", { width: 1.5 });
    const cap = oval(x, y - h, r, r * 0.68, 0, 18, 0.07, 271 + i);
    shape(d, cap, i % 3 === 0 ? "#b8763c" : "#c2503f", { width: 1.6 });
    for (let k = 0; k < 3; k++) {
      dot(d, x + (d.rand() - 0.5) * r * 1.2, y - h - d.rand() * r * 0.4, r * 0.13, hexA("#f2ece0", 0.85));
    }
  }
  // Something has been standing in the middle of it.
  for (let i = 0; i < 5; i++) {
    line(d, arc(s * 0.5, s * 0.68, s * (0.08 + i * 0.035), 0.2, 2.9, 10),
      { width: 1.2, color: "#8fa07f", over: 1, alpha: 0.3 - i * 0.04 });
  }
}

function drawAntleredShape(d: DrawCtx) {
  const { s } = d;
  // Mist bands behind, so the shape is half in and half out of the wood.
  for (let i = 0; i < 4; i++) {
    line(d, [[s * 0.02, s * (0.5 + i * 0.09)], [s * 0.98, s * (0.52 + i * 0.09)]],
      { width: 7, color: "#c9d2c4", over: 0, alpha: 0.45 });
  }
  groundLine(d, s * 0.88, s * 0.06, s * 0.94);

  // Body: a stag, standing, head turned toward you.
  const body = poly(
    [s * 0.24, s * 0.56], [s * 0.34, s * 0.46], [s * 0.56, s * 0.44],
    [s * 0.68, s * 0.48], [s * 0.7, s * 0.62], [s * 0.6, s * 0.68],
    [s * 0.34, s * 0.68], [s * 0.24, s * 0.64],
  );
  shape(d, body, "#7d6047");
  shade(d, body, 0.24);
  for (const x of [s * 0.3, s * 0.4, s * 0.58, s * 0.66]) {
    line(d, [[x, s * 0.65], [x + s * 0.008, s * 0.76], [x - s * 0.006, s * 0.87]], { width: 2.6 });
  }
  // Neck up to a head that faces us.
  shape(d, poly([s * 0.62, s * 0.5], [s * 0.72, s * 0.36], [s * 0.8, s * 0.38], [s * 0.7, s * 0.54]),
    "#7d6047", { width: 1.8 });
  const head = oval(s * 0.775, s * 0.33, s * 0.055, s * 0.07, 0.1, 20, 0.05, 281);
  shape(d, head, "#8a6b50");
  shape(d, oval(s * 0.79, s * 0.39, s * 0.035, s * 0.032, 0.1, 14, 0.06, 283), "#6b503a", { width: 1.5 });
  dot(d, s * 0.8, s * 0.402, s * 0.011);
  eye(d, s * 0.755, s * 0.315, s * 0.014);
  eye(d, s * 0.805, s * 0.312, s * 0.014);
  for (const k of [-1, 1]) {
    shape(d, poly([s * (0.775 + k * 0.045), s * 0.315], [s * (0.775 + k * 0.085), s * 0.28],
      [s * (0.775 + k * 0.05), s * 0.29]), "#7d6047", { width: 1.4 });
  }
  // Antlers — the whole reason you photograph it.
  for (const k of [-1, 1]) {
    const bx = s * (0.775 + k * 0.028);
    line(d, [[bx, s * 0.28], [bx + k * s * 0.04, s * 0.2], [bx + k * s * 0.03, s * 0.1]],
      { width: 2.8, over: 1 });
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.28;
      const px = bx + k * s * 0.04 * (1 - Math.abs(t - 0.5));
      const py = s * (0.28 - t * 0.19);
      line(d, [[px, py], [px + k * s * (0.06 + i * 0.02), py - s * (0.04 + i * 0.015)]],
        { width: 2, over: 1.4 });
    }
  }
}

function drawMothCloud(d: DrawCtx) {
  const { s } = d;
  // A lamp, and everything in the wood that wants it.
  line(d, [[s * 0.5, s * 0.06], [s * 0.5, s * 0.24]], { width: 2.2, over: 0 });
  shape(d, poly([s * 0.42, s * 0.24], [s * 0.58, s * 0.24], [s * 0.545, s * 0.36], [s * 0.455, s * 0.36]),
    "#3f4a44", { width: 1.8 });
  shape(d, oval(s * 0.5, s * 0.4, s * 0.05, s * 0.055, 0, 18, 0.05, 291), "#f6e6a4", { width: 1.6 });
  const glow = d.ctx.createRadialGradient(s * 0.5, s * 0.4, s * 0.02, s * 0.5, s * 0.4, s * 0.34);
  glow.addColorStop(0, hexA("#f8eec0", 0.4));
  glow.addColorStop(1, hexA("#f8eec0", 0));
  d.ctx.fillStyle = glow;
  d.ctx.fillRect(0, 0, s, s);

  const moth = (x: number, y: number, r: number, rot: number, seed: number, pale: boolean) => {
    d.ctx.save();
    d.ctx.translate(x, y);
    d.ctx.rotate(rot);
    for (const k of [-1, 1]) {
      shape(d, poly([0, 0], [k * r * 1.5, -r * 1.1], [k * r * 1.7, r * 0.1], [k * r * 0.7, r * 0.6]),
        pale ? "#e2dccb" : "#a8906d", { width: 1.3, offset: 1 });
    }
    shape(d, oval(0, 0, r * 0.3, r * 0.8, 0, 14, 0.06, seed), "#6b5a44", { width: 1.2 });
    for (const k of [-1, 1]) {
      line(d, [[k * r * 0.14, -r * 0.7], [k * r * 0.7, -r * 1.3]], { width: 1, over: 0.6, alpha: 0.7 });
    }
    d.ctx.restore();
  };
  const r = d.rand;
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2;
    const dist = s * (0.13 + r() * 0.3);
    moth(s * 0.5 + Math.cos(a) * dist, s * 0.42 + Math.sin(a) * dist * 0.85,
      s * (0.022 + r() * 0.026), a + Math.PI / 2, 300 + i, r() < 0.4);
  }
}

function drawWisp(d: DrawCtx) {
  const { s, ctx } = d;
  // Deep dark, a few trunks, and one small cold light.
  for (let i = 0; i < 5; i++) {
    const x = s * (0.08 + i * 0.21);
    line(d, [[x, s * 1.0], [x + s * 0.01, s * 0.5], [x - s * 0.01, s * 0.06]],
      { width: 7, color: "#2f3a30", over: 0, alpha: 0.7 });
  }
  groundLine(d, s * 0.9, s * 0.04, s * 0.96);

  const cx = s * 0.52, cy = s * 0.5;
  const glow = ctx.createRadialGradient(cx, cy, s * 0.01, cx, cy, s * 0.42);
  glow.addColorStop(0, hexA("#cdf2e4", 0.85));
  glow.addColorStop(0.3, hexA("#8fd8c4", 0.35));
  glow.addColorStop(1, hexA("#8fd8c4", 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, s, s);
  shape(d, oval(cx, cy, s * 0.045, s * 0.055, 0, 18, 0.12, 311), "#eafff6",
    { width: 1.2, ink: "#8fd8c4", alpha: 0.5 });
  // The tail it drags behind it.
  const tail: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    tail.push([cx - t * s * 0.34 + Math.sin(t * 6) * s * 0.03, cy + t * s * 0.22 + Math.sin(t * 4) * s * 0.02]);
  }
  ctx.save();
  ctx.strokeStyle = hexA("#9fe6d2", 0.45);
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = "round";
  tracePath(ctx, tail, false);
  ctx.stroke();
  ctx.restore();
  const r = d.rand;
  for (let i = 0; i < 10; i++) {
    dot(d, cx + (r() - 0.5) * s * 0.4, cy + (r() - 0.5) * s * 0.4, s * (0.004 + r() * 0.006),
      hexA("#d6fff0", 0.5 + r() * 0.4));
  }
}

// ------------------------------------------- Chimney Pots (Rooftops) ----

function drawRoofCat(d: DrawCtx) {
  const { s } = d;
  // A ridge of tiles running away, and a cat walking it.
  const ridge: Pt[] = [[s * 0.02, s * 0.82], [s * 0.5, s * 0.74], [s * 0.98, s * 0.8]];
  shape(d, poly(
    [s * 0.02, s * 0.82], [s * 0.5, s * 0.74], [s * 0.98, s * 0.8],
    [s * 0.98, s * 1.0], [s * 0.02, s * 1.0],
  ), "#a8624a");
  line(d, ridge, { width: 2.4, over: 4 });
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = s * (0.06 + t * 0.88);
    const y = s * (0.82 - Math.sin(t * Math.PI) * 0.08);
    line(d, [[x, y], [x - s * 0.02, y + s * 0.16]], { width: 1.3, over: 1, alpha: 0.4 });
  }

  const cx = s * 0.46, cy = s * 0.56;
  // Tail up, the whole silhouette of a cat on a roof.
  line(d, [[cx - s * 0.13, cy + s * 0.04], [cx - s * 0.24, cy - s * 0.06], [cx - s * 0.22, cy - s * 0.2]],
    { width: 5.5, color: "#4a4a52" });
  const body = oval(cx, cy, s * 0.145, s * 0.075, -0.06, 22, 0.06, 321);
  shape(d, body, "#54545e");
  shade(d, body, 0.2);
  for (const x of [cx - s * 0.08, cx + s * 0.08]) {
    line(d, [[x, cy + s * 0.05], [x + s * 0.004, cy + s * 0.16]], { width: 3.4, color: "#54545e" });
  }
  const head = oval(cx + s * 0.17, cy - s * 0.06, s * 0.062, s * 0.055, 0, 20, 0.05, 323);
  shape(d, head, "#54545e");
  for (const k of [-1, 1]) {
    const ex = cx + s * 0.17 + k * s * 0.038;
    shape(d, poly([ex - k * s * 0.014, s * 0 + cy - s * 0.09], [ex + k * s * 0.006, cy - s * 0.145],
      [ex + k * s * 0.026, cy - s * 0.088]), "#54545e", { width: 1.5 });
  }
  eye(d, cx + s * 0.195, cy - s * 0.07, s * 0.012);
  dot(d, cx + s * 0.228, cy - s * 0.045, s * 0.008, "#c98a86");
  for (const k of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      line(d, [[cx + s * 0.215, cy - s * 0.04 + k * s * 0.006],
        [cx + s * 0.3, cy - s * 0.055 + k * s * (0.02 + i * 0.02)]],
        { width: 1, over: 1.5, alpha: 0.5 });
    }
  }
}

function drawLaundryGhost(d: DrawCtx) {
  const { s } = d;
  for (const k of [-1, 1]) {
    line(d, [[s * (0.5 + k * 0.42), s * 0.9], [s * (0.5 + k * 0.42), s * 0.2]], { width: 3, over: 1 });
  }
  const sag: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    sag.push([s * (0.08 + t * 0.84), s * (0.22 + Math.sin(t * Math.PI) * 0.06)]);
  }
  line(d, sag, { width: 1.6, over: 1, wobble: 0.4 });

  // A sheet caught by the wind, and for a moment it's a person.
  const sheet: Pt[] = [
    [s * 0.34, s * 0.26], [s * 0.62, s * 0.25],
    [s * 0.72, s * 0.44], [s * 0.66, s * 0.64], [s * 0.7, s * 0.8],
    [s * 0.56, s * 0.72], [s * 0.46, s * 0.84], [s * 0.36, s * 0.7],
    [s * 0.28, s * 0.78], [s * 0.3, s * 0.5],
  ];
  shape(d, sheet, "#efeade");
  shade(d, sheet, 0.16);
  // Two hollows where a face nearly is.
  shape(d, oval(s * 0.43, s * 0.4, s * 0.032, s * 0.042, -0.1, 16, 0.1, 331),
    hexA("#c9c2b2", 0.9), { width: 1.2, alpha: 0.4 });
  shape(d, oval(s * 0.55, s * 0.39, s * 0.03, s * 0.04, 0.1, 16, 0.1, 337),
    hexA("#c9c2b2", 0.9), { width: 1.2, alpha: 0.4 });
  // Pegs.
  for (const x of [s * 0.36, s * 0.6]) {
    shape(d, poly([x - s * 0.012, s * 0.21], [x + s * 0.012, s * 0.21], [x + s * 0.01, s * 0.29], [x - s * 0.01, s * 0.29]),
      "#c08a4a", { width: 1.3 });
  }
  // Smaller washing either side, so it reads as a line and not a shroud.
  for (const [x, w, c] of [[s * 0.17, s * 0.09, "#7fa3c4"], [s * 0.82, s * 0.08, "#c9756a"]] as [number, number, string][]) {
    shape(d, poly([x - w / 2, s * 0.24], [x + w / 2, s * 0.235], [x + w / 2 + s * 0.01, s * 0.42], [x - w / 2 + s * 0.01, s * 0.43]),
      c, { width: 1.5 });
  }
}

function drawPigeonLoft(d: DrawCtx) {
  const { s } = d;
  shape(d, poly([s * 0.02, s * 0.86], [s * 0.98, s * 0.82], [s * 0.98, s * 1.0], [s * 0.02, s * 1.0]),
    "#a8624a");
  // The loft: a little wooden house with a landing board.
  const box = poly([s * 0.28, s * 0.84], [s * 0.28, s * 0.46], [s * 0.72, s * 0.44], [s * 0.72, s * 0.83]);
  shape(d, box, "#9a7a52");
  shade(d, box, 0.22);
  shape(d, poly([s * 0.22, s * 0.47], [s * 0.5, s * 0.3], [s * 0.78, s * 0.45], [s * 0.72, s * 0.45], [s * 0.5, s * 0.34], [s * 0.28, s * 0.48]),
    "#6d5236", { width: 1.8 });
  // Entrance holes.
  for (let i = 0; i < 3; i++) {
    shape(d, oval(s * (0.38 + i * 0.12), s * 0.58, s * 0.035, s * 0.045, 0, 16, 0.05, 341 + i),
      "#3a2f26", { width: 1.4 });
  }
  // Landing board with birds on it.
  shape(d, poly([s * 0.2, s * 0.68], [s * 0.8, s * 0.665], [s * 0.8, s * 0.7], [s * 0.2, s * 0.715]),
    "#7d6242", { width: 1.6 });

  const pigeon = (x: number, y: number, r: number, k: number, seed: number) => {
    shape(d, oval(x, y, r * 1.25, r * 0.85, -k * 0.1, 20, 0.06, seed), "#8e93a0", { width: 1.6 });
    shape(d, oval(x + k * r * 1.15, y - r * 0.8, r * 0.48, r * 0.44, 0, 16, 0.05, seed + 1), "#8e93a0", { width: 1.5 });
    shape(d, poly([x + k * r * 1.5, y - r * 0.88], [x + k * r * 2.1, y - r * 0.76], [x + k * r * 1.48, y - r * 0.68]),
      "#d0a266", { width: 1.3 });
    eye(d, x + k * r * 1.22, y - r * 0.88, r * 0.12);
    for (const o of [-0.3, 0.3]) {
      line(d, [[x + r * o, y + r * 0.75], [x + r * o, y + r * 1.25]], { width: 1.4, over: 0.6, color: "#c4703f" });
    }
  };
  pigeon(s * 0.3, s * 0.64, s * 0.045, 1, 351);
  pigeon(s * 0.48, s * 0.638, s * 0.042, -1, 353);
  pigeon(s * 0.68, s * 0.635, s * 0.046, -1, 359);
  // One coming in to land.
  const bx = s * 0.86, by = s * 0.32;
  shape(d, oval(bx, by, s * 0.05, s * 0.032, 0.4, 18, 0.06, 367), "#8e93a0", { width: 1.5 });
  for (const k of [-1, 1]) {
    shape(d, poly([bx, by], [bx - k * s * 0.02, by - s * 0.11], [bx + k * s * 0.06, by - s * 0.06]),
      "#a3a8b4", { width: 1.4 });
  }
}

function drawWeathervaneHawk(d: DrawCtx) {
  const { s, ctx } = d;
  for (let i = 0; i < 7; i++) {
    const r = d.rand;
    dot(d, s * (0.05 + r() * 0.9), s * (0.04 + r() * 0.45), s * 0.007, hexA("#e8c9a0", 0.6));
  }
  shape(d, poly([s * 0.02, s * 0.88], [s * 0.98, s * 0.84], [s * 0.98, s * 1.0], [s * 0.02, s * 1.0]), "#8d5240");
  // The vane: post, compass arms, and the letters implied by four pips.
  line(d, [[s * 0.5, s * 0.88], [s * 0.5, s * 0.34]], { width: 3.4, over: 1 });
  line(d, [[s * 0.3, s * 0.56], [s * 0.7, s * 0.555]], { width: 2.4, over: 3 });
  line(d, [[s * 0.5, s * 0.46], [s * 0.5, s * 0.66]], { width: 2.4, over: 3 });
  for (const [x, y] of [[s * 0.27, s * 0.56], [s * 0.73, s * 0.555], [s * 0.5, s * 0.43], [s * 0.5, s * 0.69]] as Pt[]) {
    dot(d, x, y, s * 0.011);
  }
  // The arrow it is supposed to have.
  shape(d, poly([s * 0.5, s * 0.4], [s * 0.66, s * 0.36], [s * 0.5, s * 0.32]), "#4a4a52", { width: 1.5 });

  // And a hawk that has landed on it, which is not supposed to be there.
  const hx = s * 0.46, hy = s * 0.26;
  const body = poly(
    [hx - s * 0.06, hy + s * 0.08], [hx - s * 0.07, hy - s * 0.03],
    [hx - s * 0.02, hy - s * 0.1], [hx + s * 0.05, hy - s * 0.07],
    [hx + s * 0.07, hy + s * 0.04], [hx + s * 0.03, hy + s * 0.11],
  );
  shape(d, body, "#8a6f52");
  shade(d, body, 0.22);
  // Barred breast.
  ctx.save();
  tracePath(ctx, body);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    line(d, [[hx - s * 0.06, hy - s * 0.05 + i * s * 0.035], [hx + s * 0.06, hy - s * 0.055 + i * s * 0.035]],
      { width: 1.4, over: 1, alpha: 0.35 });
  }
  ctx.restore();
  const head = oval(hx + s * 0.02, hy - s * 0.13, s * 0.045, s * 0.042, 0.1, 18, 0.05, 371);
  shape(d, head, "#9a7d5c");
  shape(d, poly([hx + s * 0.058, hy - s * 0.145], [hx + s * 0.098, hy - s * 0.126], [hx + s * 0.056, hy - s * 0.114]),
    "#e0c25a", { width: 1.4 });
  // The brow that makes a hawk look furious.
  eye(d, hx + s * 0.038, hy - s * 0.145, s * 0.014);
  line(d, [[hx + s * 0.005, hy - s * 0.168], [hx + s * 0.062, hy - s * 0.158]], { width: 2, over: 0.8 });
  // Talons gripping the arm.
  for (const o of [-0.02, 0.03]) {
    line(d, [[hx + s * o, hy + s * 0.1], [hx + s * o, hy + s * 0.17]], { width: 1.8, over: 0.5, color: "#e0c25a" });
    for (const t of [-1, 1]) {
      line(d, [[hx + s * o, hy + s * 0.17], [hx + s * o + t * s * 0.022, hy + s * 0.195]],
        { width: 1.3, over: 0.5, color: "#e0c25a" });
    }
  }
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
  "Gull Parliament": drawGullParliament,
  "Rockpool Crab": drawRockpoolCrab,
  "Seal Loaf": drawSealLoaf,
  "Lighthouse Keeper": drawLighthouseKeeper,
  "Mushroom Ring": drawMushroomRing,
  "Antlered Shape": drawAntleredShape,
  "Moth Cloud": drawMothCloud,
  "Wisp": drawWisp,
  "Roof Cat": drawRoofCat,
  "Laundry Ghost": drawLaundryGhost,
  "Pigeon Loft": drawPigeonLoft,
  "Weathervane Hawk": drawWeathervaneHawk,
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
