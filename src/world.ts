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

// Scattered small pebble dashes across the ground plane.
function makePebbles(rand: () => number, width: number): LineSegments {
  const positions: number[] = [];
  const n = Math.floor(width * 2.5);
  for (let i = 0; i < n; i++) {
    const x = rand() * width;
    const z = -6 + rand() * 12;
    const len = 0.06 + rand() * 0.12;
    const a = rand() * Math.PI * 2;
    positions.push(x - Math.cos(a) * len / 2, 0.006, z - Math.sin(a) * len / 2, x + Math.cos(a) * len / 2, 0.006, z + Math.sin(a) * len / 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.55 }));
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
  return new LineSegments(geo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.55 }));
}

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

// A colored watercolor billboard plane behind a hill's line silhouette so the
// hill reads as a colored mass instead of just an outline.
function makeHillWash(worldWidth: number, baseZ: number, height: number, tex: CanvasTexture, tint: Color): Mesh {
  const geo = new PlaneGeometry(worldWidth + 20, height * 1.6);
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
  mesh.position.set(worldWidth / 2, height * 0.4, baseZ + 0.1);
  mesh.renderOrder = -1;
  return mesh;
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

// Cloud splotches high in the "sky" — watercolor sprites drawn as billboards.
function makeClouds(rand: () => number, worldWidth: number): Group {
  const g = new Group();
  // baseAlpha = 0 → the canvas is transparent outside splotches, so the
  // plane's rectangular edges disappear and only the blob shape remains.
  const cloudTex = makeWatercolorTexture("#c8c9c4", 700, 256, 20, 6, 0, true);
  for (let i = 0; i < 10; i++) {
    const w = 6 + rand() * 5;
    const h = 2 + rand() * 1;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: cloudTex, color: new Color("#e0dcc9"), transparent: true, opacity: 0.6, depthWrite: false })
    );
    mesh.position.set(rand() * worldWidth, 8 + rand() * 3, -20 - rand() * 15);
    g.add(mesh);
  }
  return g;
}

export function buildWorld(worldWidth: number): { scene: Scene; worldRoot: Group } {
  const scene = new Scene();
  scene.background = PAPER;
  scene.fog = new Fog(PAPER.getHex(), 22, 62);

  const worldRoot = new Group();
  scene.add(worldRoot);

  // Ground: watercolor texture map so the ground reads as painted paper.
  const ground = new Mesh(
    new PlaneGeometry(worldWidth + 40, 80, 1, 1),
    new MeshBasicMaterial({ map: groundTex, color: new Color("#f4efe6") })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, 0, 0);
  worldRoot.add(ground);

  const rand = seededRand(42);

  worldRoot.add(makePerspectiveLines(worldWidth));
  worldRoot.add(makeGroundStrokes(rand, worldWidth));
  worldRoot.add(makePebbles(rand, worldWidth));
  worldRoot.add(makeHorizonMarks(rand, worldWidth));

  // Distant hills: soft watercolor washes behind ink silhouettes.
  worldRoot.add(makeHillWash(worldWidth, -30, 8, hillTex[2], new Color("#c3c4cd")));
  worldRoot.add(makeHillSilhouette(rand, worldWidth, -30, 8, new Color("#a89f8e")));
  worldRoot.add(makeHillWash(worldWidth, -22, 6, hillTex[1], new Color("#bfc2c5")));
  worldRoot.add(makeHillSilhouette(rand, worldWidth, -22, 6, new Color("#8f8779")));
  worldRoot.add(makeHillWash(worldWidth, -14, 4.5, hillTex[0], new Color("#b0b5c6")));
  worldRoot.add(makeHillSilhouette(rand, worldWidth, -14, 4.5, INK_SOFT));

  worldRoot.add(makeClouds(rand, worldWidth));

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

  for (let i = 0; i < 160; i++) {
    const x = rand() * worldWidth;
    const z = -6 + rand() * 10;
    worldRoot.add(makeGrassClump(rand, x, z));
  }

  const sun = outlinedMesh(new IcosahedronGeometry(0.6, 2), {
    fill: new Color("#f5e3b3"),
    edgeThreshold: 25,
  });
  sun.position.set(worldWidth / 2, 9, -35);
  worldRoot.add(sun);

  // Force reference to Vector3 to keep tree-shake happy across future edits
  void new Vector3();

  return { scene, worldRoot };
}
