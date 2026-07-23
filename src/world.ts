import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
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
  Vector3,
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

// Paints a splotchy watercolor wash into a canvas — many soft radial blobs of
// the same tint at varying opacity, plus a few lighter "bleed" spots. Meant to
// be used as a color map on a MeshBasicMaterial to give shapes uneven color.
function makeWatercolorTexture(
  hex: string,
  seed: number,
  size = 256,
  splotches = 22,
  bleed = 10,
  baseAlpha = 0.35,
  edgeFade = false
): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seededRand(seed);

  // Base wash — very light tint (or none, so the texture fades to transparent
  // at areas without splotches — useful for standalone billboards like clouds).
  if (baseAlpha > 0) {
    ctx.fillStyle = withAlpha(hex, baseAlpha);
    ctx.fillRect(0, 0, size, size);
  }

  // Darker splotches
  for (let i = 0; i < splotches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 90;
    const a = 0.15 + rand() * 0.35;
    const grad = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    grad.addColorStop(0, withAlpha(hex, a));
    grad.addColorStop(0.7, withAlpha(hex, a * 0.4));
    grad.addColorStop(1, withAlpha(hex, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    // Wobbly blob outline rather than a perfect circle
    const points = 10;
    for (let p = 0; p <= points; p++) {
      const t = (p / points) * Math.PI * 2;
      const rr = r * (0.75 + rand() * 0.35);
      const px = x + Math.cos(t) * rr;
      const py = y + Math.sin(t) * rr * 0.85;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Lighter "bleed" pull-backs
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < bleed; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 60;
    const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${0.3 + rand() * 0.3})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = "source-over";

  // Mask everything to a soft circle so the canvas's rectangular edges
  // disappear — used for standalone billboards like clouds.
  if (edgeFade) {
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.75, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";
  }

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
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

interface OutlineOptions {
  fill?: Color;
  map?: CanvasTexture;
  edgeThreshold?: number;
  sketchPasses?: number;
}

function outlinedMesh(geometry: BufferGeometry, opts: OutlineOptions = {}) {
  const g = new Group();
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: opts.fill ?? PAPER,
      map: opts.map,
    })
  );
  mesh.renderOrder = 0;
  g.add(mesh);
  g.add(sketchyEdges(geometry, opts.edgeThreshold ?? 35, INK, opts.sketchPasses ?? 2));
  return g;
}

// Short cross-hatch strokes on the shaded side of a spherical shape.
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

// Scribbly foliage marks — many tiny dashes clustered around the crown radius.
// Not individual leaves; just implied leaf texture.
function makeFoliageScribbles(rand: () => number, radius: number, count: number, color: Color): LineSegments {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = (rand() - 0.5) * Math.PI;
    const rr = radius * (0.85 + rand() * 0.2);
    const x = Math.cos(theta) * Math.cos(phi) * rr;
    const y = Math.sin(phi) * rr * 0.9;
    const z = Math.sin(theta) * Math.cos(phi) * rr;
    const len = 0.05 + rand() * 0.05;
    const dx = (rand() - 0.5) * len;
    const dy = (rand() - 0.5) * len * 0.4;
    const dz = (rand() - 0.5) * len;
    positions.push(x, y, z, x + dx, y + dy, z + dz);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
}

// Bark texture: short vertical dashes wrapped around the trunk.
function makeBarkStrokes(rand: () => number, radius: number, height: number, count: number): LineSegments {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const y0 = rand() * height * 0.9;
    const y1 = y0 + 0.08 + rand() * 0.2;
    const bx = Math.cos(a) * radius * 0.95;
    const bz = Math.sin(a) * radius * 0.95;
    positions.push(bx, y0, bz, bx + (rand() - 0.5) * 0.02, y1, bz + (rand() - 0.5) * 0.02);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: new Color("#5b4a34"), transparent: true, opacity: 0.6 }));
}

// A shared pool of watercolor textures so we don't allocate one per mesh.
const CROWN_HEXES = ["#7f9b62", "#8ea86e", "#6f8a55", "#9cae76"];
const BUSH_HEXES = ["#6b8352", "#7c9560"];
const TRUNK_HEX = "#8a6e4c";
const HILL_HEXES = ["#a8b0c2", "#c0bfba", "#b8b8c8"];
const GROUND_HEX = "#c9b98e";

const crownTex = CROWN_HEXES.map((h, i) => makeWatercolorTexture(h, 100 + i));
const bushTex = BUSH_HEXES.map((h, i) => makeWatercolorTexture(h, 200 + i));
const trunkTex = makeWatercolorTexture(TRUNK_HEX, 300, 128, 12, 4);
const hillTex = HILL_HEXES.map((h, i) => makeWatercolorTexture(h, 400 + i, 512, 30, 12));
const groundTex = makeWatercolorTexture(GROUND_HEX, 500, 1024, 60, 60, 0.12);

function makeTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.6 + rand() * 1.2;
  const trunkR = 0.08 + rand() * 0.05;
  const trunk = outlinedMesh(new CylinderGeometry(trunkR, trunkR * 1.2, trunkH, 6), {
    map: trunkTex,
    fill: new Color("#c6a983"),
    edgeThreshold: 65,
  });
  trunk.position.y = trunkH / 2;
  tree.add(trunk);
  const bark = makeBarkStrokes(rand, trunkR, trunkH, 6 + Math.floor(rand() * 4));
  bark.position.y = 0;
  tree.add(bark);

  const crownR = 0.9 + rand() * 0.5;
  const crownIdx = Math.floor(rand() * crownTex.length);
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 0), {
    map: crownTex[crownIdx],
    fill: new Color(CROWN_HEXES[crownIdx]).multiplyScalar(1.55),
    edgeThreshold: 30,
    sketchPasses: 3,
  });
  crown.position.y = trunkH + crownR * 0.7;
  crown.rotation.y = rand() * Math.PI;
  crown.scale.set(1, 1.15, 1);
  tree.add(crown);

  const scribbles = makeFoliageScribbles(rand, crownR * 1.05, 60 + Math.floor(rand() * 30), new Color("#3f5232"));
  scribbles.position.copy(crown.position);
  scribbles.scale.copy(crown.scale);
  scribbles.rotation.copy(crown.rotation);
  tree.add(scribbles);

  const hatch = makeCrossHatch(crownR, 5 + Math.floor(rand() * 3), rand() * Math.PI * 2);
  hatch.position.copy(crown.position);
  tree.add(hatch);

  return tree;
}

function makeBush(rand: () => number): Group {
  const g = new Group();
  const r = 0.35 + rand() * 0.2;
  const idx = Math.floor(rand() * bushTex.length);
  const bush = outlinedMesh(new IcosahedronGeometry(r, 0), {
    map: bushTex[idx],
    fill: new Color(BUSH_HEXES[idx]).multiplyScalar(1.5),
    edgeThreshold: 30,
  });
  bush.position.y = r * 0.7;
  bush.scale.set(1.1, 0.85, 1.1);
  g.add(bush);

  const scribbles = makeFoliageScribbles(rand, r * 1.05, 25, new Color("#334027"));
  scribbles.position.copy(bush.position);
  scribbles.scale.copy(bush.scale);
  g.add(scribbles);

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
  const blades = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < blades; i++) {
    const bx = (rand() - 0.5) * 0.28;
    const bz = (rand() - 0.5) * 0.28;
    const h = 0.12 + rand() * 0.18;
    positions.push(x + bx, 0, z + bz, x + bx + (rand() - 0.5) * 0.06, h, z + bz + (rand() - 0.5) * 0.06);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: new Color("#3f5232"), transparent: true, opacity: 0.85 }));
}

function makePebbles(rand: () => number, width: number, depth: number): LineSegments {
  const positions: number[] = [];
  const n = Math.floor(width * depth * 0.15);
  for (let i = 0; i < n; i++) {
    const x = rand() * width;
    const z = rand() * depth;
    const len = 0.06 + rand() * 0.12;
    const a = rand() * Math.PI * 2;
    positions.push(x - Math.cos(a) * len / 2, 0.006, z - Math.sin(a) * len / 2, x + Math.cos(a) * len / 2, 0.006, z + Math.sin(a) * len / 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.55 }));
}

function makeGroundStrokes(rand: () => number, width: number, depth: number): LineSegments {
  const positions: number[] = [];
  const strokes = Math.floor(width * depth * 0.12);
  for (let i = 0; i < strokes; i++) {
    const x = rand() * width;
    const z = rand() * depth;
    const len = 0.2 + rand() * 0.6;
    const a = rand() * Math.PI * 2;
    positions.push(x, 0.005, z, x + Math.cos(a) * len, 0.005, z + Math.sin(a) * len * 0.4);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.55 }));
}

function makeHorizonMarks(rand: () => number, worldWidth: number, hillZ: number): LineSegments {
  const positions: number[] = [];
  for (let i = 0; i < 24; i++) {
    const x = rand() * worldWidth;
    const y = 4 + rand() * 3;
    const z = hillZ - 2 - rand() * 6;
    positions.push(
      x, y, z, x + 0.6, y + 0.15, z,
      x + 0.6, y + 0.15, z, x + 1.2, y, z
    );
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.5 }));
}

// Distant hills as billboard rings around the walkable area — they always
// appear on the horizon regardless of which way the player looks.
function makeHillRing(worldWidth: number, worldDepth: number, radiusOut: number, height: number, tex: CanvasTexture, tint: Color): Mesh {
  const perimeter = 2 * (worldWidth + worldDepth) + 4 * radiusOut;
  const geo = new PlaneGeometry(perimeter, height * 1.6);
  const mat = new MeshBasicMaterial({
    map: tex,
    color: tint,
    transparent: true,
    opacity: 0.75,
    side: DoubleSide,
    depthWrite: false,
    fog: true,
  });
  const mesh = new Mesh(geo, mat);
  // We can't wrap a plane into a ring simply, so put four separate hills
  // — the caller adds four of these via makeHillWashesAround.
  return mesh;
}

function makeHillWashesAround(worldWidth: number, worldDepth: number, offset: number, height: number, tex: CanvasTexture, tint: Color): Group {
  const g = new Group();
  const halfSpan = Math.max(worldWidth, worldDepth) + offset * 2;
  const specs = [
    { pos: [worldWidth / 2, height * 0.4, -offset] as [number, number, number], rot: 0 },
    { pos: [worldWidth / 2, height * 0.4, worldDepth + offset] as [number, number, number], rot: Math.PI },
    { pos: [-offset, height * 0.4, worldDepth / 2] as [number, number, number], rot: Math.PI / 2 },
    { pos: [worldWidth + offset, height * 0.4, worldDepth / 2] as [number, number, number], rot: -Math.PI / 2 },
  ];
  for (const s of specs) {
    const geo = new PlaneGeometry(halfSpan, height * 1.6);
    const mat = new MeshBasicMaterial({
      map: tex, color: tint,
      transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false, fog: true,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(...s.pos);
    mesh.rotation.y = s.rot;
    mesh.renderOrder = -1;
    g.add(mesh);
  }
  return g;
}

function makeHillSilhouetteAround(rand: () => number, worldWidth: number, worldDepth: number, offset: number, height: number, color: Color): Group {
  const g = new Group();
  const specs: { start: [number, number]; end: [number, number]; z: number; forward: number }[] = [
    { start: [-offset, -offset], end: [worldWidth + offset, -offset], z: -offset, forward: 0 },
    { start: [worldWidth + offset, -offset], end: [worldWidth + offset, worldDepth + offset], z: 0, forward: 0 },
    { start: [worldWidth + offset, worldDepth + offset], end: [-offset, worldDepth + offset], z: worldDepth + offset, forward: 0 },
    { start: [-offset, worldDepth + offset], end: [-offset, -offset], z: 0, forward: 0 },
  ];
  for (const s of specs) {
    const positions: number[] = [];
    const dx = s.end[0] - s.start[0];
    const dz = s.end[1] - s.start[1];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(6, Math.floor(len / 0.8));
    let prev: [number, number] | null = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = s.start[0] + dx * t;
      const z = s.start[1] + dz * t;
      const y = height * (0.5 + Math.sin(t * 6 + s.start[0]) * 0.3 + (rand() - 0.5) * 0.15);
      if (prev) positions.push(prev[0], prev[1], z, x, y, z);
      prev = [x, y];
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.add(new LineSegments(geo, new LineBasicMaterial({ color })));
  }
  return g;
}

function makeClouds(rand: () => number, worldWidth: number, worldDepth: number): Group {
  const g = new Group();
  const cloudTex = makeWatercolorTexture("#c8c9c4", 700, 256, 20, 6, 0, true);
  for (let i = 0; i < 14; i++) {
    const w = 6 + rand() * 5;
    const h = 2 + rand() * 1;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: cloudTex, color: new Color("#e0dcc9"), transparent: true, opacity: 0.6, depthWrite: false })
    );
    // Place clouds around and above the play area
    const angle = rand() * Math.PI * 2;
    const radius = Math.max(worldWidth, worldDepth) * 0.6;
    mesh.position.set(worldWidth / 2 + Math.cos(angle) * radius, 8 + rand() * 3, worldDepth / 2 + Math.sin(angle) * radius);
    g.add(mesh);
  }
  return g;
}

export function buildWorld(worldWidth: number, worldDepth: number): { scene: Scene; worldRoot: Group } {
  const scene = new Scene();
  scene.background = PAPER;
  scene.fog = new Fog(PAPER.getHex(), Math.max(worldWidth, worldDepth) * 0.6, Math.max(worldWidth, worldDepth) * 1.4);

  const worldRoot = new Group();
  scene.add(worldRoot);

  const ground = new Mesh(
    new PlaneGeometry(worldWidth + 60, worldDepth + 60, 1, 1),
    new MeshBasicMaterial({ map: groundTex, color: new Color("#f4efe6") })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, 0, worldDepth / 2);
  worldRoot.add(ground);

  const rand = seededRand(42);

  worldRoot.add(makeGroundStrokes(rand, worldWidth, worldDepth));
  worldRoot.add(makePebbles(rand, worldWidth, worldDepth));

  // Hills form a ring around the walkable area on all four sides.
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, 30, 8, hillTex[2], new Color("#c3c4cd")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, 30, 8, new Color("#a89f8e")));
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, 22, 6, hillTex[1], new Color("#bfc2c5")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, 22, 6, new Color("#8f8779")));
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, 14, 4.5, hillTex[0], new Color("#b0b5c6")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, 14, 4.5, INK_SOFT));

  worldRoot.add(makeHorizonMarks(rand, worldWidth, -14));
  worldRoot.add(makeClouds(rand, worldWidth, worldDepth));

  const clearRadius = 3; // don't spawn things right on the player's start
  const cx = worldWidth / 2;
  const cz = worldDepth / 2;

  for (let i = 0; i < 90; i++) {
    let x = 2 + rand() * (worldWidth - 4);
    let z = 2 + rand() * (worldDepth - 4);
    if (Math.hypot(x - cx, z - cz) < clearRadius) continue;
    const tree = makeTree(rand);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.85 + rand() * 0.35);
    worldRoot.add(tree);
  }

  for (let i = 0; i < 60; i++) {
    const x = rand() * worldWidth;
    const z = rand() * worldDepth;
    if (Math.hypot(x - cx, z - cz) < clearRadius) continue;
    const bush = makeBush(rand);
    bush.position.set(x, 0, z);
    worldRoot.add(bush);
  }

  for (let i = 0; i < 340; i++) {
    const x = rand() * worldWidth;
    const z = rand() * worldDepth;
    worldRoot.add(makeGrassClump(rand, x, z));
  }

  const sun = outlinedMesh(new IcosahedronGeometry(0.6, 2), {
    fill: new Color("#f5e3b3"),
    edgeThreshold: 25,
  });
  sun.position.set(worldWidth / 2, 10, -35);
  worldRoot.add(sun);

  void new Vector3();
  void makeHillRing;

  return { scene, worldRoot };
}
