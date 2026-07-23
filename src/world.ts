import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from "three";

const PAPER = new Color("#f4efe6");
const INK = new Color("#2b2b2b");
const INK_SOFT = new Color("#6b6559");
const INK_MID = new Color("#4a463d");

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Draws EdgesGeometry outlines two or three times with slight random per-vertex
// jitter, so silhouettes read as hand-drawn rather than laser-cut.
function sketchyEdges(
  geometry: BufferGeometry,
  edgeThreshold: number,
  color: Color,
  passes = 2,
  jitter = 0.012
): Group {
  const g = new Group();
  const edges = new EdgesGeometry(geometry, edgeThreshold);
  const src = edges.attributes.position.array as Float32Array;
  for (let pass = 0; pass < passes; pass++) {
    const arr = new Float32Array(src.length);
    const j = jitter * (pass === 0 ? 1 : 1.6);
    for (let i = 0; i < src.length; i++) {
      arr[i] = src[i] + (Math.random() - 0.5) * j;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(arr, 3));
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: pass === 0 ? 0.9 : 0.45,
    });
    const ls = new LineSegments(geo, mat);
    ls.renderOrder = 2 + pass;
    g.add(ls);
  }
  return g;
}

function outlinedMesh(geometry: BufferGeometry, fill: Color = PAPER, edgeThreshold = 35, sketchPasses = 2) {
  const g = new Group();
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: fill }));
  mesh.renderOrder = 0;
  g.add(mesh);
  g.add(sketchyEdges(geometry, edgeThreshold, INK, sketchPasses));
  return g;
}

// Cross-hatch shading strokes on one face of a spherical shape, to imply volume.
function makeCrossHatch(radius: number, count: number, angle: number): LineSegments {
  const positions: number[] = [];
  const cx = Math.cos(angle) * radius * 0.35;
  const cy = -radius * 0.15;
  const cz = Math.sin(angle) * radius * 0.35;
  for (let i = 0; i < count; i++) {
    const t = (i / count - 0.5) * radius * 1.1;
    const len = radius * (0.35 + Math.random() * 0.2);
    const dx = Math.cos(angle + Math.PI / 2) * len;
    const dz = Math.sin(angle + Math.PI / 2) * len;
    positions.push(cx + t * 0.4 + dx * -0.5, cy + t, cz + dz * -0.5);
    positions.push(cx + t * 0.4 + dx * 0.5, cy + t, cz + dz * 0.5);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_MID, transparent: true, opacity: 0.4 }));
}

function makeTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.6 + rand() * 1.2;
  const trunkR = 0.08 + rand() * 0.05;
  const trunk = outlinedMesh(new CylinderGeometry(trunkR, trunkR * 1.2, trunkH, 6), new Color("#e6dfd0"), 65, 2);
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  // Bark lines on the trunk
  const barkPos: number[] = [];
  const bark = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < bark; i++) {
    const y0 = rand() * trunkH * 0.9;
    const y1 = y0 + 0.08 + rand() * 0.15;
    const ang = rand() * Math.PI * 2;
    const bx = Math.cos(ang) * trunkR * 0.9;
    const bz = Math.sin(ang) * trunkR * 0.9;
    barkPos.push(bx, y0, bz, bx + (rand() - 0.5) * 0.02, y1, bz + (rand() - 0.5) * 0.02);
  }
  const barkGeo = new BufferGeometry();
  barkGeo.setAttribute("position", new Float32BufferAttribute(barkPos, 3));
  tree.add(new LineSegments(barkGeo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.55 })));

  const crownR = 0.9 + rand() * 0.5;
  const crownFill = new Color(rand() < 0.5 ? "#e2dac6" : "#d8d0bc");
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 0), crownFill, 30, 3);
  crown.position.y = trunkH + crownR * 0.7;
  crown.rotation.y = rand() * Math.PI;
  crown.scale.set(1, 1.15, 1);

  // Cross-hatch shading on one side of the crown
  const hatch = makeCrossHatch(crownR, 6 + Math.floor(rand() * 4), rand() * Math.PI * 2);
  hatch.position.copy(crown.position);
  tree.add(crown);
  tree.add(hatch);

  return tree;
}

function makeBush(rand: () => number): Group {
  const g = new Group();
  const r = 0.35 + rand() * 0.2;
  const bush = outlinedMesh(new IcosahedronGeometry(r, 0), new Color("#dcd3bf"), 30, 2);
  bush.position.y = r * 0.7;
  bush.scale.set(1.1, 0.85, 1.1);
  g.add(bush);
  // A few short shading strokes beneath
  const shade: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * 0.9;
    shade.push(Math.cos(a) * rr, 0.01, Math.sin(a) * rr, Math.cos(a + 0.4) * rr, 0.01, Math.sin(a + 0.4) * rr);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(shade, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.4 })));
  return g;
}

function makeGrassClump(rand: () => number, x: number, z: number): LineSegments {
  const positions: number[] = [];
  const blades = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < blades; i++) {
    const bx = (rand() - 0.5) * 0.28;
    const bz = (rand() - 0.5) * 0.28;
    const h = 0.12 + rand() * 0.18;
    positions.push(x + bx, 0, z + bz, x + bx + (rand() - 0.5) * 0.06, h, z + bz + (rand() - 0.5) * 0.06);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK }));
}

function makeGroundStrokes(rand: () => number, width: number): LineSegments {
  const positions: number[] = [];
  const strokes = Math.floor(width * 2.2);
  for (let i = 0; i < strokes; i++) {
    const x = rand() * width;
    const z = -6 + rand() * 12;
    const len = 0.2 + rand() * 0.6;
    positions.push(x, 0.005, z, x + len, 0.005, z + (rand() - 0.5) * 0.12);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.75 }));
}

// Long, thin perspective lines converging toward the horizon give the scene an
// explicit vanishing point and sell the depth of the ground plane.
function makePerspectiveLines(worldWidth: number): LineSegments {
  const positions: number[] = [];
  const vanishZ = -50;
  const vanishY = 2.2;
  const nearZ = 8;
  const step = 2.5;
  for (let x = -20; x < worldWidth + 20; x += step) {
    positions.push(x, 0.01, nearZ, worldWidth / 2, vanishY, vanishZ);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.18 }));
}

// Faint horizon marks — like distant birds, dashes at the horizon line.
function makeHorizonMarks(rand: () => number, worldWidth: number): LineSegments {
  const positions: number[] = [];
  for (let i = 0; i < 24; i++) {
    const x = rand() * worldWidth;
    const y = 4 + rand() * 3;
    const z = -32 - rand() * 6;
    positions.push(
      x, y, z, x + 0.6, y + 0.15, z,
      x + 0.6, y + 0.15, z, x + 1.2, y, z
    );
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.5 }));
}

function makeHillSilhouette(rand: () => number, width: number, baseZ: number, height: number, color: Color): LineSegments {
  const positions: number[] = [];
  let prevY = height * 0.6;
  const step = 0.8;
  let prevX = -5;
  for (let x = -5; x <= width + 5; x += step) {
    const y = height * (0.5 + Math.sin(x * 0.15 + baseZ) * 0.3 + (rand() - 0.5) * 0.15);
    positions.push(prevX, prevY, baseZ, x, y, baseZ);
    prevX = x;
    prevY = y;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color }));
}

export function buildWorld(worldWidth: number): { scene: Scene; worldRoot: Group } {
  const scene = new Scene();
  scene.background = PAPER;
  scene.fog = new Fog(PAPER.getHex(), 20, 60);

  const worldRoot = new Group();
  scene.add(worldRoot);

  const ground = new Mesh(
    new PlaneGeometry(worldWidth + 40, 80),
    new MeshBasicMaterial({ color: PAPER })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, 0, 0);
  worldRoot.add(ground);

  const rand = seededRand(42);

  worldRoot.add(makePerspectiveLines(worldWidth));
  worldRoot.add(makeGroundStrokes(rand, worldWidth));
  worldRoot.add(makeHorizonMarks(rand, worldWidth));

  worldRoot.add(makeHillSilhouette(rand, worldWidth, -14, 4.5, INK_SOFT));
  worldRoot.add(makeHillSilhouette(rand, worldWidth, -22, 6, new Color("#8f8779")));
  worldRoot.add(makeHillSilhouette(rand, worldWidth, -30, 8, new Color("#a89f8e")));

  for (let i = 0; i < 45; i++) {
    const x = 3 + rand() * (worldWidth - 6);
    const z = -9 + rand() * 8;
    const tree = makeTree(rand);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.85 + rand() * 0.35);
    worldRoot.add(tree);
  }

  for (let i = 0; i < 30; i++) {
    const x = rand() * worldWidth;
    const z = -6 + rand() * 5;
    const bush = makeBush(rand);
    bush.position.set(x, 0, z);
    worldRoot.add(bush);
  }

  for (let i = 0; i < 140; i++) {
    const x = rand() * worldWidth;
    const z = -6 + rand() * 10;
    worldRoot.add(makeGrassClump(rand, x, z));
  }

  const sun = outlinedMesh(new IcosahedronGeometry(0.6, 2), new Color("#efe7d3"), 25, 2);
  sun.position.set(worldWidth / 2, 9, -35);
  worldRoot.add(sun);

  return { scene, worldRoot };
}
