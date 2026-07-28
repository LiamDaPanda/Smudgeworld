// The photographer, in profile.
//
// A side-scroller shows exactly one view of its hero, forever, so that view has
// to carry everything. The top-down build could get away with a stick and a hat
// because you mostly saw it from above; seen edge-on the same rig collapses —
// both legs on one line, both arms on one line, and the whole thing reads as a
// lamp post with a hat on.
//
// So: two-bone limbs with knees and elbows, the far arm and far leg painted a
// shade darker so the pairs separate, and a silhouette that says *photographer*
// (brim forward, camera on the chest) rather than *person*.

import { hexA, makeSprite, seeded, sketch, type Pt, type Sprite } from "./art2d.ts";

const INK = "#22201c";
const SKIN = "#efe4cf";
const SHIRT = "#b8a578";
const SHIRT_FAR = "#8d7d58";
const TROUSER = "#4d5a63";
const TROUSER_FAR = "#3a444b";
const BOOT = "#3a2f26";
const HAT = "#5b8452";
const HAT_DARK = "#3f6440";
const CAM = "#4f3d2b";

export type Facing = "left" | "right";

/**
 * Standing height in pixels at bake time, measured feet to eyes.
 *
 * The canvas has to be taller than that: the hat crown reaches well above the
 * head, and anything past the anchor is silently clipped by the sprite edge —
 * which is how the photographer spent a build wearing no hat at all.
 */
const H = 96;
const PAD_TOP = 28;
const HEAD_R = 13.5;
/** Thigh and shin, upper arm and forearm. */
const L_THIGH = H * 0.23, L_SHIN = H * 0.21;
const L_UPPER = H * 0.17, L_FORE = H * 0.16;

/** A two-bone limb: root, one bend, and a foot or hand at the end. */
function bone(
  ctx: CanvasRenderingContext2D, root: Pt, a1: number, a2: number,
  l1: number, l2: number, w1: number, w2: number, color: string
) {
  const joint: Pt = [root[0] + Math.sin(a1) * l1, root[1] + Math.cos(a1) * l1];
  const end: Pt = [joint[0] + Math.sin(a2) * l2, joint[1] + Math.cos(a2) * l2];
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = w1;
  ctx.beginPath();
  ctx.moveTo(root[0], root[1]);
  ctx.lineTo(joint[0], joint[1]);
  ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath();
  ctx.moveTo(joint[0], joint[1]);
  ctx.lineTo(end[0], end[1]);
  ctx.stroke();
  return end;
}

function drawBoot(ctx: CanvasRenderingContext2D, at: Pt, toe: number, dark: boolean) {
  ctx.fillStyle = dark ? hexA(BOOT, 0.7) : BOOT;
  ctx.beginPath();
  ctx.moveTo(at[0] - 3.4, at[1] - 3);
  ctx.lineTo(at[0] + toe * 8, at[1] - 2.6);
  ctx.lineTo(at[0] + toe * 8.4, at[1] + 1.6);
  ctx.lineTo(at[0] - 3.6, at[1] + 1.6);
  ctx.closePath();
  ctx.fill();
}

function drawCamera(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = CAM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-7, -5); ctx.lineTo(8, -5); ctx.lineTo(8, 5); ctx.lineTo(-7, 5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2, -5); ctx.lineTo(0, -8.4); ctx.lineTo(4, -8.4); ctx.lineTo(5, -5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Lens barrel, pointing the way you walk.
  ctx.fillStyle = "#6f5636";
  ctx.beginPath();
  ctx.moveTo(6, -3.4); ctx.lineTo(12, -2.8); ctx.lineTo(12, 2.8); ctx.lineTo(6, 3.4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2f2a22";
  ctx.beginPath(); ctx.ellipse(11.6, 0, 1.6, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * `phase` runs 0..1 over one stride. Legs swing in antiphase, knees bend only
 * on the forward swing, and the body lifts at mid-stride — which is the bit
 * that stops a walk reading as a slide.
 */
export function drawPlayerFrame(facing: Facing, phase: number, idle = false): Sprite {
  // One stream per frame, so the hand-drawn wander is stable within a frame
  // but differs between them — which is exactly how a flip-book looks.
  const rand = seeded(1471 + Math.round(phase * 1000) + (idle ? 7 : 0));
  const p = phase * Math.PI * 2;
  const bob = idle ? 0 : Math.abs(Math.cos(p)) * 2.2;
  const flip = facing === "left";
  // Standing, a stride of zero puts both legs and both arms on exactly the same
  // line and the whole figure flattens back into a post. The idle pose is a
  // stance, not frame zero of the walk.
  const swing = idle ? 0 : Math.sin(p);
  const swingBack = idle ? 0 : Math.sin(p + Math.PI);

  return makeSprite(80, H + PAD_TOP + 6, 40, H + PAD_TOP, (ctx) => {
    if (flip) ctx.scale(-1, 1);

    const hipY = -(L_THIGH + L_SHIN) - 2 - bob;
    const shoulderY = hipY - H * 0.29;
    const headY = shoulderY - HEAD_R * 1.2;
    const hip: Pt = [-1, hipY];

    // --- Far leg and far arm, behind the torso ---
    const farThigh = idle ? -0.16 : 0.5 * swingBack;
    const farKnee = farThigh - (idle ? 0.06 : 0.62 * Math.max(0, Math.sin(p + Math.PI + 1.1)));
    const farFoot = bone(ctx, hip, farThigh, farKnee, L_THIGH, L_SHIN, 8.5, 7, TROUSER_FAR);
    drawBoot(ctx, farFoot, 1, true);

    const farUpper = (idle ? 0.1 : 0.62 * swing) - 0.18;
    const farElbow = farUpper + (idle ? 0.34 : 0.5);
    const farHand = bone(ctx, [-1, shoulderY + 4], farUpper, farElbow, L_UPPER, L_FORE, 7, 6, SHIRT_FAR);
    ctx.fillStyle = hexA(SKIN, 0.7);
    ctx.beginPath(); ctx.arc(farHand[0], farHand[1], 3.2, 0, Math.PI * 2); ctx.fill();

    // --- Torso: a tapered slab leaning very slightly into the walk ---
    const mid = (hipY + shoulderY) / 2;
    const torso: Pt[] = [
      [-7.5, hipY + 3], [-10, mid], [-8.8, shoulderY], [-1, shoulderY - 3],
      [8.8, shoulderY + 0.6], [10, mid], [7, hipY + 3], [0, hipY + 4],
    ];
    ctx.beginPath();
    ctx.moveTo(torso[0][0], torso[0][1]);
    for (const q of torso.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fillStyle = SHIRT;
    ctx.fill();
    sketch(ctx, torso, rand, { closed: true, color: INK, width: 1.6, wobble: 0.8, alpha: 0.85, passes: 1 });
    // Belt
    ctx.strokeStyle = hexA(INK, 0.55);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7.2, hipY + 1.5); ctx.lineTo(7, hipY + 1.5);
    ctx.stroke();

    // --- Near leg, in front ---
    const nearThigh = idle ? 0.14 : 0.5 * swing;
    const nearKnee = nearThigh - (idle ? 0.1 : 0.62 * Math.max(0, Math.sin(p + 1.1)));
    const nearFoot = bone(ctx, hip, nearThigh, nearKnee, L_THIGH, L_SHIN, 9, 7.5, TROUSER);
    drawBoot(ctx, nearFoot, 1, false);

    // --- Neck and head ---
    ctx.strokeStyle = SKIN;
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1, shoulderY + 1);
    ctx.lineTo(1.5, headY + HEAD_R * 0.55);
    ctx.stroke();

    // Head in profile: an egg with a nose, tipped forward a touch.
    ctx.save();
    ctx.translate(1.5, headY);
    ctx.rotate(0.08);
    const head: Pt[] = [
      [-HEAD_R * 0.85, 0], [-HEAD_R * 0.86, -HEAD_R * 0.62], [-HEAD_R * 0.5, -HEAD_R * 0.98],
      [0, -HEAD_R * 1.02], [HEAD_R * 0.6, -HEAD_R * 0.9], [HEAD_R * 0.86, -HEAD_R * 0.02],
      [HEAD_R * 1.0, HEAD_R * 0.2],    // nose, small — any bigger and the
      [HEAD_R * 0.76, HEAD_R * 0.32],  // profile reads as a beak
      [HEAD_R * 0.62, HEAD_R * 0.8], [0, HEAD_R * 0.94], [-HEAD_R * 0.7, HEAD_R * 0.82],
    ];
    ctx.beginPath();
    ctx.moveTo(head[0][0], head[0][1]);
    for (const q of head.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fillStyle = SKIN;
    ctx.fill();
    sketch(ctx, head, rand, { closed: true, color: hexA(INK, 0.75), width: 1.4, wobble: 0.55, alpha: 0.9, passes: 1 });
    // Eye and a hint of jaw
    ctx.fillStyle = hexA(INK, 0.8);
    ctx.beginPath(); ctx.ellipse(HEAD_R * 0.42, -HEAD_R * 0.1, 1.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(INK, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEAD_R * 0.7, HEAD_R * 0.36);
    ctx.quadraticCurveTo(HEAD_R * 0.1, HEAD_R * 0.72, -HEAD_R * 0.5, HEAD_R * 0.6);
    ctx.stroke();

    // Hat. Brim first and low-contrast, crown over it and rounded: a brim drawn
    // last, dark and wide, is just a black bar sitting on top of the head at
    // any size you actually play at.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.fillStyle = HAT_DARK;
    ctx.beginPath();
    ctx.moveTo(-HEAD_R * 0.86, -HEAD_R * 0.5);
    ctx.quadraticCurveTo(HEAD_R * 0.5, -HEAD_R * 0.78, HEAD_R * 1.34, -HEAD_R * 0.6);
    ctx.quadraticCurveTo(HEAD_R * 0.5, -HEAD_R * 0.3, -HEAD_R * 0.84, -HEAD_R * 0.34);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = HAT;
    ctx.beginPath();
    ctx.moveTo(-HEAD_R * 0.8, -HEAD_R * 0.56);
    ctx.quadraticCurveTo(-HEAD_R * 0.86, -HEAD_R * 1.44, -HEAD_R * 0.1, -HEAD_R * 1.5);
    ctx.quadraticCurveTo(HEAD_R * 0.78, -HEAD_R * 1.44, HEAD_R * 0.84, -HEAD_R * 0.62);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // A band where the crown meets the brim, so the two shapes separate.
    ctx.strokeStyle = hexA("#2f4a33", 0.85);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-HEAD_R * 0.78, -HEAD_R * 0.66);
    ctx.quadraticCurveTo(0, -HEAD_R * 0.82, HEAD_R * 0.82, -HEAD_R * 0.7);
    ctx.stroke();
    ctx.restore();

    // --- Camera on its strap, and the near arm resting on it ---
    ctx.strokeStyle = hexA(INK, 0.85);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5.5, shoulderY + 1);
    ctx.quadraticCurveTo(1, shoulderY + 12, 5, shoulderY + 4);
    ctx.stroke();
    drawCamera(ctx, 3, shoulderY + 18, 0.95);

    const nearUpper = (idle ? -0.1 : 0.62 * swingBack) - 0.18;
    const nearElbow = nearUpper + (idle ? 0.38 : 0.55);
    const nearHand = bone(ctx, [2, shoulderY + 4], nearUpper, nearElbow, L_UPPER, L_FORE, 7.5, 6.5, SHIRT);
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = hexA(INK, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(nearHand[0], nearHand[1], 3.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  });
}

export interface PlayerSprites {
  frames: Record<Facing, Sprite[]>;
  idle: Record<Facing, Sprite>;
}

/** Six frames reads as a walk; four reads as a shuffle. */
const PHASES = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
export const WALK_FRAMES = PHASES.length;

export function bakePlayer(): PlayerSprites {
  const frames = {} as Record<Facing, Sprite[]>;
  const idle = {} as Record<Facing, Sprite>;
  for (const f of ["left", "right"] as Facing[]) {
    frames[f] = PHASES.map((p) => drawPlayerFrame(f, p));
    idle[f] = drawPlayerFrame(f, 0, true);
  }
  return { frames, idle };
}
