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

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function outlinedMesh(geometry: BufferGeometry, fill: Color = PAPER, edgeThreshold = 35) {
  const g = new Group();
  const fillMat = new MeshBasicMaterial({ color: fill });
  const mesh = new Mesh(geometry, fillMat);
  mesh.renderOrder = 0;
  const edges = new EdgesGeometry(geometry, edgeThreshold);
  const lines = new LineSegments(edges, new LineBasicMaterial({ color: INK }));
  lines.renderOrder = 1;
  g.add(mesh);
  g.add(lines);
  return g;
}

function makeTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.6 + rand() * 1.2;
  const trunkR = 0.08 + rand() * 0.05;
  const trunk = outlinedMesh(new CylinderGeometry(trunkR, trunkR * 1.2, trunkH, 6), new Color("#e6dfd0"), 65);
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const crownR = 0.9 + rand() * 0.5;
  const crownFill = new Color(rand() < 0.5 ? "#e2dac6" : "#d8d0bc");
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 0), crownFill, 30);
  crown.position.y = trunkH + crownR * 0.7;
  crown.rotation.y = rand() * Math.PI;
  crown.scale.set(1, 1.15, 1);
  tree.add(crown);

  return tree;
}

function makeBush(rand: () => number): Group {
  const g = new Group();
  const r = 0.35 + rand() * 0.2;
  const bush = outlinedMesh(new IcosahedronGeometry(r, 0), new Color("#dcd3bf"), 30);
  bush.position.y = r * 0.7;
  bush.scale.set(1.1, 0.85, 1.1);
  g.add(bush);
  return g;
}

function makeGrassClump(rand: () => number, x: number, z: number): LineSegments {
  const positions: number[] = [];
  const blades = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < blades; i++) {
    const bx = (rand() - 0.5) * 0.25;
    const bz = (rand() - 0.5) * 0.25;
    const h = 0.12 + rand() * 0.15;
    positions.push(x + bx, 0, z + bz, x + bx + (rand() - 0.5) * 0.05, h, z + bz + (rand() - 0.5) * 0.05);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK }));
}

function makeGroundStrokes(rand: () => number, width: number): LineSegments {
  const positions: number[] = [];
  const strokes = Math.floor(width * 1.5);
  for (let i = 0; i < strokes; i++) {
    const x = rand() * width;
    const z = -3 + rand() * 8;
    const len = 0.2 + rand() * 0.5;
    positions.push(x, 0.005, z, x + len, 0.005, z + (rand() - 0.5) * 0.1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT }));
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
  scene.fog = new Fog(PAPER.getHex(), 18, 55);

  const worldRoot = new Group();
  scene.add(worldRoot);

  const ground = new Mesh(
    new PlaneGeometry(worldWidth + 40, 60),
    new MeshBasicMaterial({ color: PAPER })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, 0, 0);
  worldRoot.add(ground);

  const rand = seededRand(42);

  worldRoot.add(makeGroundStrokes(rand, worldWidth));

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

  for (let i = 0; i < 120; i++) {
    const x = rand() * worldWidth;
    const z = -6 + rand() * 9;
    worldRoot.add(makeGrassClump(rand, x, z));
  }

  const sun = outlinedMesh(new IcosahedronGeometry(0.6, 2), new Color("#efe7d3"));
  sun.position.set(worldWidth / 2, 9, -35);
  worldRoot.add(sun);

  return { scene, worldRoot };
}
