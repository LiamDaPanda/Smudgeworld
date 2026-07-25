import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import type { InputState, Player } from "./types.ts";

const INK = new Color("#1a1a1a");
const CAMERA_TAN = new Color("#8b6b45");
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.4;

const HEAD_R = 0.19;
const HEAD_Y = 1.66;
const SHOULDER_Y = 1.36;
const HIP_Y = 0.92;
const LIMB_LEN = 0.5;
const LIMB_R = 0.055;

// A dark capsule limb built inside a Group so rotating the group swings the
// whole limb around the shoulder/hip joint at the group's origin.
function makeLimb(): Group {
  const g = new Group();
  const geo = new CapsuleGeometry(LIMB_R, LIMB_LEN, 3, 8);
  const mesh = new Mesh(geo, new MeshBasicMaterial({ color: INK }));
  mesh.position.y = -LIMB_LEN / 2 - LIMB_R;
  g.add(mesh);
  return g;
}

function makeCamera(): Group {
  const g = new Group();
  const w = 0.22, h = 0.14, d = 0.11;
  const body = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: CAMERA_TAN }));
  g.add(body);
  const edges = new EdgesGeometry(body.geometry, 30);
  g.add(new LineSegments(edges, new LineBasicMaterial({ color: INK })));

  const lensR = 0.045;
  const lensBody = new Mesh(new CylinderGeometry(lensR, lensR, 0.04, 20), new MeshBasicMaterial({ color: INK }));
  lensBody.rotation.x = Math.PI / 2;
  lensBody.position.set(0, 0, d / 2 + 0.02);
  g.add(lensBody);

  // Little viewfinder bump on top
  const vf = new Mesh(new BoxGeometry(0.06, 0.04, 0.06), new MeshBasicMaterial({ color: CAMERA_TAN }));
  vf.position.set(-w * 0.25, h / 2 + 0.02, 0);
  g.add(vf);
  const vfEdges = new EdgesGeometry(vf.geometry, 30);
  const vfLines = new LineSegments(vfEdges, new LineBasicMaterial({ color: INK }));
  vfLines.position.copy(vf.position);
  g.add(vfLines);

  // Shutter button
  const shutter = new Mesh(new CylinderGeometry(0.015, 0.015, 0.02, 8), new MeshBasicMaterial({ color: new Color("#3a2a1a") }));
  shutter.position.set(w * 0.35, h / 2 + 0.012, 0);
  g.add(shutter);
  return g;
}

// Head — a small sphere with a hat cone on top. Facing direction is the local
// +Z so it turns with the player's yaw.
function makeHead(): Group {
  const g = new Group();
  const head = new Mesh(new SphereGeometry(HEAD_R, 16, 12), new MeshBasicMaterial({ color: new Color("#f0e6d2") }));
  head.position.y = HEAD_Y;
  g.add(head);
  const headEdges = new EdgesGeometry(head.geometry, 25);
  const headLines = new LineSegments(headEdges, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 }));
  headLines.position.y = HEAD_Y;
  g.add(headLines);

  // Hat: brim disc sits at the top of the head, crown cylinder rises above it.
  const brimY = HEAD_Y + HEAD_R * 0.55;
  const brim = new Mesh(new CylinderGeometry(HEAD_R * 1.35, HEAD_R * 1.35, 0.02, 20), new MeshBasicMaterial({ color: new Color("#2f4a2f") }));
  brim.position.y = brimY;
  g.add(brim);
  const brimEdges = new EdgesGeometry(brim.geometry, 25);
  const brimLines = new LineSegments(brimEdges, new LineBasicMaterial({ color: INK }));
  brimLines.position.y = brimY;
  g.add(brimLines);

  const crownH = 0.18;
  const hat = new Mesh(new CylinderGeometry(HEAD_R * 0.75, HEAD_R * 1.0, crownH, 14), new MeshBasicMaterial({ color: new Color("#3a5a3a") }));
  hat.position.y = brimY + 0.01 + crownH / 2;
  g.add(hat);
  const hatEdges = new EdgesGeometry(hat.geometry, 25);
  const hatLines = new LineSegments(hatEdges, new LineBasicMaterial({ color: INK }));
  hatLines.position.copy(hat.position);
  g.add(hatLines);
  return g;
}

function makeTorso(): Group {
  const g = new Group();
  // Slim shirt from shoulders to hips
  const torso = new Mesh(
    new CapsuleGeometry(0.14, HIP_Y * 0 + (SHOULDER_Y - HIP_Y) * 0.75, 3, 8),
    new MeshBasicMaterial({ color: new Color("#c2b48a") })
  );
  torso.position.y = (SHOULDER_Y + HIP_Y) / 2;
  torso.scale.set(1.05, 1, 0.65);
  g.add(torso);
  const edges = new EdgesGeometry(torso.geometry, 25);
  const lines = new LineSegments(edges, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 }));
  lines.position.copy(torso.position);
  lines.scale.copy(torso.scale);
  g.add(lines);

  // Camera strap — a dark band across the shoulders
  const strap = new Mesh(
    new CylinderGeometry(0.015, 0.015, 0.28, 6),
    new MeshBasicMaterial({ color: INK })
  );
  strap.rotation.z = Math.PI / 2;
  strap.position.set(0, SHOULDER_Y - 0.02, 0.09);
  g.add(strap);
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

  const leftArm = makeLimb();
  leftArm.position.set(-0.15, SHOULDER_Y, 0);
  root.add(leftArm);

  const rightArm = makeLimb();
  rightArm.position.set(0.15, SHOULDER_Y, 0);
  root.add(rightArm);

  const leftLeg = makeLimb();
  leftLeg.position.set(-0.08, HIP_Y, 0);
  root.add(leftLeg);

  const rightLeg = makeLimb();
  rightLeg.position.set(0.08, HIP_Y, 0);
  root.add(rightLeg);

  return {
    root,
    worldX: startX,
    worldZ: startZ,
    yaw: 0,
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

export function updatePlayer(
  p: Player,
  input: InputState,
  dt: number,
  bounds: WorldBounds,
  colliders: { x: number; z: number; r: number }[] = []
) {
  p.cameraRaised = input.cameraHeld;
  const canMove = !p.cameraRaised;

  let mx = canMove ? input.moveX : 0;
  let mz = canMove ? input.moveZ : 0;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }
  const moving = mag > 0.05;
  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;

  if (moving) {
    p.worldX += mx * speed * dt;
    p.worldZ += mz * speed * dt;
    p.worldX = Math.max(bounds.minX, Math.min(bounds.maxX, p.worldX));
    p.worldZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.worldZ));
    resolveCollisions(p, colliders);
    p.worldX = Math.max(bounds.minX, Math.min(bounds.maxX, p.worldX));
    p.worldZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.worldZ));

    const targetYaw = Math.atan2(mx, mz) + Math.PI;
    let diff = ((targetYaw - p.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    p.yaw += diff * Math.min(1, dt * 12);
  }

  p.walkPhase += (moving ? speed : 0) * dt * 2.2;

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
