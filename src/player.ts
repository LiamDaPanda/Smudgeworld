import {
  CanvasTexture,
  SRGBColorSpace,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import { extrude, lathe, MeshBuilder, resample, tube } from "./modeling.ts";
import type { InputState, Player } from "./types.ts";

const INK = new Color("#1a1a1a");
const CAMERA_TAN = new Color("#8b6b45");
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.4;

const HEAD_R = 0.155;
const HEAD_Y = 1.62;
const SHOULDER_Y = 1.36;
const HIP_Y = 0.92;
const LIMB_LEN = 0.5;

// The figure is built from authored geometry rather than Three's primitives.
// A sphere on capsules is a snowman, and next to trees that now have root
// flare and forked boughs it was the crudest thing on screen — and it's the
// one object that's on screen the whole time.

function solid(mb: MeshBuilder, color: Color, threshold = 40, inkOpacity = 0.85): Group {
  const g = new Group();
  const geo = mb.geometry();
  g.add(new Mesh(geo, new MeshBasicMaterial({ color })));
  g.add(new LineSegments(
    new EdgesGeometry(geo, threshold),
    new LineBasicMaterial({ color: INK, transparent: true, opacity: inkOpacity })
  ));
  return g;
}

/**
 * A limb: tapered from joint to end, with a slight bend, and a rounded cap.
 * Capsules are uniform tubes — a tapered one reads as an arm.
 */
function makeLimb(thickTop: number, thickEnd: number, length: number): Group {
  const g = new Group();
  const spine = resample([
    [0, 0, 0],
    [0, -length * 0.5, length * 0.03],
    [0, -length, 0],
  ], 6);
  const mb = tube(spine, (t) => thickTop + (thickEnd - thickTop) * t, {
    sides: 6, capStart: true, capEnd: true,
  });
  g.add(solid(mb, INK, 52, 0.5));
  return g;
}

function makeCamera(): Group {
  const g = new Group();
  const w = 0.23, h = 0.15, d = 0.12;
  // The body is an extruded outline with clipped top corners, which is what
  // makes it read as a camera rather than as a die.
  const body = extrude([
    [-w / 2, -h / 2], [w / 2, -h / 2],
    [w / 2, h * 0.22], [w * 0.34, h / 2],
    [-w * 0.34, h / 2], [-w / 2, h * 0.22],
  ], d, 0.9);
  g.add(solid(body, CAMERA_TAN, 24));

  // Lens: two stacked barrels, so it has a rim rather than being one stub.
  const lens = lathe([
    [0.052, 0], [0.052, 0.03], [0.044, 0.032],
    [0.044, 0.055], [0.036, 0.058], [0, 0.058],
  ], 12);
  const lensG = solid(lens, INK, 30, 0.6);
  lensG.rotation.x = -Math.PI / 2;
  lensG.position.z = d / 2;
  g.add(lensG);

  const vf = extrude([[-0.03, -0.02], [0.03, -0.02], [0.03, 0.02], [-0.03, 0.02]], 0.06, 0.85);
  const vfG = solid(vf, CAMERA_TAN, 24);
  vfG.position.set(-w * 0.26, h / 2 + 0.018, 0);
  g.add(vfG);

  const winder = lathe([[0.018, 0], [0.018, 0.016], [0.012, 0.02], [0, 0.02]], 8);
  const wG = solid(winder, new Color("#3a2a1a"), 30, 0.6);
  wG.position.set(w * 0.34, h / 2, 0);
  g.add(wG);
  return g;
}

/** Head: an egg, not a ball — narrower at the jaw, with a hat that has a dent. */
function makeHead(): Group {
  const g = new Group();
  const r = HEAD_R;
  const skull = lathe([
    [0, -r * 0.95],
    [r * 0.55, -r * 0.78],
    [r * 0.85, -r * 0.36],
    [r * 1.0, r * 0.04],
    [r * 0.9, r * 0.44],
    [r * 0.58, r * 0.74],
    [0, r * 0.88],
  ], 9, (row, k) => 1 + Math.sin(k * 1.7 + row) * 0.03);
  const head = solid(skull, new Color("#efe4cf"), 46, 0.45);
  head.position.y = HEAD_Y;
  g.add(head);

  // Hat: a brim that dips at the front and a crown pinched in at the top.
  const brimY = HEAD_Y + r * 0.46;
  const brim = lathe([
    [0, 0.014], [r * 0.85, 0.013], [r * 1.22, -0.004], [r * 1.28, -0.016], [r * 0.85, -0.017], [0, -0.015],
  ], 14);
  const brimG = solid(brim, new Color("#2c4630"), 34, 0.8);
  brimG.position.y = brimY;
  brimG.rotation.z = 0.05; // sits at a slight angle
  g.add(brimG);

  // Low and slightly domed. The first pass had a tall pinched crown, which at
  // this scale read as a cooking pot balanced on the head rather than a hat.
  const crown = lathe([
    [r * 0.98, 0],
    [r * 0.95, 0.05],
    [r * 0.87, 0.085],
    [r * 0.66, 0.105],
    [0, 0.115],
  ], 12);
  const crownG = solid(crown, new Color("#38553a"), 34, 0.8);
  crownG.position.y = brimY + 0.008;
  crownG.rotation.z = 0.05;
  g.add(crownG);
  return g;
}

/** Torso: shoulders wider than the waist, flattened front to back. */
function makeTorso(): Group {
  const g = new Group();
  const spine = resample([
    [0, HIP_Y - 0.06, 0],
    [0, (HIP_Y + SHOULDER_Y) / 2, 0.012],
    [0, SHOULDER_Y + 0.03, 0],
  ], 7);
  // Narrow at the hip, widening to real shoulders. A column of even width is
  // a paper bag; the taper is what reads as a body.
  const mb = tube(spine, (t) => 0.1 + t * t * 0.048, {
    sides: 7, flatten: 0.62, capStart: true, capEnd: true,
  });
  // Shoulder caps, so the arms hang off something instead of out of a tube.
  for (const side of [-1, 1]) {
    mb.merge(tube(
      resample([
        [side * 0.04, SHOULDER_Y - 0.005, 0],
        [side * 0.105, SHOULDER_Y + 0.01, 0],
        [side * 0.14, SHOULDER_Y - 0.02, 0],
      ], 5),
      (t) => 0.056 - t * 0.018,
      { sides: 6, capStart: true, capEnd: true }
    ));
  }
  g.add(solid(mb, new Color("#b3a077"), 44, 0.7));

  // A neck. Without one the head simply floated above the collar.
  const neck = tube(
    resample([[0, SHOULDER_Y - 0.02, 0], [0, HEAD_Y - HEAD_R * 0.78, 0]], 4),
    (t) => 0.036 + t * 0.012,
    { sides: 6, capStart: true, capEnd: true }
  );
  g.add(solid(neck, new Color("#e6d9c0"), 50, 0.5));

  // Strap across the chest, running to the camera rather than floating.
  const strap = tube(
    resample([
      [-0.15, SHOULDER_Y + 0.02, -0.02],
      [-0.05, SHOULDER_Y - 0.1, 0.075],
      [0.06, SHOULDER_Y - 0.14, 0.08],
      [0.16, SHOULDER_Y + 0.01, -0.02],
    ], 8),
    () => 0.014,
    { sides: 4 }
  );
  g.add(solid(strap, INK, 60, 0.5));
  return g;
}

// Soft radial blob shadow that travels with the player.
function makeBlobShadow(): Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, "rgba(30,28,22,0.4)");
  g.addColorStop(1, "rgba(30,28,22,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  const m = new Mesh(
    new PlaneGeometry(0.9, 0.6),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

export function createPlayer(startX: number, startZ: number): Player {
  const root = new Group();
  root.position.set(startX, 0, startZ);

  root.add(makeHead());
  root.add(makeTorso());
  root.add(makeBlobShadow());

  const cameraProp = makeCamera();
  cameraProp.position.set(0, SHOULDER_Y - 0.16, 0.13);
  root.add(cameraProp);

  const leftArm = makeLimb(0.042, 0.028, LIMB_LEN + 0.02);
  leftArm.position.set(-0.148, SHOULDER_Y - 0.015, 0);
  root.add(leftArm);

  const rightArm = makeLimb(0.042, 0.028, LIMB_LEN + 0.02);
  rightArm.position.set(0.148, SHOULDER_Y - 0.015, 0);
  root.add(rightArm);

  const leftLeg = makeLimb(0.062, 0.042, LIMB_LEN + 0.14);
  leftLeg.position.set(-0.075, HIP_Y, 0);
  root.add(leftLeg);

  const rightLeg = makeLimb(0.062, 0.042, LIMB_LEN + 0.14);
  rightLeg.position.set(0.075, HIP_Y, 0);
  root.add(rightLeg);

  return {
    root,
    worldX: startX,
    worldZ: startZ,
    yaw: 0,
    velX: 0,
    velZ: 0,
    walkPhase: 0,
    cameraRaised: false,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    cameraProp,
  };
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const PLAYER_RADIUS = 0.32;

/**
 * Push the player out of any collider they've ended up inside. Because we
 * resolve position (rather than cancelling the whole move), walking into a
 * tree at an angle slides you around it instead of sticking you to it.
 */
function resolveCollisions(p: Player, colliders: { x: number; z: number; r: number }[]) {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const c of colliders) {
      const dx = p.worldX - c.x;
      const dz = p.worldZ - c.z;
      const minDist = c.r + PLAYER_RADIUS;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 0.0001) {
        const push = (minDist - d) / d;
        p.worldX += dx * push;
        p.worldZ += dz * push;
        moved = true;
      } else if (d <= 0.0001) {
        // Dead centre: nudge along +X so we don't divide by zero
        p.worldX += minDist;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** How fast velocity chases the input, in units of "fraction closed per second". */
const ACCEL = 14;
const DECEL = 18;

export function updatePlayer(
  p: Player,
  input: InputState,
  dt: number,
  bounds: WorldBounds,
  colliders: { x: number; z: number; r: number }[] = [],
  /** Yaw the camera is looking along. Movement is relative to this. */
  camYaw = 0
) {
  // Stick input, with a deadzone so a joystick resting slightly off-centre
  // doesn't creep, and so the analog range starts from a true zero.
  let ix = input.moveX;
  let iz = input.moveZ;
  const raw = Math.hypot(ix, iz);
  const DEAD = 0.14;
  let mag = 0;
  if (raw > DEAD) {
    mag = Math.min(1, (raw - DEAD) / (1 - DEAD));
    ix /= raw;
    iz /= raw;
  } else {
    ix = 0; iz = 0;
  }

  // Movement is relative to the camera, not to the world axes. Before this,
  // W always walked toward -Z no matter where the camera was pointing, so
  // after orbiting the view even slightly, every key sent you somewhere other
  // than the direction it was pressed — and because the camera sat behind the
  // player's facing, each turn whipped the whole view around.
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rx = -fz;
  const rz = fx;
  // iz is -1 for forward, so forward contribution is -iz.
  const dirX = fx * -iz + rx * ix;
  const dirZ = fz * -iz + rz * ix;

  // Speed rises with how far the stick is pushed; shift (or a stick at the
  // rim) tops out at a run.
  const speed = input.sprint
    ? SPRINT_SPEED
    : WALK_SPEED * (0.45 + 0.55 * mag);
  const targetVX = dirX * speed * mag;
  const targetVZ = dirZ * speed * mag;

  // Ease velocity toward the target rather than snapping. Stopping is a shade
  // quicker than starting, which reads as deliberate rather than sluggish.
  const rate = mag > 0 ? ACCEL : DECEL;
  const k = 1 - Math.exp(-rate * dt);
  p.velX += (targetVX - p.velX) * k;
  p.velZ += (targetVZ - p.velZ) * k;
  if (Math.hypot(p.velX, p.velZ) < 0.02) { p.velX = 0; p.velZ = 0; }

  const movingNow = p.velX !== 0 || p.velZ !== 0;
  if (movingNow) {
    p.worldX += p.velX * dt;
    p.worldZ += p.velZ * dt;
    p.worldX = Math.max(bounds.minX, Math.min(bounds.maxX, p.worldX));
    p.worldZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.worldZ));
    resolveCollisions(p, colliders);
    p.worldX = Math.max(bounds.minX, Math.min(bounds.maxX, p.worldX));
    p.worldZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.worldZ));
  }

  // Face the way you're actually travelling. Turn rate scales a little with
  // speed so a walking turn is soft and a sprinting one is snappy.
  if (mag > 0) {
    const targetYaw = Math.atan2(dirX, dirZ) + Math.PI;
    let diff = ((targetYaw - p.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    p.yaw += diff * Math.min(1, dt * (9 + 6 * mag));
  }

  const gait = Math.hypot(p.velX, p.velZ);
  const moving = gait > 0.05;
  p.walkPhase += gait * dt * 2.2;

  p.root.position.set(p.worldX, 0, p.worldZ);
  p.root.rotation.y = p.yaw;

  const swing = moving ? Math.sin(p.walkPhase) : 0;
  const legAmp = 0.55;
  p.leftLeg.rotation.x = swing * legAmp;
  p.rightLeg.rotation.x = -swing * legAmp;

  const armAmp = 0.4;
  if (p.cameraRaised) {
    p.leftArm.rotation.x = -1.35;
    p.rightArm.rotation.x = -1.35;
    p.leftArm.rotation.z = 0.18;
    p.rightArm.rotation.z = -0.18;
    p.cameraProp.position.set(0, HEAD_Y - 0.06, 0.18);
    p.cameraProp.rotation.set(0, 0, 0);
  } else {
    p.leftArm.rotation.x = -swing * armAmp;
    p.rightArm.rotation.x = swing * armAmp;
    p.leftArm.rotation.z = 0;
    p.rightArm.rotation.z = 0;
    p.cameraProp.position.set(0, SHOULDER_Y - 0.16, 0.13);
    p.cameraProp.rotation.set(0, 0, 0);
  }
}
