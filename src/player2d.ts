// The photographer, drawn as sprites rather than posed as a rig.
//
// Four facings and four walk frames each. Baked once at load, which is cheap
// enough (sixteen small canvases) and means the walk cycle costs nothing at
// runtime beyond picking an index.

import { hexA, makeSprite, seeded, type Pt, type Sprite } from "./art2d.ts";

const INK = "#22201c";
const SKIN = "#efe4cf";
const SHIRT = "#b3a077";
const HAT = "#38553a";
const HAT_DARK = "#2c4630";
const CAM = "#8b6b45";

export type Facing = "down" | "up" | "left" | "right";

const H = 92;          // sprite height in pixels at bake time
const HEAD_R = 11;

function limb(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, w: number, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function drawCamera(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = CAM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8, -5); ctx.lineTo(8, -5); ctx.lineTo(8, 5); ctx.lineTo(-8, 5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Prism bump
  ctx.beginPath();
  ctx.moveTo(-3, -5); ctx.lineTo(-1, -8); ctx.lineTo(3, -8); ctx.lineTo(4, -5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Lens
  ctx.fillStyle = "#2f2a22";
  ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/**
 * `phase` runs 0..1 over one stride. Legs swing in antiphase; the body lifts a
 * little at mid-stride, which is what stops a walk reading as a slide.
 */
export function drawPlayerFrame(facing: Facing, phase: number, seed = 7): Sprite {
  const rand = seeded(seed);
  const swing = Math.sin(phase * Math.PI * 2);
  const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * 1.6;
  const side = facing === "left" || facing === "right";
  const flip = facing === "left";

  return makeSprite(64, H + 8, 32, H, (ctx) => {
    if (flip) ctx.scale(-1, 1);
    const groundY = 0;
    const hipY = -H * 0.44 - bob;
    const shoulderY = -H * 0.72 - bob;
    const headY = -H * 0.85 - bob;

    // Legs
    const legSpread = side ? 0 : 5;
    limb(ctx, [-legSpread, hipY], [-legSpread + swing * 7, groundY], 6.5);
    limb(ctx, [legSpread, hipY], [legSpread - swing * 7, groundY], 6.5);

    // Torso — a slightly tapered slab, narrower at the hip
    ctx.fillStyle = SHIRT;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const tw = side ? 7 : 10;
    ctx.moveTo(-tw * 0.8, hipY + 2);
    ctx.lineTo(tw * 0.8, hipY + 2);
    ctx.lineTo(tw, shoulderY);
    ctx.lineTo(-tw, shoulderY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Arms, swinging opposite the legs
    const armX = side ? 1 : tw + 1;
    limb(ctx, [-armX, shoulderY + 2], [-armX - swing * 4, hipY + 6], 5);
    limb(ctx, [armX, shoulderY + 2], [armX + swing * 4, hipY + 6], 5);

    // Neck
    limb(ctx, [0, shoulderY], [0, headY + HEAD_R * 0.6], 4.5, SKIN);

    // Head — an egg, wider at the cranium
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = hexA(INK, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, headY, HEAD_R * 0.86, HEAD_R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hat: brim then a low crown. Facing forward the brim reads as an ellipse;
    // from the side it's a line with a bump.
    ctx.fillStyle = HAT_DARK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, headY - HEAD_R * 0.34, HEAD_R * 1.42, HEAD_R * 0.46, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = HAT;
    ctx.beginPath();
    ctx.moveTo(-HEAD_R * 0.92, headY - HEAD_R * 0.4);
    ctx.quadraticCurveTo(-HEAD_R * 0.9, headY - HEAD_R * 1.25, 0, headY - HEAD_R * 1.28);
    ctx.quadraticCurveTo(HEAD_R * 0.9, headY - HEAD_R * 1.25, HEAD_R * 0.92, headY - HEAD_R * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Camera on a strap — only visible from the front and the side.
    if (facing !== "up") {
      ctx.strokeStyle = hexA(INK, 0.8);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-tw * 0.75, shoulderY + 1);
      ctx.quadraticCurveTo(0, shoulderY + 13, tw * 0.75, shoulderY + 1);
      ctx.stroke();
      drawCamera(ctx, side ? 3 : 0, shoulderY + 15, side ? 0.85 : 1);
    }
    void rand;
  });
}

export interface PlayerSprites {
  frames: Record<Facing, Sprite[]>;
}

export function bakePlayer(): PlayerSprites {
  const facings: Facing[] = ["down", "up", "left", "right"];
  const frames = {} as Record<Facing, Sprite[]>;
  for (const f of facings) {
    frames[f] = [0, 0.25, 0.5, 0.75].map((p) => drawPlayerFrame(f, p));
  }
  return { frames };
}

/** Which of the four facings a heading corresponds to. */
export function facingFor(dx: number, dy: number, current: Facing): Facing {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return current;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
