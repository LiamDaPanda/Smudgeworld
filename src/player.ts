import {
  BufferGeometry,
  CircleGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import type { InputState, Player } from "./types.ts";

const INK = new Color("#1a1a1a");
const PAPER = new Color("#f4efe6");
const WALK_SPEED = 4.2;

const HEAD_R = 0.18;
const HEAD_Y = 1.72;
const NECK_Y = 1.54;
const SHOULDER_Y = 1.42;
const HIP_Y = 1.0;
const LIMB_LEN = 0.55;

function lineFrom(points: Vector3[], color = INK): Line {
  const pos: number[] = [];
  for (const p of points) pos.push(p.x, p.y, p.z);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return new Line(g, new LineBasicMaterial({ color }));
}

function makeLimb(): Group {
  const g = new Group();
  const line = lineFrom([new Vector3(0, 0, 0), new Vector3(0, -LIMB_LEN, 0)]);
  g.add(line);
  return g;
}

function makeCamera(): Group {
  const g = new Group();
  const w = 0.16;
  const h = 0.1;
  const d = 0.08;
  const body = new Mesh(
    new BufferGeometry().setFromPoints([
      new Vector3(-w / 2, -h / 2, -d / 2),
      new Vector3(w / 2, -h / 2, -d / 2),
      new Vector3(w / 2, h / 2, -d / 2),
      new Vector3(-w / 2, h / 2, -d / 2),
      new Vector3(-w / 2, -h / 2, d / 2),
      new Vector3(w / 2, -h / 2, d / 2),
      new Vector3(w / 2, h / 2, d / 2),
      new Vector3(-w / 2, h / 2, d / 2),
    ]),
    new MeshBasicMaterial({ color: PAPER })
  );
  // Body as simple line edges
  const edges = new EdgesGeometry(boxGeometry(w, h, d));
  g.add(new LineSegments(edges, new LineBasicMaterial({ color: INK })));
  body.visible = false;
  g.add(body);

  const lens = new Mesh(
    new CircleGeometry(0.03, 16),
    new MeshBasicMaterial({ color: INK })
  );
  lens.position.set(0, 0, d / 2 + 0.001);
  g.add(lens);
  return g;
}

function boxGeometry(w: number, h: number, d: number) {
  // Simple box via BufferGeometry so we don't drag in BoxGeometry import above
  const geo = new BufferGeometry();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const verts = new Float32Array([
    -hw, -hh, -hd,  hw, -hh, -hd,  hw,  hh, -hd,  -hw,  hh, -hd,
    -hw, -hh,  hd,  hw, -hh,  hd,  hw,  hh,  hd,  -hw,  hh,  hd,
  ]);
  const indices = [
    0, 1, 2,  0, 2, 3,
    4, 6, 5,  4, 7, 6,
    0, 4, 5,  0, 5, 1,
    2, 6, 7,  2, 7, 3,
    1, 5, 6,  1, 6, 2,
    0, 3, 7,  0, 7, 4,
  ];
  geo.setAttribute("position", new Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  return geo;
}

export function createPlayer(startX: number): Player {
  const root = new Group();
  root.position.set(startX, 0, 0);

  // Head (billboard-ish circle facing camera, with an outer outline)
  const head = new Mesh(new CircleGeometry(HEAD_R, 24), new MeshBasicMaterial({ color: PAPER }));
  head.position.y = HEAD_Y;
  root.add(head);

  const headOutlinePts: Vector3[] = [];
  const segs = 32;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    headOutlinePts.push(new Vector3(Math.cos(a) * HEAD_R, HEAD_Y + Math.sin(a) * HEAD_R, 0));
  }
  root.add(lineFrom(headOutlinePts));

  // Spine
  root.add(lineFrom([new Vector3(0, NECK_Y, 0), new Vector3(0, HIP_Y, 0)]));

  // Neck strap (V shape)
  const strap = lineFrom([
    new Vector3(-0.09, NECK_Y - 0.02, 0),
    new Vector3(0, SHOULDER_Y - 0.05, 0.04),
    new Vector3(0.09, NECK_Y - 0.02, 0),
  ]);
  root.add(strap);

  // Camera hanging on the chest
  const cameraProp = makeCamera();
  cameraProp.position.set(0, SHOULDER_Y - 0.12, 0.06);
  root.add(cameraProp);

  // Arms — each is a Group placed at the shoulder, so rotating the group swings the arm
  const leftArm = makeLimb();
  leftArm.position.set(-0.001, SHOULDER_Y, 0);
  root.add(leftArm);

  const rightArm = makeLimb();
  rightArm.position.set(0.001, SHOULDER_Y, 0);
  root.add(rightArm);

  // Legs
  const leftLeg = makeLimb();
  leftLeg.position.set(-0.02, HIP_Y, 0);
  root.add(leftLeg);

  const rightLeg = makeLimb();
  rightLeg.position.set(0.02, HIP_Y, 0);
  root.add(rightLeg);

  return {
    root,
    worldX: startX,
    facing: 1,
    walkPhase: 0,
    cameraRaised: false,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    cameraProp,
  };
}

export function updatePlayer(p: Player, input: InputState, dt: number, worldWidth: number) {
  p.cameraRaised = input.cameraHeld;
  const canMove = !p.cameraRaised;
  let dir = 0;
  if (canMove) {
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
  }
  const vx = dir * WALK_SPEED;
  p.worldX += vx * dt;
  p.worldX = Math.max(1, Math.min(worldWidth - 1, p.worldX));
  if (dir !== 0) p.facing = dir > 0 ? 1 : -1;
  p.walkPhase += Math.abs(vx) * dt * 2.2;

  p.root.position.x = p.worldX;
  p.root.rotation.y = p.facing === 1 ? 0 : Math.PI;

  const swing = Math.sin(p.walkPhase);
  const legAmp = 0.55;
  p.leftLeg.rotation.x = swing * legAmp;
  p.rightLeg.rotation.x = -swing * legAmp;

  const armAmp = 0.35;
  if (p.cameraRaised) {
    // Both arms up holding the camera to the eye
    p.leftArm.rotation.x = -1.3;
    p.rightArm.rotation.x = -1.3;
    p.leftArm.rotation.z = 0.15;
    p.rightArm.rotation.z = -0.15;
    p.cameraProp.position.set(0, HEAD_Y - 0.1, 0.12);
    p.cameraProp.rotation.set(0, 0, 0);
  } else {
    p.leftArm.rotation.x = -swing * armAmp;
    p.rightArm.rotation.x = swing * armAmp;
    p.leftArm.rotation.z = 0;
    p.rightArm.rotation.z = 0;
    p.cameraProp.position.set(0, SHOULDER_Y - 0.12, 0.06);
    p.cameraProp.rotation.set(0, 0, 0);
  }
}
