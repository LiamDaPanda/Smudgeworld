import {
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

// Park pedestrians. Same drawing language as the player — sphere head,
// capsule limbs, ink outlines — but with varied clothing and a few silhouette
// props (hats, bags, dogs) so a crowd doesn't read as clones.

const INK = new Color("#1a1a1a");

const SHIRTS = ["#8a6b8e", "#6b7f9e", "#9e7a5c", "#5f7d6a", "#a8705f", "#7a7f92"];
const TROUSERS = ["#3d3a44", "#4a4238", "#2f3a44", "#453b3b"];
const SKINS = ["#f0e0c8", "#e0c19a", "#c99a6e", "#a2714a", "#6f4a2f"];
const HATS = ["#3a5a3a", "#7a3f3f", "#3f4a6a", "#6a5a3a"];

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

let shadowTex: CanvasTexture | null = null;
function blobShadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, "rgba(30,28,22,0.36)");
  g.addColorStop(1, "rgba(30,28,22,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = new CanvasTexture(c);
  shadowTex.needsUpdate = true;
  return shadowTex;
}

export interface Npc {
  group: Group;
  leftLeg: Group;
  rightLeg: Group;
  leftArm: Group;
  rightArm: Group;
  /** Loop of world-space points this pedestrian strolls between. */
  route: [number, number][];
  leg: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  walkPhase: number;
  /** Seconds left standing still; pedestrians pause to look at things. */
  restFor: number;
  seed: number;
}

function limb(len: number, r: number, color: Color): Group {
  const g = new Group();
  const mesh = new Mesh(new CapsuleGeometry(r, len, 3, 7), new MeshBasicMaterial({ color }));
  mesh.position.y = -len / 2 - r;
  g.add(mesh);
  return g;
}

function outlinedMesh(mesh: Mesh, threshold = 26, opacity = 0.65): LineSegments {
  const ls = new LineSegments(
    new EdgesGeometry(mesh.geometry, threshold),
    new LineBasicMaterial({ color: INK, transparent: true, opacity })
  );
  ls.position.copy(mesh.position);
  ls.scale.copy(mesh.scale);
  return ls;
}

function makePedestrian(rand: () => number): Omit<Npc, "route" | "leg" | "x" | "z" | "yaw" | "speed" | "restFor" | "seed"> {
  const group = new Group();
  const height = 0.88 + rand() * 0.22; // adults and the occasional child
  group.scale.setScalar(height);

  const shirt = new Color(SHIRTS[Math.floor(rand() * SHIRTS.length)]);
  const trouser = new Color(TROUSERS[Math.floor(rand() * TROUSERS.length)]);
  const skin = new Color(SKINS[Math.floor(rand() * SKINS.length)]);

  const HEAD_R = 0.175;
  const HEAD_Y = 1.6;
  const SHOULDER_Y = 1.32;
  const HIP_Y = 0.9;

  // Head
  const head = new Mesh(new SphereGeometry(HEAD_R, 14, 10), new MeshBasicMaterial({ color: skin }));
  head.position.y = HEAD_Y;
  group.add(head);
  group.add(outlinedMesh(head, 24, 0.5));

  // Hat on roughly half of them
  if (rand() < 0.5) {
    const hatColor = new Color(HATS[Math.floor(rand() * HATS.length)]);
    const brimY = HEAD_Y + HEAD_R * 0.55;
    const brim = new Mesh(new CylinderGeometry(HEAD_R * 1.3, HEAD_R * 1.3, 0.02, 16), new MeshBasicMaterial({ color: hatColor }));
    brim.position.y = brimY;
    group.add(brim);
    const crown = new Mesh(new CylinderGeometry(HEAD_R * 0.72, HEAD_R * 0.95, 0.15, 12), new MeshBasicMaterial({ color: hatColor }));
    crown.position.y = brimY + 0.085;
    group.add(crown);
    group.add(outlinedMesh(crown, 24, 0.6));
  }

  // Torso
  const torso = new Mesh(new CapsuleGeometry(0.135, (SHOULDER_Y - HIP_Y) * 0.72, 3, 8), new MeshBasicMaterial({ color: shirt }));
  torso.position.y = (SHOULDER_Y + HIP_Y) / 2;
  torso.scale.set(1.05, 1, 0.62);
  group.add(torso);
  group.add(outlinedMesh(torso, 24, 0.6));

  // Shoulder bag on some
  if (rand() < 0.35) {
    const bag = new Mesh(new CapsuleGeometry(0.07, 0.1, 2, 6), new MeshBasicMaterial({ color: new Color("#6b5334") }));
    bag.position.set(0.16, HIP_Y + 0.18, 0.05);
    bag.scale.set(1, 1, 0.6);
    group.add(bag);
    const strap = new Mesh(new CylinderGeometry(0.012, 0.012, 0.34, 5), new MeshBasicMaterial({ color: INK }));
    strap.position.set(0.06, SHOULDER_Y - 0.12, 0.04);
    strap.rotation.z = 0.45;
    group.add(strap);
  }

  const armLen = 0.46, legLen = 0.5, limbR = 0.05;
  const leftArm = limb(armLen, limbR, shirt);
  leftArm.position.set(-0.15, SHOULDER_Y, 0);
  group.add(leftArm);
  const rightArm = limb(armLen, limbR, shirt);
  rightArm.position.set(0.15, SHOULDER_Y, 0);
  group.add(rightArm);

  const leftLeg = limb(legLen, limbR * 1.1, trouser);
  leftLeg.position.set(-0.075, HIP_Y, 0);
  group.add(leftLeg);
  const rightLeg = limb(legLen, limbR * 1.1, trouser);
  rightLeg.position.set(0.075, HIP_Y, 0);
  group.add(rightLeg);

  // Grounding shadow
  const shadow = new Mesh(
    new PlaneGeometry(0.85, 0.55),
    new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  return { group, leftArm, rightArm, leftLeg, rightLeg, walkPhase: 0 };
}

/**
 * Populate the park. Routes are loops of a few points, so each pedestrian
 * walks a believable circuit rather than teleporting or wandering randomly.
 */
export function createPedestrians(
  worldWidth: number,
  worldDepth: number,
  count: number,
  isFree: (x: number, z: number) => boolean
): Npc[] {
  const rand = seededRand(4242);
  const out: Npc[] = [];

  // Pedestrians walk straight lines between waypoints, so it isn't enough for
  // the waypoints themselves to be clear — the segment between them has to be
  // too, or they'd stroll straight through a tree.
  const segmentClear = (ax: number, az: number, bx: number, bz: number) => {
    const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  };

  for (let i = 0; i < count; i++) {
    // Build a route of 3-4 points that are reachable in straight lines,
    // including the closing leg back to the start.
    const route: [number, number][] = [];
    const want = 3 + Math.floor(rand() * 2);
    let guard = 0;
    while (route.length < want && guard < 200) {
      guard++;
      const x = 4 + rand() * (worldWidth - 8);
      const z = 4 + rand() * (worldDepth - 8);
      if (!isFree(x, z)) continue;
      const prev = route[route.length - 1];
      if (prev && !segmentClear(prev[0], prev[1], x, z)) continue;
      route.push([x, z]);
    }
    // Drop the last point if the loop back to the start would cut a corner
    // through something solid.
    while (route.length > 2 && !segmentClear(
      route[route.length - 1][0], route[route.length - 1][1], route[0][0], route[0][1]
    )) {
      route.pop();
    }
    if (route.length < 2) continue;

    const body = makePedestrian(rand);
    const [sx, sz] = route[0];
    body.group.position.set(sx, 0, sz);
    out.push({
      ...body,
      route,
      leg: 0,
      x: sx,
      z: sz,
      yaw: 0,
      speed: 0.9 + rand() * 0.7,
      restFor: rand() * 4,
      seed: rand() * 100,
    });
  }
  return out;
}

export function attachPedestrians(npcs: Npc[], parent: Group) {
  for (const n of npcs) parent.add(n.group);
}

export function updatePedestrians(npcs: Npc[], dt: number) {
  for (const n of npcs) {
    if (n.restFor > 0) {
      n.restFor -= dt;
      // Settle the legs while standing
      n.leftLeg.rotation.x *= 0.88;
      n.rightLeg.rotation.x *= 0.88;
      n.leftArm.rotation.x *= 0.88;
      n.rightArm.rotation.x *= 0.88;
      continue;
    }

    const target = n.route[n.leg];
    const dx = target[0] - n.x;
    const dz = target[1] - n.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.25) {
      // Arrived: pick the next leg and sometimes pause to take in the view
      n.leg = (n.leg + 1) % n.route.length;
      if (Math.random() < 0.45) n.restFor = 1.5 + Math.random() * 4;
      continue;
    }

    const step = n.speed * dt;
    n.x += (dx / dist) * step;
    n.z += (dz / dist) * step;

    // Turn toward travel, matching the player's yaw convention
    const targetYaw = Math.atan2(dx, dz) + Math.PI;
    let diff = ((targetYaw - n.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    n.yaw += diff * Math.min(1, dt * 6);

    n.walkPhase += n.speed * dt * 4.4;
    const swing = Math.sin(n.walkPhase);
    n.leftLeg.rotation.x = swing * 0.5;
    n.rightLeg.rotation.x = -swing * 0.5;
    n.leftArm.rotation.x = -swing * 0.34;
    n.rightArm.rotation.x = swing * 0.34;

    n.group.position.set(n.x, 0, n.z);
    n.group.rotation.y = n.yaw;
  }
}
