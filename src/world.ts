import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  Vector3,
} from "three";

const PAPER = new Color("#f4efe6");
const INK = new Color("#1e1e1e");
const INK_SOFT = new Color("#6b6559");
const INK_MID = new Color("#4a463d");

// A three-band gradient ramp — anything using MeshToonMaterial with this map
// gets stepped cel-style shading: shadow, mid, highlight.
function makeToonRamp(): DataTexture {
  const data = new Uint8Array([
    150, 150, 150, 255,
    210, 210, 210, 255,
    255, 255, 255, 255,
  ]);
  const tex = new DataTexture(data, 3, 1, RGBAFormat);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const toonRamp = makeToonRamp();

// Ground is flat. Kept sampleGroundHeight around for compatibility with
// callers that place objects at "ground height" — it just always returns 0.
export function setTerrainFlatten(_centers: { x: number; z: number; radius: number }[]) {
  void _centers;
}
export function sampleGroundHeight(_x: number, _z: number): number {
  void _x; void _z;
  return 0;
}

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

/**
 * Paints the whole park floor into a single texture mapped 1:1 onto the ground
 * plane.
 *
 * The alternative — scattering hundreds of translucent patch quads — needs
 * roughly one blob per 25 square units to stop the gaps between them reading
 * as bare sand, which at 120x90 is over a thousand extra draw calls on a
 * phone. Painting the same washes into one canvas costs nothing at runtime and
 * lets the regions blend into each other instead of tiling.
 */
interface GroundZone {
  x: number; z: number; r: number;
  hex: string;
  /** Blobs per 100 square units of the zone. */
  density: number;
  alpha: number;
}

function makeParkGroundTexture(
  worldWidth: number, worldDepth: number, margin: number,
  zones: GroundZone[], pond: { x: number; z: number; radius: number }, seed: number
): CanvasTexture {
  const spanX = worldWidth + margin * 2;
  const spanZ = worldDepth + margin * 2;
  const W = 2048;
  const H = Math.max(256, Math.round((W * spanZ) / spanX));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rand = seededRand(seed);
  const sx = W / spanX;
  const sz = H / spanZ;
  const toX = (x: number) => (x + margin) * sx;
  const toZ = (z: number) => (z + margin) * sz;

  // Soft-edged wobbly blob — the same shape language as the watercolor washes
  // used on the models, so the ground belongs to the same drawing.
  const blob = (px: number, py: number, r: number, hex: string, a: number) => {
    const grad = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
    grad.addColorStop(0, withAlpha(hex, a));
    grad.addColorStop(0.6, withAlpha(hex, a * 0.55));
    grad.addColorStop(1, withAlpha(hex, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let p = 0; p <= 12; p++) {
      const t = (p / 12) * Math.PI * 2;
      const rr = r * (0.7 + rand() * 0.45);
      const bx = px + Math.cos(t) * rr;
      const by = py + Math.sin(t) * rr * 0.88;
      if (p === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
  };

  // Start from opaque turf rather than paper. Layering hundreds of translucent
  // green blobs over cream converges to a single flat green with no variation
  // left in it; starting solid and then breaking it up both ways — darker
  // shade, lighter bleach — is what gives the floor its mottle.
  ctx.fillStyle = "#9dbb6e";
  ctx.fillRect(0, 0, W, H);

  const scatter = (n: number, rMin: number, rSpan: number, hex: string, aMin: number, aSpan: number) => {
    for (let i = 0; i < n; i++) {
      const wx = -margin + rand() * spanX;
      const wz = -margin + rand() * spanZ;
      blob(toX(wx), toZ(wz), (rMin + rand() * rSpan) * sx, hex, aMin + rand() * aSpan);
    }
  };
  const cells = (spanX * spanZ) / 100;
  // Deep shade and sun-bleached patches, worked at three scales. The small
  // ones matter most: standing still, the camera sees maybe fifteen world
  // units across, and without high-frequency variation the floor under your
  // feet is one flat colour no matter how good the broad washes are.
  scatter(Math.round(cells * 1.1), 4, 7, "#728f4c", 0.32, 0.26);
  scatter(Math.round(cells * 0.8), 3.5, 6, "#cbd8a4", 0.2, 0.18);
  scatter(Math.round(cells * 1.6), 1.2, 2.6, "#82a75a", 0.26, 0.26);
  scatter(Math.round(cells * 0.8), 1.0, 2.2, "#dfe2be", 0.18, 0.18);
  scatter(Math.round(cells * 2.6), 0.45, 1.1, "#6e8c48", 0.22, 0.24);
  scatter(Math.round(cells * 1.6), 0.4, 0.9, "#c2d69a", 0.16, 0.2);

  // Region character on top. Blobs are sampled sqrt-distributed so a zone
  // fills evenly rather than clumping at its centre.
  for (const zone of zones) {
    const n = Math.round((Math.PI * zone.r * zone.r * zone.density) / 100);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * zone.r;
      const r = (2.2 + rand() * 4.4) * sx;
      blob(toX(zone.x + Math.cos(a) * d), toZ(zone.z + Math.sin(a) * d), r, zone.hex,
           zone.alpha * (0.6 + rand() * 0.6));
    }
  }

  // Bare earth scuffs, and a sandy shore hugging the water.
  scatter(Math.round(cells * 0.55), 1.4, 2.6, "#b39a6c", 0.2 , 0.2);
  scatter(Math.round(cells * 0.2), 2.0, 4.0, "#8a7a52", 0.12, 0.12);
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2;
    const d = pond.radius + 0.2 + rand() * 3.4;
    blob(toX(pond.x + Math.cos(a) * d), toZ(pond.z + Math.sin(a) * d),
         (1.3 + rand() * 1.7) * sx, "#d8c79c", 0.3 + rand() * 0.24);
  }

  // Beyond the play space the ground fades toward the paper the hills are
  // drawn on, so the map has no hard green rectangle at its border.
  const edge = ctx.createLinearGradient(0, 0, 0, H);
  const fz = (margin * 0.55) / spanZ;
  edge.addColorStop(0, "rgba(240,236,223,0.85)");
  edge.addColorStop(fz, "rgba(240,236,223,0)");
  edge.addColorStop(1 - fz, "rgba(240,236,223,0)");
  edge.addColorStop(1, "rgba(240,236,223,0.85)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  const edgeX = ctx.createLinearGradient(0, 0, W, 0);
  const fx = (margin * 0.55) / spanX;
  edgeX.addColorStop(0, "rgba(240,236,223,0.85)");
  edgeX.addColorStop(fx, "rgba(240,236,223,0)");
  edgeX.addColorStop(1 - fx, "rgba(240,236,223,0)");
  edgeX.addColorStop(1, "rgba(240,236,223,0.85)");
  ctx.fillStyle = edgeX;
  ctx.fillRect(0, 0, W, H);

  const tex = new CanvasTexture(c);
  // The canvas holds sRGB values. Left unflagged, three treats them as linear
  // and the output transform brightens everything on the way to the screen —
  // which is what turned a painted park floor into flat pale mint no matter
  // how much contrast went into the canvas.
  tex.colorSpace = SRGBColorSpace;
  // The ground plane is seen at a very shallow angle, so without this the
  // sampler picks a heavily reduced mip and averages away every blob smaller
  // than a few metres before it reaches the screen.
  tex.anisotropy = 16;
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
  passes = 3,
  jitter = 0.018
): Group {
  const g = new Group();
  const edges = new EdgesGeometry(geometry, edgeThreshold);
  const src = edges.attributes.position.array as Float32Array;
  for (let pass = 0; pass < passes; pass++) {
    const arr = new Float32Array(src.length);
    const j = jitter * (pass === 0 ? 0.4 : 1 + pass * 0.4);
    for (let i = 0; i < src.length; i++) {
      arr[i] = src[i] + (Math.random() - 0.5) * j;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(arr, 3));
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: pass === 0 ? 1.0 : pass === 1 ? 0.55 : 0.3,
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
  toon?: boolean; // use MeshToonMaterial so this mesh gets stepped shading from lights
}

function outlinedMesh(geometry: BufferGeometry, opts: OutlineOptions = {}) {
  const g = new Group();
  const mat: Material = opts.toon
    ? new MeshToonMaterial({ color: opts.fill ?? PAPER, map: opts.map, gradientMap: toonRamp })
    : new MeshBasicMaterial({ color: opts.fill ?? PAPER, map: opts.map });
  const mesh = new Mesh(geometry, mat);
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

const crownTex = CROWN_HEXES.map((h, i) => makeWatercolorTexture(h, 100 + i));
const bushTex = BUSH_HEXES.map((h, i) => makeWatercolorTexture(h, 200 + i));
const trunkTex = makeWatercolorTexture(TRUNK_HEX, 300, 128, 12, 4);
const hillTex = HILL_HEXES.map((h, i) => makeWatercolorTexture(h, 400 + i, 512, 30, 12));

// Deciduous tree — tapered trunk, layered crown, occasional branch line to
// the outer canopy. Two crown lobes make it read more organic than a single
// icosahedron.
function makeDeciduousTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.8 + rand() * 1.2;
  const trunkR = 0.09 + rand() * 0.04;
  const trunk = outlinedMesh(
    new CylinderGeometry(trunkR * 0.7, trunkR * 1.3, trunkH, 7),
    { map: trunkTex, fill: new Color("#a07f5a"), edgeThreshold: 60, toon: true }
  );
  trunk.position.y = trunkH / 2;
  tree.add(trunk);
  tree.add(makeBarkStrokes(rand, trunkR, trunkH, 10 + Math.floor(rand() * 6)));
  if (rand() < 0.55) tree.add(makeTreeKnots(rand, trunkR, trunkH, 1 + Math.floor(rand() * 2)));

  // Main crown
  const crownR = 0.95 + rand() * 0.55;
  const crownIdx = Math.floor(rand() * crownTex.length);
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 1), {
    map: crownTex[crownIdx],
    fill: new Color(CROWN_HEXES[crownIdx]).multiplyScalar(1.4),
    edgeThreshold: 45,
    sketchPasses: 2,
    toon: true,
  });
  crown.position.y = trunkH + crownR * 0.55;
  crown.rotation.y = rand() * Math.PI;
  crown.scale.set(1.05, 1.2, 1.05);
  tree.add(crown);

  // Secondary smaller lobe offset to one side for organic silhouette
  if (rand() < 0.6) {
    const lobeR = crownR * (0.55 + rand() * 0.25);
    const lobeIdx = (crownIdx + 1) % crownTex.length;
    const lobe = outlinedMesh(new IcosahedronGeometry(lobeR, 1), {
      map: crownTex[lobeIdx],
      fill: new Color(CROWN_HEXES[lobeIdx]).multiplyScalar(1.3),
      edgeThreshold: 45,
      sketchPasses: 2,
      toon: true,
    });
    const ang = rand() * Math.PI * 2;
    lobe.position.set(Math.cos(ang) * crownR * 0.6, trunkH + crownR * 0.9, Math.sin(ang) * crownR * 0.6);
    tree.add(lobe);
  }

  // A visible branch from trunk to crown
  const branchPos: number[] = [];
  const branchAngle = rand() * Math.PI * 2;
  const branchStartY = trunkH * (0.55 + rand() * 0.25);
  branchPos.push(
    Math.cos(branchAngle) * trunkR * 0.5, branchStartY, Math.sin(branchAngle) * trunkR * 0.5,
    Math.cos(branchAngle) * crownR * 0.7, trunkH + crownR * 0.2, Math.sin(branchAngle) * crownR * 0.7
  );
  const branchGeo = new BufferGeometry();
  branchGeo.setAttribute("position", new Float32BufferAttribute(branchPos, 3));
  tree.add(new LineSegments(branchGeo, new LineBasicMaterial({ color: new Color("#5b4a34") })));

  const scribbles = makeFoliageScribbles(rand, crownR * 1.05, 80 + Math.floor(rand() * 40), new Color("#2f4022"));
  scribbles.position.copy(crown.position);
  scribbles.scale.copy(crown.scale);
  scribbles.rotation.copy(crown.rotation);
  tree.add(scribbles);

  const hatch = makeCrossHatch(crownR, 6 + Math.floor(rand() * 4), rand() * Math.PI * 2);
  hatch.position.copy(crown.position);
  tree.add(hatch);

  return tree;
}

// Conifer — tall tapered cone with a slim trunk peeking out at the base.
function makeConiferTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 0.5 + rand() * 0.3;
  const trunkR = 0.08;
  const trunk = outlinedMesh(new CylinderGeometry(trunkR * 0.9, trunkR * 1.2, trunkH, 6), {
    map: trunkTex, fill: new Color("#8a6a48"), edgeThreshold: 60, toon: true,
  });
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const coneH = 2.6 + rand() * 1.4;
  const coneR = 0.75 + rand() * 0.35;
  const cone = outlinedMesh(new ConeGeometry(coneR, coneH, 8, 3), {
    map: crownTex[2],
    fill: new Color("#5f7d4a"),
    edgeThreshold: 40,
    sketchPasses: 2,
    toon: true,
  });
  cone.position.y = trunkH + coneH / 2;
  tree.add(cone);

  const scribbles = makeFoliageScribbles(rand, coneR * 0.9, 40, new Color("#334a24"));
  scribbles.position.copy(cone.position);
  scribbles.scale.set(1, coneH / (coneR * 2), 1);
  tree.add(scribbles);

  return tree;
}

// --- Region-specific trees ---
// Each region gets a silhouette you can read from across the park. Planting
// density alone wasn't enough: five patches of the same tree at five
// densities still looks like one wood with thin bits.

/** Birch: pale slender trunk with dark bark dashes, crown carried high. */
function makeBirchTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 2.3 + rand() * 1.0;
  const trunkR = 0.06 + rand() * 0.02;
  const trunk = outlinedMesh(
    new CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6),
    { fill: new Color("#ddd7c4"), edgeThreshold: 60, toon: true }
  );
  trunk.position.y = trunkH / 2;
  // A slight lean, which is most of what makes a stand of birch read as birch
  trunk.rotation.z = (rand() - 0.5) * 0.1;
  tree.add(trunk);

  // Bark dashes — short horizontal ticks, denser toward the base
  const dashes: number[] = [];
  for (let i = 0; i < 16; i++) {
    const t = rand() ** 1.5;
    const y = 0.15 + t * trunkH * 0.85;
    const a = rand() * Math.PI * 2;
    const w = trunkR * (0.5 + rand() * 0.9);
    dashes.push(
      Math.cos(a) * trunkR * 1.02 - Math.sin(a) * w, y, Math.sin(a) * trunkR * 1.02 + Math.cos(a) * w,
      Math.cos(a) * trunkR * 1.02 + Math.sin(a) * w, y, Math.sin(a) * trunkR * 1.02 - Math.cos(a) * w
    );
  }
  const dashGeo = new BufferGeometry();
  dashGeo.setAttribute("position", new Float32BufferAttribute(dashes, 3));
  tree.add(new LineSegments(dashGeo, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 })));

  const crownR = 1.0 + rand() * 0.4;
  for (let i = 0; i < 2; i++) {
    const r = crownR * (i === 0 ? 1 : 0.62);
    const idx = Math.floor(rand() * crownTex.length);
    const lobe = outlinedMesh(new IcosahedronGeometry(r, 1), {
      map: crownTex[idx],
      fill: new Color("#a8bf7c"),
      edgeThreshold: 45, sketchPasses: 2, toon: true,
    });
    const a = rand() * Math.PI * 2;
    lobe.position.set(Math.cos(a) * crownR * 0.4 * i, trunkH + r * 0.3 + i * 0.3, Math.sin(a) * crownR * 0.4 * i);
    lobe.scale.set(1.1, 0.85, 1.1);
    tree.add(lobe);
  }
  return tree;
}

/** Dead snag: no crown at all, just a broken trunk and bare forks. */
function makeSnagTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.4 + rand() * 1.3;
  const trunkR = 0.1 + rand() * 0.05;
  const trunk = outlinedMesh(
    new CylinderGeometry(trunkR * 0.45, trunkR * 1.2, trunkH, 6),
    { map: trunkTex, fill: new Color("#9a9080"), edgeThreshold: 55, toon: true }
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.22;
  tree.add(trunk);

  // Bare forks: each branch is a two-segment kink so it doesn't read as a spike
  const limbs: number[] = [];
  const count = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.7;
    const y0 = trunkH * (0.5 + rand() * 0.45);
    const l1 = 0.35 + rand() * 0.4;
    const l2 = 0.25 + rand() * 0.35;
    const x1 = Math.cos(a) * l1, z1 = Math.sin(a) * l1, y1 = y0 + l1 * (0.5 + rand() * 0.5);
    const x2 = x1 + Math.cos(a + (rand() - 0.5)) * l2;
    const z2 = z1 + Math.sin(a + (rand() - 0.5)) * l2;
    const y2 = y1 + l2 * (0.3 + rand() * 0.7);
    limbs.push(0, y0, 0, x1, y1, z1, x1, y1, z1, x2, y2, z2);
  }
  const limbGeo = new BufferGeometry();
  limbGeo.setAttribute("position", new Float32BufferAttribute(limbs, 3));
  tree.add(new LineSegments(limbGeo, new LineBasicMaterial({ color: new Color("#6b6355") })));
  return tree;
}

/** Willow: short trunk, broad low crown, curtains of hanging strands. */
function makeWillowTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.1 + rand() * 0.5;
  const trunkR = 0.16 + rand() * 0.06;
  const trunk = outlinedMesh(
    new CylinderGeometry(trunkR * 0.8, trunkR * 1.4, trunkH, 7),
    { map: trunkTex, fill: new Color("#94795a"), edgeThreshold: 60, toon: true }
  );
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const crownR = 1.3 + rand() * 0.5;
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 1), {
    map: crownTex[3],
    fill: new Color("#9fb877"),
    edgeThreshold: 45, sketchPasses: 2, toon: true,
  });
  crown.position.y = trunkH + crownR * 0.35;
  crown.scale.set(1.25, 0.6, 1.25);
  tree.add(crown);

  // Hanging strands, longest at the crown's edge — the whole point of a willow
  const strands: number[] = [];
  for (let i = 0; i < 64; i++) {
    const a = rand() * Math.PI * 2;
    const d = (0.45 + rand() * 0.55) * crownR * 1.2;
    const top = trunkH + crownR * 0.35 - Math.sqrt(Math.max(0, 1 - (d / (crownR * 1.25)) ** 2)) * crownR * 0.2;
    const len = 0.5 + rand() * 1.1;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // Two segments with a slight outward drift so the curtain isn't ruled
    const midY = top - len * 0.55;
    strands.push(
      x, top, z, x + (rand() - 0.5) * 0.08, midY, z + (rand() - 0.5) * 0.08,
      x + (rand() - 0.5) * 0.08, midY, z + (rand() - 0.5) * 0.08,
      x + (rand() - 0.5) * 0.14, top - len, z + (rand() - 0.5) * 0.14
    );
  }
  const strandGeo = new BufferGeometry();
  strandGeo.setAttribute("position", new Float32BufferAttribute(strands, 3));
  tree.add(new LineSegments(strandGeo, new LineBasicMaterial({
    color: new Color("#6f8c4e"), transparent: true, opacity: 0.75,
  })));
  return tree;
}

/** Ornamental: small, tightly rounded, sometimes in blossom. */
const BLOSSOM_HEXES = ["#e8bcc8", "#f0e2e6", "#e6cddc"];
function makeOrnamentalTree(rand: () => number): Group {
  const tree = new Group();
  const trunkH = 1.0 + rand() * 0.5;
  const trunkR = 0.07 + rand() * 0.03;
  const trunk = outlinedMesh(
    new CylinderGeometry(trunkR * 0.8, trunkR * 1.2, trunkH, 6),
    { map: trunkTex, fill: new Color("#9d7f5c"), edgeThreshold: 60, toon: true }
  );
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const blossom = rand() < 0.45;
  const crownR = 0.65 + rand() * 0.3;
  const idx = Math.floor(rand() * crownTex.length);
  const crown = outlinedMesh(new IcosahedronGeometry(crownR, 1), {
    map: blossom ? undefined : crownTex[idx],
    fill: blossom
      ? new Color(BLOSSOM_HEXES[Math.floor(rand() * BLOSSOM_HEXES.length)])
      : new Color("#8fae66"),
    edgeThreshold: 45, sketchPasses: 2, toon: true,
  });
  // Clipped flat underneath — these are pruned trees, not wild ones
  crown.position.y = trunkH + crownR * 0.75;
  crown.scale.set(1.15, 0.95, 1.15);
  tree.add(crown);

  const scribbles = makeFoliageScribbles(
    rand, crownR * 1.02, 45, new Color(blossom ? "#b98a9c" : "#3d5228")
  );
  scribbles.position.copy(crown.position);
  scribbles.scale.copy(crown.scale);
  tree.add(scribbles);
  return tree;
}

export type TreeKind = "mixed" | "birch" | "snag" | "willow" | "ornamental" | "conifer";

function makeTree(rand: () => number, kind: TreeKind = "mixed"): Group {
  switch (kind) {
    case "birch": return makeBirchTree(rand);
    case "snag": return makeSnagTree(rand);
    case "willow": return makeWillowTree(rand);
    case "ornamental": return makeOrnamentalTree(rand);
    case "conifer": return makeConiferTree(rand);
    default: return rand() < 0.2 ? makeConiferTree(rand) : makeDeciduousTree(rand);
  }
}

/** Pick from a weighted mix, so a region reads as a species blend not a monoculture. */
function pickKind<T>(rand: () => number, mix: [T, number][]): T {
  const total = mix.reduce((s, m) => s + m[1], 0);
  let r = rand() * total;
  for (const [k, w] of mix) { r -= w; if (r <= 0) return k; }
  return mix[mix.length - 1][0];
}

function makeBush(rand: () => number): Group {
  const g = new Group();
  const r = 0.35 + rand() * 0.2;
  const idx = Math.floor(rand() * bushTex.length);
  const bush = outlinedMesh(new IcosahedronGeometry(r, 1), {
    map: bushTex[idx],
    fill: new Color(BUSH_HEXES[idx]).multiplyScalar(1.35),
    edgeThreshold: 40,
    toon: true,
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

/** Fern: a low spray of arching fronds, drawn as lines with side barbs. */
function makeFern(rand: () => number): Group {
  const g = new Group();
  const fronds = 5 + Math.floor(rand() * 4);
  const pos: number[] = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.5;
    const len = 0.4 + rand() * 0.35;
    const lift = 0.3 + rand() * 0.25;
    const segs = 5;
    let px = 0, py = 0.02, pz = 0;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      // Arch: rises fast, then bends over and drops toward the tip
      const x = Math.cos(a) * len * t;
      const z = Math.sin(a) * len * t;
      const y = 0.02 + lift * Math.sin(t * Math.PI * 0.78);
      pos.push(px, py, pz, x, y, z);
      // Barbs either side of the rachis
      const bw = 0.075 * (1 - t) + 0.02;
      pos.push(x, y, z, x - Math.sin(a) * bw, y + 0.03, z + Math.cos(a) * bw);
      pos.push(x, y, z, x + Math.sin(a) * bw, y + 0.03, z - Math.cos(a) * bw);
      px = x; py = y; pz = z;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({
    color: new Color("#3f5c30"), transparent: true, opacity: 0.9,
  })));
  return g;
}

/** Heather: a squat dull mound with a dusting of rusty flower tips. */
function makeHeather(rand: () => number): Group {
  const g = new Group();
  const r = 0.32 + rand() * 0.22;
  const mound = outlinedMesh(new IcosahedronGeometry(r, 1), {
    fill: new Color(rand() < 0.5 ? "#77804f" : "#697544"),
    edgeThreshold: 40, toon: true,
  });
  mound.position.y = r * 0.6;
  mound.scale.set(1.2, 0.8, 1.2);
  g.add(mound);

  const tips: number[] = [];
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 1.1;
    const y = r * 0.75;
    tips.push(Math.cos(a) * d, y, Math.sin(a) * d,
              Math.cos(a) * d, y + 0.09 + rand() * 0.1, Math.sin(a) * d);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(tips, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({
    color: new Color("#9c7089"), transparent: true, opacity: 0.85,
  })));
  return g;
}

/** Clipped box hedge: a flat-topped block, the one square silhouette in the park. */
function makeHedge(rand: () => number): Group {
  const g = new Group();
  const w = 0.8 + rand() * 1.0;
  const h = 0.45 + rand() * 0.22;
  const d = 0.42 + rand() * 0.16;
  const box = outlinedMesh(new BoxGeometry(w, h, d), {
    fill: new Color("#6d8c55"), edgeThreshold: 20, sketchPasses: 2, toon: true,
  });
  box.position.y = h / 2;
  g.add(box);

  // Clipped-leaf texture: short ticks along the top edge and the long faces
  const ticks: number[] = [];
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * w;
    const face = rand();
    if (face < 0.4) {
      ticks.push(x, h, (rand() - 0.5) * d, x + (rand() - 0.5) * 0.06, h + 0.04 + rand() * 0.04, (rand() - 0.5) * d);
    } else {
      const zz = face < 0.7 ? d / 2 : -d / 2;
      const y = rand() * h;
      ticks.push(x, y, zz, x + (rand() - 0.5) * 0.05, y + 0.05, zz);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(ticks, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({
    color: new Color("#33421f"), transparent: true, opacity: 0.75,
  })));
  return g;
}

/** Reeds: a stand of tall blades, some topped with a cattail head. */
function makeReeds(rand: () => number): Group {
  const g = new Group();
  const n = 9 + Math.floor(rand() * 8);
  const blades: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.32;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 0.7 + rand() * 0.8;
    const lean = (rand() - 0.5) * 0.28;
    const midY = h * 0.6;
    blades.push(x, 0, z, x + lean * 0.4, midY, z + lean * 0.3);
    blades.push(x + lean * 0.4, midY, z + lean * 0.3, x + lean, h, z + lean * 0.8);

    if (rand() < 0.35) {
      const head = new Mesh(
        new CylinderGeometry(0.035, 0.035, 0.2, 5),
        new MeshBasicMaterial({ color: new Color("#7c5a3a") })
      );
      head.position.set(x + lean, h + 0.08, z + lean * 0.8);
      g.add(head);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(blades, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({
    color: new Color("#5f7a45"), transparent: true, opacity: 0.9,
  })));
  return g;
}

export type BushKind = "leafy" | "fern" | "heather" | "hedge" | "reeds";

function makeUndergrowth(rand: () => number, kind: BushKind): Group {
  switch (kind) {
    case "fern": return makeFern(rand);
    case "heather": return makeHeather(rand);
    case "hedge": return makeHedge(rand);
    case "reeds": return makeReeds(rand);
    default: return makeBush(rand);
  }
}

// --- Region signature props ---

/** Fallen log with a mossy top and a scatter of bracket fungi. Grove. */
function makeFallenLog(rand: () => number): Group {
  const g = new Group();
  const len = 1.6 + rand() * 1.6;
  const r = 0.16 + rand() * 0.08;
  const log = outlinedMesh(new CylinderGeometry(r * 0.8, r, len, 7), {
    map: trunkTex, fill: new Color("#8b7355"), edgeThreshold: 55, toon: true,
  });
  log.rotation.z = Math.PI / 2;
  log.position.y = r;
  g.add(log);

  // Moss along the upper side
  const moss: number[] = [];
  for (let i = 0; i < 34; i++) {
    const x = (rand() - 0.5) * len * 0.92;
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.5;
    const y = r + Math.sin(-a) * r * 0.4;
    const z = Math.cos(a) * r * 0.75;
    moss.push(x, y, z, x + (rand() - 0.5) * 0.05, y + 0.05 + rand() * 0.05, z);
  }
  const mossGeo = new BufferGeometry();
  mossGeo.setAttribute("position", new Float32BufferAttribute(moss, 3));
  g.add(new LineSegments(mossGeo, new LineBasicMaterial({
    color: new Color("#4d6b34"), transparent: true, opacity: 0.9,
  })));

  for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) {
    const cap = new Mesh(
      new CylinderGeometry(0.09 + rand() * 0.05, 0.02, 0.05, 7),
      new MeshBasicMaterial({ color: new Color("#c9b48c") })
    );
    cap.position.set((rand() - 0.5) * len * 0.8, r * 0.9, r * 0.7);
    cap.rotation.x = Math.PI / 2.4;
    g.add(cap);
  }
  g.rotation.y = rand() * Math.PI;
  return g;
}

/** A little cluster of toadstools. Grove. */
function makeMushrooms(rand: () => number): Group {
  const g = new Group();
  for (let i = 0; i < 2 + Math.floor(rand() * 4); i++) {
    const h = 0.07 + rand() * 0.09;
    const cr = 0.05 + rand() * 0.05;
    const x = (rand() - 0.5) * 0.35, z = (rand() - 0.5) * 0.35;
    const stem = new Mesh(
      new CylinderGeometry(cr * 0.28, cr * 0.34, h, 5),
      new MeshBasicMaterial({ color: new Color("#e5ddc8") })
    );
    stem.position.set(x, h / 2, z);
    g.add(stem);
    const cap = new Mesh(
      new ConeGeometry(cr, cr * 0.85, 7),
      new MeshBasicMaterial({ color: new Color(rand() < 0.4 ? "#b3624f" : "#8d7a5c") })
    );
    cap.position.set(x, h + cr * 0.3, z);
    g.add(cap);
    g.add(new LineSegments(
      new EdgesGeometry(cap.geometry, 24),
      new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 })
    ).translateX(x).translateY(h + cr * 0.3).translateZ(z));
  }
  return g;
}

/** Stacked flat stones. Wilds. */
function makeCairn(rand: () => number): Group {
  const g = new Group();
  let y = 0;
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const r = (0.3 - t * 0.16) * (0.85 + rand() * 0.3);
    const h = 0.09 + rand() * 0.07;
    const stone = outlinedMesh(new CylinderGeometry(r * 0.85, r, h, 6), {
      map: rockTex, fill: new Color(["#a29b90", "#98918a", "#ada69a"][Math.floor(rand() * 3)]),
      edgeThreshold: 30, toon: true,
    });
    stone.position.set((rand() - 0.5) * 0.05, y + h / 2, (rand() - 0.5) * 0.05);
    stone.rotation.y = rand() * Math.PI;
    g.add(stone);
    y += h;
  }
  return g;
}

/** Bleached driftwood, half-buried. Waterside. */
function makeDriftwood(rand: () => number): Group {
  const g = new Group();
  const len = 0.9 + rand() * 1.0;
  const r = 0.07 + rand() * 0.05;
  const log = outlinedMesh(new CylinderGeometry(r * 0.5, r, len, 6), {
    fill: new Color("#c4b9a4"), edgeThreshold: 50, toon: true,
  });
  log.rotation.z = Math.PI / 2;
  log.rotation.x = (rand() - 0.5) * 0.5;
  log.position.y = r * 0.7;
  g.add(log);
  const limbs: number[] = [];
  for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
    const x = (rand() - 0.5) * len * 0.7;
    const a = rand() * Math.PI * 2;
    const l = 0.16 + rand() * 0.22;
    limbs.push(x, r * 0.7, 0, x + Math.cos(a) * l, r * 0.7 + Math.abs(Math.sin(a)) * l * 0.6, Math.sin(a) * l);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(limbs, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({ color: new Color("#8d8271") })));
  g.rotation.y = rand() * Math.PI;
  return g;
}

/** A soft-edged disc, so point-sprite flower heads are round and not square. */
const bloomSprite = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.72, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
})();

/** Iron arch over a walk, with a climbing rose on it. Garden. */
function makeTrellisArch(rand: () => number): Group {
  const g = new Group();
  const w = 1.5, h = 2.3;
  const bars: number[] = [];
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const p = (t: number) => {
      // Two uprights joined by a semicircular head
      if (t < 0.3) return [-w / 2, (t / 0.3) * (h - w / 2)];
      if (t > 0.7) return [w / 2, ((1 - t) / 0.3) * (h - w / 2)];
      const a = Math.PI * (1 - (t - 0.3) / 0.4);
      return [Math.cos(a) * (w / 2), h - w / 2 + Math.sin(a) * (w / 2)];
    };
    const [x0, y0] = p(t0), [x1, y1] = p(t1);
    bars.push(x0, y0, 0, x1, y1, 0);
    bars.push(x0, y0, 0.28, x1, y1, 0.28);
  }
  for (let i = 0; i <= 4; i++) {
    const t = 0.3 + (i / 4) * 0.4;
    const a = Math.PI * (1 - (t - 0.3) / 0.4);
    const x = Math.cos(a) * (w / 2), y = h - w / 2 + Math.sin(a) * (w / 2);
    bars.push(x, y, 0, x, y, 0.28);
  }
  // Drawn three times with a little jitter, the same trick as the model
  // outlines: a single-pixel ironwork line vanishes against the planting
  // behind it, and the doubled strokes read as drawn metal.
  for (let pass = 0; pass < 3; pass++) {
    const j = pass === 0 ? 0 : 0.03 * pass;
    const arr = bars.map((v) => v + (Math.random() - 0.5) * j);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(arr, 3));
    g.add(new LineSegments(geo, new LineBasicMaterial({
      color: new Color("#3f3f39"),
      transparent: true,
      opacity: pass === 0 ? 1 : 0.5 - pass * 0.12,
    })));
  }

  // Rose growing over it
  for (let i = 0; i < 26; i++) {
    const t = 0.05 + rand() * 0.9;
    const a = Math.PI * (1 - Math.min(1, Math.max(0, (t - 0.3) / 0.4)));
    const onHead = t > 0.3 && t < 0.7;
    const x = onHead ? Math.cos(a) * (w / 2) : (t < 0.3 ? -w / 2 : w / 2);
    const y = onHead ? h - w / 2 + Math.sin(a) * (w / 2) : (t < 0.3 ? (t / 0.3) : (1 - t) / 0.3) * (h - w / 2);
    const leaf = new Mesh(
      new IcosahedronGeometry(0.055 + rand() * 0.045, 0),
      new MeshBasicMaterial({ color: new Color("#6c8a4e") })
    );
    leaf.position.set(x + (rand() - 0.5) * 0.16, y + (rand() - 0.5) * 0.14, rand() * 0.28);
    g.add(leaf);
    if (rand() < 0.35) {
      const bloom = new Mesh(
        new IcosahedronGeometry(0.038, 0),
        new MeshBasicMaterial({ color: new Color(BLOSSOM_HEXES[Math.floor(rand() * BLOSSOM_HEXES.length)]) })
      );
      bloom.position.copy(leaf.position).add(new Vector3(0.04, 0.05, 0.04));
      g.add(bloom);
    }
  }
  return g;
}

// A few small rocks: dark gray with tan wash. Sparse silhouette edges only.
const rockTex = makeWatercolorTexture("#6a6560", 800, 128, 12, 6, 0.4);
function makeRock(rand: () => number): Group {
  const g = new Group();
  const r = 0.16 + rand() * 0.22;
  const rock = outlinedMesh(new IcosahedronGeometry(r, 0), {
    map: rockTex,
    fill: new Color("#a29b90"),
    edgeThreshold: 32,
    toon: true,
  });
  rock.position.y = r * 0.55;
  rock.scale.set(1.2 + rand() * 0.3, 0.7, 1 + rand() * 0.3);
  rock.rotation.y = rand() * Math.PI;
  g.add(rock);
  const cracks = makeRockCracks(rand, r);
  cracks.position.copy(rock.position);
  cracks.scale.copy(rock.scale);
  cracks.rotation.copy(rock.rotation);
  g.add(cracks);
  return g;
}

// Flower: short vertical stem + colored dot bloom. Colors picked from a small
// palette so a bed of flowers reads as a garden not a rainbow.
const FLOWER_COLORS = ["#e0708a", "#c98060", "#dcb85a", "#a37fc9", "#d8dcc5"];
function makeFlower(rand: () => number): Group {
  const g = new Group();
  const h = 0.14 + rand() * 0.1;
  const stem = new BufferGeometry();
  stem.setAttribute("position", new Float32BufferAttribute([0, 0, 0, (rand() - 0.5) * 0.02, h, (rand() - 0.5) * 0.02], 3));
  g.add(new LineSegments(stem, new LineBasicMaterial({ color: new Color("#3f5232"), transparent: true, opacity: 0.85 })));
  const color = new Color(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]);
  const bloom = new Mesh(new IcosahedronGeometry(0.05 + rand() * 0.03, 0), new MeshBasicMaterial({ color }));
  bloom.position.y = h;
  g.add(bloom);
  const bloomEdges = new LineSegments(
    new EdgesGeometry(bloom.geometry, 20),
    new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 })
  );
  bloomEdges.position.y = h;
  g.add(bloomEdges);
  return g;
}

// Lamp glows are collected so the day/night cycle can fade them up at dusk.
const lampGlows: { glow: Mesh; bulb: Mesh }[] = [];
export function getLampGlows() { return lampGlows; }

// Lamp post: slim cylinder pole + boxy lamp housing + a soft glow disc facing
// down. Rare and taller than everything else so they read as landmarks.
function makeLampPost(rand: () => number): Group {
  const g = new Group();
  const poleH = 3.2 + rand() * 0.4;
  const pole = outlinedMesh(new CylinderGeometry(0.05, 0.07, poleH, 6), {
    fill: new Color("#2b2b2b"),
    edgeThreshold: 65,
    sketchPasses: 1,
  });
  pole.position.y = poleH / 2;
  g.add(pole);

  // A little cross-arm and a lamp box on the top.
  const arm = new BufferGeometry();
  arm.setAttribute("position", new Float32BufferAttribute([
    0, poleH, 0, 0.35, poleH, 0,
    0.35, poleH, 0, 0.35, poleH - 0.06, 0,
  ], 3));
  g.add(new LineSegments(arm, new LineBasicMaterial({ color: INK })));

  const lamp = outlinedMesh(new IcosahedronGeometry(0.14, 0), {
    fill: new Color("#f0d78a"),
    edgeThreshold: 30,
    sketchPasses: 1,
  });
  lamp.position.set(0.35, poleH - 0.2, 0);
  g.add(lamp);

  // Soft warm glow beneath the lamp — a small billboard.
  const glowTex = makeWatercolorTexture("#f4d68a", 900, 128, 14, 6, 0, true);
  const glow = new Mesh(
    new PlaneGeometry(1.4, 1.4),
    new MeshBasicMaterial({ map: glowTex, color: new Color("#f8dfa2"), transparent: true, opacity: 0.55, depthWrite: false })
  );
  glow.position.set(0.35, poleH - 0.2, 0.01);
  glow.material.opacity = 0; // dark by day; the day/night cycle fades it up
  g.add(glow);

  // Register so the day/night cycle can light this lamp after dusk.
  const bulbMesh = lamp.children.find((c) => (c as Mesh).isMesh) as Mesh | undefined;
  if (bulbMesh) lampGlows.push({ glow, bulb: bulbMesh });

  return g;
}

// Park bench: slats for the seat and backrest with iron legs at either end.
function makeBench(rand: () => number): Group {
  const g = new Group();
  const w = 1.4;
  const seatH = 0.42;
  const seatD = 0.32;
  const backH = 0.42;

  const boxGeo = (bw: number, bh: number, bd: number) => {
    const geo = new BufferGeometry();
    const hw = bw / 2, hh = bh / 2, hd = bd / 2;
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
  };

  const seatMesh = outlinedMesh(boxGeo(w, 0.05, seatD), { fill: new Color("#c9a06a"), edgeThreshold: 40, sketchPasses: 1 });
  seatMesh.position.set(0, seatH, 0);
  g.add(seatMesh);

  const backMesh = outlinedMesh(boxGeo(w, backH, 0.05), { fill: new Color("#c9a06a"), edgeThreshold: 40, sketchPasses: 1 });
  backMesh.position.set(0, seatH + backH / 2, -seatD / 2 + 0.025);
  g.add(backMesh);

  // Iron legs as vertical black lines
  const legPos: number[] = [];
  const legXs = [-w / 2 + 0.06, w / 2 - 0.06];
  const legZs = [-seatD / 2 + 0.04, seatD / 2 - 0.04];
  for (const lx of legXs) for (const lz of legZs) {
    legPos.push(lx, 0, lz, lx, seatH, lz);
  }
  const legGeo = new BufferGeometry();
  legGeo.setAttribute("position", new Float32BufferAttribute(legPos, 3));
  g.add(new LineSegments(legGeo, new LineBasicMaterial({ color: INK })));

  g.rotation.y = rand() * Math.PI * 2;
  return g;
}

// ---------------- Ground texture layers ----------------

// A watercolor blob patch on the ground — used for grass tufts and dirt.
function makeGroundPatch(
  cx: number, cz: number, radius: number, tex: CanvasTexture, tint: Color, opacity = 0.9
): Mesh {
  const geo = new PlaneGeometry(radius * 2, radius * 2);
  const mat = new MeshBasicMaterial({
    map: tex, color: tint,
    transparent: true, opacity,
    depthWrite: false,
  });
  const m = new Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0.008 + Math.random() * 0.002, cz);
  m.rotation.z = Math.random() * Math.PI * 2;
  return m;
}

// Random small ink specks scattered across the ground — feels like flecks
// from a pen on paper.
function makeInkSplatters(rand: () => number, worldWidth: number, worldDepth: number, count: number): Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(30,30,30,0.9)";
  ctx.beginPath();
  ctx.arc(32, 32, 8 + Math.random() * 6, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const ang = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 14;
    const x = 32 + Math.cos(ang) * dist;
    const y = 32 + Math.sin(ang) * dist;
    ctx.arc(x, y, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;

  // Use a bunch of small planes packed into one Group as one InstancedMesh
  // would be cleaner, but for this count individual planes are fine.
  const g = new Group();
  for (let i = 0; i < count; i++) {
    const size = 0.15 + rand() * 0.2;
    const m = new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35 + rand() * 0.35, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rand() * Math.PI * 2;
    m.position.set(rand() * worldWidth, 0.007, rand() * worldDepth);
    g.add(m);
  }
  // Wrap the whole group in a proxy mesh isn't needed — just return one dummy
  // Mesh but attach the group as its child. Easier: return the group cast as
  // Mesh via a workaround. We'll return `g as unknown as Mesh` so callers who
  // treat it as a scene child work — the return type is a lie but semantically
  // a Group behaves fine for `worldRoot.add(...)`.
  return g as unknown as Mesh;
}

// Tiny crack lines on the surface of a rock.
function makeRockCracks(rand: () => number, radius: number): LineSegments {
  const positions: number[] = [];
  const count = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const y = radius * (0.3 + rand() * 0.5);
    const startAng = rand() * Math.PI * 2;
    let x = Math.cos(startAng) * radius * 0.9;
    let z = Math.sin(startAng) * radius * 0.9;
    const steps = 3 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      const dx = (rand() - 0.5) * 0.08;
      const dz = (rand() - 0.5) * 0.08;
      const nx = x + dx;
      const nz = z + dz;
      positions.push(x, y, z, nx, y - rand() * 0.02, nz);
      x = nx; z = nz;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 }));
}

// A tree-knot circle on the trunk.
function makeTreeKnots(rand: () => number, radius: number, trunkH: number, count: number): LineSegments {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = trunkH * (0.3 + rand() * 0.5);
    const ang = rand() * Math.PI * 2;
    const cx = Math.cos(ang) * radius * 1.02;
    const cz = Math.sin(ang) * radius * 1.02;
    const kr = 0.03 + rand() * 0.03;
    const seg = 10;
    for (let s = 0; s < seg; s++) {
      const a1 = (s / seg) * Math.PI * 2;
      const a2 = ((s + 1) / seg) * Math.PI * 2;
      // The knot ring lies in the plane tangent to the trunk surface
      const t1x = -Math.sin(ang);
      const t1z = Math.cos(ang);
      const x1 = cx + Math.cos(a1) * kr * t1x;
      const z1 = cz + Math.cos(a1) * kr * t1z;
      const y1 = y + Math.sin(a1) * kr;
      const x2 = cx + Math.cos(a2) * kr * t1x;
      const z2 = cz + Math.cos(a2) * kr * t1z;
      const y2 = y + Math.sin(a2) * kr;
      positions.push(x1, y1, z1, x2, y2, z2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color: new Color("#3a2a1a"), transparent: true, opacity: 0.7 }));
}

// Grass and dirt watercolor textures for ground patches
const grassPatchTex = makeWatercolorTexture("#6a8d4a", 1100, 256, 22, 8, 0, true);
const dirtPatchTex = makeWatercolorTexture("#7a5a38", 1200, 256, 18, 6, 0, true);

// Soft dark ellipse under a large object — reads as a ground shadow.
const shadowTex = makeWatercolorTexture("#3a352b", 950, 128, 10, 4, 0, true);
function makeGroundShadow(radius: number): Mesh {
  const m = new Mesh(
    new PlaneGeometry(radius * 2, radius * 1.2),
    new MeshBasicMaterial({ map: shadowTex, color: new Color("#2b2b2b"), transparent: true, opacity: 0.28, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  return m;
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

// Clouds now drift slowly on the X axis; when they leave the visible ring
// they wrap around to the other side.
interface CloudsInfo {
  group: Group;
  worldWidth: number;
  worldDepth: number;
  cloudSpeeds: number[];
}
let cloudsInfo: CloudsInfo | null = null;
function makeClouds(rand: () => number, worldWidth: number, worldDepth: number): Group {
  const g = new Group();
  const cloudTex = makeWatercolorTexture("#c8c9c4", 700, 256, 20, 6, 0, true);
  const speeds: number[] = [];
  for (let i = 0; i < 14; i++) {
    const w = 6 + rand() * 5;
    const h = 2 + rand() * 1;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: cloudTex, color: new Color("#e0dcc9"), transparent: true, opacity: 0.6, depthWrite: false })
    );
    const angle = rand() * Math.PI * 2;
    const radius = Math.max(worldWidth, worldDepth) * 0.6;
    mesh.position.set(worldWidth / 2 + Math.cos(angle) * radius, 8 + rand() * 3, worldDepth / 2 + Math.sin(angle) * radius);
    g.add(mesh);
    speeds.push(0.15 + rand() * 0.25);
  }
  cloudsInfo = { group: g, worldWidth, worldDepth, cloudSpeeds: speeds };
  return g;
}

// Butterflies — a pair of triangle wings that flap and wander a loopy path
// around a home point. Cheap, but brings the meadow to life.
interface Butterfly {
  group: Group;
  wingL: Mesh;
  wingR: Mesh;
  home: [number, number];
  seed: number;
}
const butterflies: Butterfly[] = [];
const BUTTERFLY_COLORS = ["#e0708a", "#dcb85a", "#a37fc9", "#f4efe6"];

function makeButterfly(homeX: number, homeZ: number, seed: number): Butterfly {
  const group = new Group();
  const color = new Color(BUTTERFLY_COLORS[Math.floor(seed * 7) % BUTTERFLY_COLORS.length]);
  const wingGeo = new BufferGeometry();
  wingGeo.setAttribute("position", new Float32BufferAttribute([
    0, 0, 0,
    0.09, 0.04, 0,
    0.07, -0.05, 0,
  ], 3));
  wingGeo.setIndex([0, 1, 2]);
  wingGeo.computeVertexNormals();
  const mat = new MeshBasicMaterial({ color, side: DoubleSide });
  const wingL = new Mesh(wingGeo, mat);
  const wingR = new Mesh(wingGeo.clone(), mat);
  wingR.scale.x = -1;
  group.add(wingL);
  group.add(wingR);
  group.position.set(homeX, 0.8, homeZ);
  return { group, wingL, wingR, home: [homeX, homeZ], seed };
}

export function spawnButterflies(worldRoot: Group, spots: [number, number][]) {
  for (let i = 0; i < spots.length; i++) {
    const b = makeButterfly(spots[i][0], spots[i][1], (i * 0.37 + 0.13) % 1);
    butterflies.push(b);
    worldRoot.add(b.group);
  }
}

export function updateAtmosphere(dt: number, time = 0) {
  if (cloudsInfo) {
    const info = cloudsInfo;
    const wrapMax = Math.max(info.worldWidth, info.worldDepth) * 0.9;
    info.group.children.forEach((c, i) => {
      c.position.x += info.cloudSpeeds[i] * dt;
      if (c.position.x - info.worldWidth / 2 > wrapMax) {
        c.position.x -= wrapMax * 2;
      }
    });
  }
  for (const b of butterflies) {
    const t = time * (0.5 + b.seed * 0.4) + b.seed * 20;
    // Loopy lissajous wander around home
    const x = b.home[0] + Math.sin(t * 0.9) * 1.6 + Math.sin(t * 0.37) * 0.8;
    const z = b.home[1] + Math.cos(t * 0.7) * 1.4 + Math.cos(t * 0.53) * 0.7;
    const y = 0.7 + Math.sin(t * 1.3) * 0.25 + b.seed * 0.4;
    // Face the travel direction
    const dx = x - b.group.position.x;
    const dz = z - b.group.position.z;
    if (Math.hypot(dx, dz) > 0.001) b.group.rotation.y = Math.atan2(dx, dz);
    b.group.position.set(x, y, z);
    // Wing flap
    const flap = Math.sin(time * 18 + b.seed * 30) * 0.9;
    b.wingL.rotation.y = flap;
    b.wingR.rotation.y = -flap;
  }
}

interface AvoidCircle { x: number; z: number; r: number }

// Bezier point for the path, pushed radially out of any avoid-circle (the
// pond) so the path bends around water instead of crossing it.
function pathPointAt(
  t: number,
  cx1: number, cz1: number, cx2: number, cz2: number,
  viaX: number, viaZ: number,
  avoid?: AvoidCircle
): [number, number] {
  const u = 1 - t;
  let x = u * u * cx1 + 2 * u * t * viaX + t * t * cx2;
  let z = u * u * cz1 + 2 * u * t * viaZ + t * t * cz2;
  if (avoid) {
    const d = Math.hypot(x - avoid.x, z - avoid.z);
    if (d < avoid.r) {
      const k = avoid.r / Math.max(d, 0.0001);
      x = avoid.x + (x - avoid.x) * k;
      z = avoid.z + (z - avoid.z) * k;
    }
  }
  return [x, z];
}

// Winding path that follows the terrain — each vertex is lifted to the
// ground height at its (x, z), so the ribbon hugs the hills instead of
// clipping through them as flat triangles.
function makePath(cx1: number, cz1: number, cx2: number, cz2: number, viaX: number, viaZ: number, avoid?: AvoidCircle): Group {
  const g = new Group();
  const steps = 90;
  const positions: number[] = [];
  const ribbonPos: number[] = [];
  const yLift = 0.03; // sit slightly above the terrain to avoid z-fighting
  // Width envelope: full at the hub end (where several walks meet and have to
  // line up), narrowing to nothing at the far end so a spur peters out like a
  // desire line instead of stopping dead in a blunt rectangle.
  const widthAt = (t: number) => {
    const taper = t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38) ** 0.85;
    // Slow wobble along the length keeps the edges from reading as ruled.
    const wobble = 0.9 + 0.14 * Math.sin(t * 11.3 + cx1 * 0.7) + 0.07 * Math.sin(t * 27.1);
    return 0.78 * taper * wobble;
  };
  let prev: [number, number, number] | null = null;
  let prevW = widthAt(0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, z] = pathPointAt(t, cx1, cz1, cx2, cz2, viaX, viaZ, avoid);
    const y = sampleGroundHeight(x, z) + yLift;
    const w = widthAt(t);
    if (prev) {
      const dx = x - prev[0];
      const dz = z - prev[2];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const pw = prevW;
      // Lift each ribbon edge to the terrain at its own x/z so the strip
      // conforms to the ground on both sides.
      const pyL = sampleGroundHeight(prev[0] + nx * pw, prev[2] + nz * pw) + yLift;
      const pyR = sampleGroundHeight(prev[0] - nx * pw, prev[2] - nz * pw) + yLift;
      const yL = sampleGroundHeight(x + nx * w, z + nz * w) + yLift;
      const yR = sampleGroundHeight(x - nx * w, z - nz * w) + yLift;
      // Two triangles forming the ribbon quad from prev→curr:
      //   PL --- CL       (P = prev, C = curr, L = left, R = right)
      //   |  \    |
      //   PR --- CR
      const PLx = prev[0] + nx * pw, PLz = prev[2] + nz * pw;
      const PRx = prev[0] - nx * pw, PRz = prev[2] - nz * pw;
      const CLx = x + nx * w,        CLz = z + nz * w;
      const CRx = x - nx * w,        CRz = z - nz * w;
      ribbonPos.push(
        PLx, pyL, PLz,   CLx, yL, CLz,   PRx, pyR, PRz,
        CLx, yL, CLz,    CRx, yR, CRz,   PRx, pyR, PRz,
      );
      positions.push(prev[0], prev[1] + 0.002, prev[2], x, y + 0.002, z);
    }
    prev = [x, y, z];
    prevW = w;
  }
  const ribbonGeo = new BufferGeometry();
  ribbonGeo.setAttribute("position", new Float32BufferAttribute(ribbonPos, 3));
  // Solid tan color, no map — the ribbon has no UVs, so any texture would
  // sample inconsistently per triangle and show as tan zigzag facets on the
  // ground. A flat color reads as one continuous path.
  g.add(new Mesh(ribbonGeo, new MeshBasicMaterial({
    color: new Color("#d6b988"),
    transparent: true,
    // Kept below 0.7: where two walks cross, the ribbons overlap and blend
    // twice, and at full strength the junction burns out into a tan star.
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })));

  const centerGeo = new BufferGeometry();
  centerGeo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.add(new LineSegments(centerGeo, new LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.4 })));
  return g;
}

// Soft vertical sky gradient. The canvas is kept around so the day/night
// cycle can repaint it each time the palette shifts.
const skyCanvas = document.createElement("canvas");
skyCanvas.width = 4;
skyCanvas.height = 512;
let skyTexture: CanvasTexture | null = null;

export function paintSky(top: string, mid: string, horizon: string): CanvasTexture {
  const ctx = skyCanvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 512);
  if (!skyTexture) {
    skyTexture = new CanvasTexture(skyCanvas);
  }
  skyTexture.needsUpdate = true;
  return skyTexture;
}

function makeSkyTexture(): CanvasTexture {
  return paintSky("#dfe4e8", "#eeeade", "#f6f0e2");
}

// Star field — points scattered on a large dome, invisible by day.
function makeStars(worldWidth: number, worldDepth: number): Points {
  const count = 260;
  const positions = new Float32Array(count * 3);
  const rand = seededRand(9182);
  const R = Math.max(worldWidth, worldDepth) * 1.1;
  for (let i = 0; i < count; i++) {
    // Upper hemisphere only
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI * 0.42;
    positions[i * 3] = worldWidth / 2 + Math.sin(phi) * Math.cos(theta) * R;
    positions[i * 3 + 1] = Math.cos(phi) * R * 0.75 + 4;
    positions[i * 3 + 2] = worldDepth / 2 + Math.sin(phi) * Math.sin(theta) * R;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: new Color("#f6f2e4"),
    size: 0.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  return new Points(geo, mat);
}

/** A solid the player can't walk through, and the camera won't sit inside. */
export interface Collider { x: number; z: number; r: number }

export interface WorldHandles {
  scene: Scene;
  worldRoot: Group;
  sun: DirectionalLight;
  fill: DirectionalLight;
  ambient: AmbientLight;
  fog: Fog;
  stars: Points;
  sunDisc: Group;
  moonDisc: Group;
  colliders: Collider[];
  canopies: Canopy[];
}

/**
 * A tree's crown, for the camera fade. Camera collision only stops the boom on
 * trunks — a crown is walk-through by design — so in the grove the camera
 * regularly ends up inside a canopy with the screen a flat sheet of green.
 * Rather than colliding against crowns (which makes the camera leap around
 * under every tree), we dissolve the ones it's inside.
 */
export interface Canopy {
  x: number; z: number; yBottom: number; r: number;
  mats: { m: FadeMaterial; base: number }[];
  faded: boolean;
}
type FadeMaterial = Material & { opacity: number; transparent: boolean };

/**
 * Fade out any canopy the camera has entered. Cheap enough to run every frame:
 * a squared-distance test per tree, and material writes only for the handful
 * actually overlapping.
 */
export function fadeCanopies(canopies: Canopy[], camX: number, camY: number, camZ: number) {
  for (const c of canopies) {
    // Fully clear at the crown's edge, fully dissolved a little inside it.
    const d = Math.hypot(camX - c.x, camZ - c.z);
    const inHeight = camY > c.yBottom - 0.6;
    const t = inHeight ? (d - c.r * 0.45) / (c.r * 0.75) : 1;
    const target = Math.max(0, Math.min(1, t));
    if (target >= 1) {
      if (!c.faded) continue;
      for (const { m, base } of c.mats) { m.opacity = base; m.transparent = false; }
      c.faded = false;
      continue;
    }
    // 0.08 rather than 0 so the tree still reads as a shape you're standing in
    const k = 0.08 + target * 0.92;
    for (const { m, base } of c.mats) { m.transparent = true; m.opacity = base * k; }
    c.faded = true;
  }
}

export interface WorldSite {
  /** The pond. Planting keeps out of it and the paths bend around it. */
  pond: { x: number; z: number; radius: number };
  /** The massif behind the pond — a no-plant zone so the cliff stays visible. */
  massif: { x: number; z: number; radius: number };
}

export function buildWorld(worldWidth: number, worldDepth: number, site: WorldSite): WorldHandles {
  const scene = new Scene();
  scene.background = makeSkyTexture();
  // Fog is set in absolute units rather than scaled to the map: it's what
  // gives the mountains their aerial perspective, and that shouldn't get
  // weaker just because the park got bigger.
  const fog = new Fog(PAPER.getHex(), 42, 145);
  scene.fog = fog;

  // Warm sun from above-right, cool fill from above-left. Toon materials use
  // this to pick a shading step, giving objects volume without breaking flat
  // watercolor look.
  const sun = new DirectionalLight(0xfff2d0, 1.1);
  sun.position.set(1.4, 2.0, -0.6);
  scene.add(sun);
  const fill = new DirectionalLight(0xc8d4e2, 0.4);
  fill.position.set(-1.2, 1.4, 0.8);
  scene.add(fill);
  const ambient = new AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const stars = makeStars(worldWidth, worldDepth);
  scene.add(stars);

  const worldRoot = new Group();
  scene.add(worldRoot);

  // Flatten around the pond and the winding path so nothing looks like it's
  // floating over invisible hills.
  const pondCenter = { x: site.pond.x, z: site.pond.z, radius: site.pond.radius };
  setTerrainFlatten([pondCenter]);

  const rand = seededRand(42);

  // ---- Regions ----
  // The park reads as distinct places rather than one uniform scatter. Each
  // region has its own planting rules, and the paths connect them like a real
  // park's desire lines: a central green with spokes out to everything else.
  const hub: [number, number] = [worldWidth * 0.48, worldDepth * 0.56];
  const regions = {
    meadow: { x: hub[0], z: hub[1], r: Math.min(worldWidth, worldDepth) * 0.29 },
    grove: { x: worldWidth * 0.24, z: worldDepth * 0.28, r: Math.min(worldWidth, worldDepth) * 0.27 },
    garden: { x: worldWidth * 0.80, z: worldDepth * 0.74, r: Math.min(worldWidth, worldDepth) * 0.22 },
    wilds: { x: worldWidth * 0.22, z: worldDepth * 0.82, r: Math.min(worldWidth, worldDepth) * 0.22 },
    waterside: { x: pondCenter.x, z: pondCenter.z, r: pondCenter.radius + 7 },
  };

  // Flat single-plane ground, painted in one pass from the region layout.
  const GROUND_MARGIN = 30;
  const parkGroundTex = makeParkGroundTexture(
    worldWidth, worldDepth, GROUND_MARGIN,
    [
      // Pushed well apart. Five tints a few percent from each other all read
      // as "grass" — the floor has to change colour when you cross a border
      // or the regions only differ in what's planted on them.
      { ...regions.meadow, r: regions.meadow.r * 1.1, hex: "#a8cf62", density: 30, alpha: 0.34 },
      { ...regions.grove, hex: "#4f6d3a", density: 44, alpha: 0.4 },
      { ...regions.garden, hex: "#8cc07c", density: 30, alpha: 0.3 },
      { ...regions.wilds, hex: "#a89b56", density: 42, alpha: 0.4 },
      { ...regions.waterside, r: regions.waterside.r * 1.2, hex: "#82b985", density: 26, alpha: 0.3 },
    ],
    pondCenter,
    7717
  );
  const groundGeo = new PlaneGeometry(worldWidth + GROUND_MARGIN * 2, worldDepth + GROUND_MARGIN * 2, 1, 1);
  const ground = new Mesh(groundGeo, new MeshBasicMaterial({ map: parkGroundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, 0, worldDepth / 2);
  worldRoot.add(ground);

  // ---- Path network ----
  // Spokes from the central green. Each is a bezier that bends around the
  // pond, and every sample feeds the placement clearance test so nothing
  // spawns on a walkway.
  const pathAvoid = { x: pondCenter.x, z: pondCenter.z, r: pondCenter.radius + 1.8 };
  const pathSamples: [number, number][] = [];
  const addPath = (
    ax: number, az: number, bx: number, bz: number, viaX: number, viaZ: number
  ) => {
    worldRoot.add(makePath(ax, az, bx, bz, viaX, viaZ, pathAvoid));
    for (let i = 0; i <= 48; i++) {
      pathSamples.push(pathPointAt(i / 48, ax, az, bx, bz, viaX, viaZ, pathAvoid));
    }
  };
  // Hub out to the pond, the garden, the grove, and the wilds. The via points
  // are pulled off the straight line so the walks curve instead of spoking
  // out like wheel spokes.
  addPath(hub[0], hub[1], pondCenter.x - 1, pondCenter.z + pondCenter.radius + 2.5,
          worldWidth * 0.72, worldDepth * 0.42);
  addPath(hub[0], hub[1], regions.garden.x, regions.garden.z,
          worldWidth * 0.68, worldDepth * 0.70);
  addPath(hub[0], hub[1], regions.grove.x, regions.grove.z,
          worldWidth * 0.32, worldDepth * 0.44);
  addPath(hub[0], hub[1], regions.wilds.x, regions.wilds.z,
          worldWidth * 0.30, worldDepth * 0.70);

  // A gravel circle where the four walks meet. Without it the ribbons just
  // cross each other and the junction reads as an accidental tan star.
  {
    const hy = sampleGroundHeight(hub[0], hub[1]);
    const plaza = new Mesh(
      new CircleGeometry(2.9, 30),
      new MeshBasicMaterial({
        color: new Color("#d6b988"), transparent: true, opacity: 0.62, depthWrite: false,
      })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(hub[0], hy + 0.033, hub[1]);
    worldRoot.add(plaza);
    // Scuffed edge rather than a drawn kerb — a ring line here reads as a
    // gameplay marker, which is the last thing the middle of the park needs.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
      const d = 2.6 + rand() * 0.9;
      const speck = makeGroundPatch(
        hub[0] + Math.cos(a) * d, hub[1] + Math.sin(a) * d,
        0.5 + rand() * 0.5, dirtPatchTex, new Color("#cbb083"), 0.4
      );
      speck.position.y = hy + 0.031;
      worldRoot.add(speck);
    }
  }

  // ---- Collision-aware placement ----
  // Objects register a footprint circle; new placements are rejected if they
  // overlap an existing footprint, sit on a path, or fall in the pond.
  const placedFootprints: { x: number; z: number; r: number }[] = [];
  const PATH_CLEARANCE = 1.6;
  const canPlace = (x: number, z: number, r: number): boolean => {
    if (Math.hypot(x - pondCenter.x, z - pondCenter.z) < pondCenter.radius + r) return false;
    // Nothing plants inside the massif, and nothing plants on the sight line
    // from the pond's south shore to the falls — the cliff is the one long
    // view in the park and a canopy across it wastes it.
    if (Math.hypot(x - site.massif.x, z - site.massif.z) < site.massif.radius + r) return false;
    if (Math.abs(x - pondCenter.x) < 5.5 && z > site.massif.z && z < pondCenter.z + pondCenter.radius + 12) {
      return false;
    }
    for (const p of pathSamples) {
      if (Math.hypot(x - p[0], z - p[1]) < PATH_CLEARANCE + r) return false;
    }
    for (const f of placedFootprints) {
      if (Math.hypot(x - f.x, z - f.z) < f.r + r) return false;
    }
    return true;
  };
  const place = (x: number, z: number, r: number) => placedFootprints.push({ x, z, r });

  // Solids the player collides with. Deliberately narrower than the visual
  // footprint — you block on a tree's trunk, not its overhanging canopy, and
  // low bushes and flowers stay walk-through.
  const colliders: Collider[] = [];
  const canopies: Canopy[] = [];

  /** Rejection-sample a free point inside a region. */
  type Region = { x: number; z: number; r: number };
  const pickIn = (zone: Region, footprint: number, tries = 14): [number, number] | null => {
    for (let t = 0; t < tries; t++) {
      // sqrt keeps the distribution even rather than clumping at the centre
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * zone.r;
      const x = zone.x + Math.cos(a) * d;
      const z = zone.z + Math.sin(a) * d;
      if (x < 3 || x > worldWidth - 3 || z < 3 || z > worldDepth - 3) continue;
      if (!canPlace(x, z, footprint)) continue;
      return [x, z];
    }
    return null;
  };

  // Lamps line the walkways; benches look onto the water and the garden.
  // Registering these first means the scattered planting avoids them.
  const lampSpots: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    // Sample along the path network so lamps read as park lighting
    const p = pathSamples[Math.floor((i + 0.5) / 14 * pathSamples.length)];
    if (!p) continue;
    const off = 2.2 + rand() * 0.8;
    const side = i % 2 === 0 ? 1 : -1;
    const lx = p[0] + off * side;
    const lz = p[1] + off * (i % 3 === 0 ? side : -side) * 0.6;
    if (lx < 3 || lx > worldWidth - 3 || lz < 3 || lz > worldDepth - 3) continue;
    if (!canPlace(lx, lz, 0.7)) continue;
    lampSpots.push([lx, lz]);
    place(lx, lz, 0.7);
  }

  const benchSpots: [number, number][] = [];
  for (const zone of [regions.garden, regions.meadow, regions.waterside, regions.garden, regions.meadow]) {
    const p = pickIn(zone, 1.1);
    if (!p) continue;
    benchSpots.push(p);
    place(p[0], p[1], 1.1);
  }

  // Ground texture layers: grass patches, dirt patches, ink splatters.
  // Counts are derived from map area, not hard-coded — at fixed counts a
  // bigger park just reads as bare cream desert.
  const area = worldWidth * worldDepth;

  // The broad washes live in the painted ground texture. What's left here is
  // close-up detail: a scattering of tufted patches, worn earth and leaf
  // litter that resolve when the camera is right over them.
  for (let i = 0; i < Math.round(area / 38); i++) {
    const gx = rand() * worldWidth;
    const gz = rand() * worldDepth;
    const gr = 1.1 + rand() * 2.0;
    const patch = makeGroundPatch(gx, gz, gr, grassPatchTex, new Color("#79a552"), 0.3 + rand() * 0.26);
    patch.position.y = sampleGroundHeight(gx, gz) + 0.02;
    worldRoot.add(patch);
  }
  for (let i = 0; i < Math.round(area / 200); i++) {
    const gx = rand() * worldWidth;
    const gz = rand() * worldDepth;
    const gr = 0.9 + rand() * 1.8;
    const patch = makeGroundPatch(gx, gz, gr, dirtPatchTex, new Color("#a07a4a"), 0.34 + rand() * 0.2);
    patch.position.y = sampleGroundHeight(gx, gz) + 0.022;
    worldRoot.add(patch);
  }
  // Leaf litter under the canopy, so the grove floor isn't uniform turf
  for (let i = 0; i < Math.round(area / 190); i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * regions.grove.r;
    const gx = regions.grove.x + Math.cos(a) * d;
    const gz = regions.grove.z + Math.sin(a) * d;
    const patch = makeGroundPatch(gx, gz, 1.6 + rand() * 2.2, dirtPatchTex, new Color("#7d6a44"), 0.3 + rand() * 0.22);
    patch.position.y = sampleGroundHeight(gx, gz) + 0.024;
    worldRoot.add(patch);
  }
  const splatters = makeInkSplatters(rand, worldWidth, worldDepth, Math.round(area / 55));
  // splatters is actually a Group; each child mesh has a preassigned y=0.007
  // and we want them raised per-position. Iterate and adjust.
  (splatters as unknown as { children: { position: { x: number; y: number; z: number } }[] })
    .children.forEach((m) => {
      m.position.y = sampleGroundHeight(m.position.x, m.position.z) + 0.03;
    });
  worldRoot.add(splatters);

  worldRoot.add(makeGroundStrokes(rand, worldWidth, worldDepth));
  worldRoot.add(makePebbles(rand, worldWidth, worldDepth));

  // Hills ring the walkable area on all four sides. Offsets scale with the
  // map so the horizon sits a consistent distance beyond the play space.
  const hillNear = Math.max(14, Math.min(worldWidth, worldDepth) * 0.26);
  const hillMid = hillNear * 1.6;
  const hillFar = hillNear * 2.2;
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, hillFar, 11, hillTex[2], new Color("#c3c4cd")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, hillFar, 11, new Color("#a89f8e")));
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, hillMid, 8, hillTex[1], new Color("#bfc2c5")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, hillMid, 8, new Color("#8f8779")));
  worldRoot.add(makeHillWashesAround(worldWidth, worldDepth, hillNear, 6, hillTex[0], new Color("#b0b5c6")));
  worldRoot.add(makeHillSilhouetteAround(rand, worldWidth, worldDepth, hillNear, 6, INK_SOFT));

  worldRoot.add(makeHorizonMarks(rand, worldWidth, -hillNear));
  worldRoot.add(makeClouds(rand, worldWidth, worldDepth));

  // Trees need a wide spawn clearing: the follow camera orbits ~6.5 units
  // behind the player, and a crown there fills the whole screen.
  const treeClearRadius = 10;
  const spawnX = hub[0];
  const spawnZ = hub[1];

  const yAt = (x: number, z: number) => sampleGroundHeight(x, z);

  const plantTree = (px: number, pz: number, s: number, kind: TreeKind = "mixed") => {
    const footprint = 1.15 * s;
    place(px, pz, footprint);
    colliders.push({ x: px, z: pz, r: 0.42 * s }); // trunk only
    const tree = makeTree(rand, kind);
    tree.position.set(px, yAt(px, pz), pz);
    tree.scale.setScalar(s);
    worldRoot.add(tree);

    const mats: { m: FadeMaterial; base: number }[] = [];
    tree.traverse((o) => {
      const mm = (o as Mesh).material as Material | Material[] | undefined;
      if (!mm) return;
      for (const m of Array.isArray(mm) ? mm : [mm]) {
        mats.push({ m: m as FadeMaterial, base: (m as FadeMaterial).opacity });
      }
    });
    canopies.push({
      x: px, z: pz,
      // Crowns start above the trunk; below that the camera is just looking
      // past a stem and there's nothing to dissolve.
      yBottom: yAt(px, pz) + 1.7 * s,
      r: 1.5 * s,
      mats,
      faded: false,
    });
    const shadow = makeGroundShadow(0.9 * s);
    shadow.position.set(px, yAt(px, pz) + 0.005, pz);
    worldRoot.add(shadow);
  };

  // --- Trees, planted by region ---
  // Each region is planted with its own species mix, not just its own density.
  // Density alone gave five patches of the same tree at five spacings, which
  // from any distance is one wood with thin bits. Silhouette is what actually
  // tells you which part of the park you're standing in: birch stems in the
  // grove, bare snags in the wilds, willows over the water, clipped little
  // ornamentals in the garden.
  const treePlan: {
    zone: Region; count: number; scale: [number, number]; mix: [TreeKind, number][];
  }[] = [
    {
      zone: regions.grove, count: 150, scale: [0.9, 1.35],
      mix: [["birch", 5], ["mixed", 4], ["conifer", 2]],
    },
    {
      zone: regions.meadow, count: 26, scale: [1.0, 1.4],
      mix: [["mixed", 1]],
    },
    {
      zone: regions.garden, count: 40, scale: [0.8, 1.05],
      mix: [["ornamental", 7], ["mixed", 2]],
    },
    {
      zone: regions.wilds, count: 34, scale: [0.62, 0.9],
      mix: [["snag", 5], ["conifer", 3], ["mixed", 2]],
    },
    {
      zone: regions.waterside, count: 26, scale: [0.85, 1.15],
      mix: [["willow", 5], ["mixed", 3], ["birch", 2]],
    },
  ];
  for (const plan of treePlan) {
    for (let i = 0; i < plan.count; i++) {
      const s = plan.scale[0] + rand() * (plan.scale[1] - plan.scale[0]);
      const p = pickIn(plan.zone, 1.15 * s);
      if (!p) continue;
      if (Math.hypot(p[0] - spawnX, p[1] - spawnZ) < treeClearRadius) continue;
      plantTree(p[0], p[1], s, pickKind(rand, plan.mix));
    }
  }
  // A scattering to fill the ground between regions. It has to adopt the
  // character of whatever region it lands in — dropping generic full-size
  // deciduous trees into the garden and the wilds put big round crowns over
  // both and undid the species mix entirely.
  for (let i = 0; i < 70; i++) {
    const x = 3 + rand() * (worldWidth - 6);
    const z = 3 + rand() * (worldDepth - 6);
    if (Math.hypot(x - spawnX, z - spawnZ) < treeClearRadius) continue;
    const host = treePlan.find(
      (pl) => Math.hypot(x - pl.zone.x, z - pl.zone.z) < pl.zone.r
    );
    const scale = host ? host.scale : ([0.75, 1.2] as [number, number]);
    const s = scale[0] + rand() * (scale[1] - scale[0]);
    if (!canPlace(x, z, 1.15 * s)) continue;
    plantTree(x, z, s, host ? pickKind(rand, host.mix) : "mixed");
  }

  // --- Undergrowth: a different plant in every region ---
  const bushPlan: { zone: Region; count: number; mix: [BushKind, number][]; r: number }[] = [
    { zone: regions.grove, count: 90, r: 0.55, mix: [["fern", 6], ["leafy", 4]] },
    { zone: regions.wilds, count: 45, r: 0.55, mix: [["heather", 7], ["leafy", 2]] },
    { zone: regions.garden, count: 40, r: 0.8, mix: [["hedge", 5], ["leafy", 4]] },
    // No free-standing reeds out here — they belong on the bank, and scattered
    // across the whole waterside region they read as tall grass on dry ground.
    { zone: regions.waterside, count: 26, r: 0.5, mix: [["leafy", 5], ["fern", 2]] },
    { zone: regions.meadow, count: 16, r: 0.55, mix: [["leafy", 1]] },
  ];
  for (const plan of bushPlan) {
    for (let i = 0; i < plan.count; i++) {
      const p = pickIn(plan.zone, plan.r);
      if (!p) continue;
      place(p[0], p[1], plan.r);
      const kind = pickKind(rand, plan.mix);
      const bush = makeUndergrowth(rand, kind);
      bush.position.set(p[0], yAt(p[0], p[1]), p[1]);
      // Hedges are the only solid undergrowth — you walk through a fern
      if (kind === "hedge") {
        bush.rotation.y = rand() * Math.PI;
        colliders.push({ x: p[0], z: p[1], r: 0.6 });
      }
      worldRoot.add(bush);
    }
  }

  // Reeds also fringe the pond itself, following the bank rather than being
  // scattered through the region — a waterline without reeds looks cut out.
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rand() * 0.14;
    const d = pondCenter.radius + 0.1 + rand() * 0.7;
    const rx = pondCenter.x + Math.cos(a) * d;
    const rz = pondCenter.z + Math.sin(a) * d;
    if (rx < 2 || rx > worldWidth - 2 || rz < 2 || rz > worldDepth - 2) continue;
    // A clear arc on the near bank and on the falls' side: a continuous ring
    // of reeds walls the water off from every angle you'd want to look at it.
    if (rz < pondCenter.z - pondCenter.radius * 0.4) continue;
    if (Math.abs(rx - pondCenter.x) < pondCenter.radius * 0.5 && rz > pondCenter.z) continue;
    const reeds = makeReeds(rand);
    reeds.position.set(rx, yAt(rx, rz), rz);
    reeds.scale.setScalar(0.5 + rand() * 0.28);
    worldRoot.add(reeds);
  }

  // --- Region signature props ---
  // One or two objects per region that exist nowhere else, so each place has
  // something you can name rather than only a different density of the same
  // scenery.
  const scatterProp = (
    zone: Region, count: number, footprint: number,
    make: () => Group, opts: { solid?: number; scale?: [number, number] } = {}
  ) => {
    for (let i = 0; i < count; i++) {
      const p = pickIn(zone, footprint);
      if (!p) continue;
      place(p[0], p[1], footprint);
      if (opts.solid) colliders.push({ x: p[0], z: p[1], r: opts.solid });
      const obj = make();
      obj.position.set(p[0], yAt(p[0], p[1]), p[1]);
      if (opts.scale) obj.scale.setScalar(opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]));
      worldRoot.add(obj);
    }
  };

  scatterProp(regions.grove, 14, 1.1, () => makeFallenLog(rand), { solid: 0.7 });
  scatterProp(regions.grove, 26, 0.3, () => makeMushrooms(rand));
  scatterProp(regions.wilds, 9, 0.6, () => makeCairn(rand), { solid: 0.35 });
  scatterProp(regions.waterside, 10, 0.6, () => makeDriftwood(rand), { solid: 0.3 });

  // Two rose arches straddling the walk into the garden.
  for (const t of [0.62, 0.86]) {
    const [ax, az] = pathPointAt(
      t, hub[0], hub[1], regions.garden.x, regions.garden.z,
      worldWidth * 0.68, worldDepth * 0.70, pathAvoid
    );
    const [bx, bz] = pathPointAt(
      t + 0.02, hub[0], hub[1], regions.garden.x, regions.garden.z,
      worldWidth * 0.68, worldDepth * 0.70, pathAvoid
    );
    const arch = makeTrellisArch(rand);
    arch.position.set(ax, yAt(ax, az), az);
    // Square the arch across the walk, not along it
    arch.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    worldRoot.add(arch);
  }

  // --- Grass, everywhere, thickest on the open green ---
  for (let i = 0; i < 1100; i++) {
    const x = rand() * worldWidth;
    const z = rand() * worldDepth;
    const clump = makeGrassClump(rand, x, z);
    clump.position.y = yAt(x, z);
    worldRoot.add(clump);
  }
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * regions.meadow.r;
    const x = regions.meadow.x + Math.cos(a) * d;
    const z = regions.meadow.z + Math.sin(a) * d;
    const clump = makeGrassClump(rand, x, z);
    clump.position.y = yAt(x, z);
    worldRoot.add(clump);
  }

  // --- Rocks: the wilds are named for them ---
  const rockPlan: { zone: Region; count: number }[] = [
    { zone: regions.wilds, count: 110 },
    { zone: regions.waterside, count: 34 },
    { zone: regions.grove, count: 40 },
    { zone: regions.meadow, count: 12 },
  ];
  for (const plan of rockPlan) {
    for (let i = 0; i < plan.count; i++) {
      const p = pickIn(plan.zone, 0.4);
      if (!p) continue;
      place(p[0], p[1], 0.4);
      colliders.push({ x: p[0], z: p[1], r: 0.42 });
      const rock = makeRock(rand);
      rock.position.set(p[0], yAt(p[0], p[1]), p[1]);
      worldRoot.add(rock);
      const shadow = makeGroundShadow(0.35);
      shadow.position.set(p[0] + 0.06, yAt(p[0], p[1]) + 0.004, p[1] + 0.06);
      worldRoot.add(shadow);
    }
  }

  // --- Flower beds: the garden is mostly beds; a few wildflowers elsewhere ---
  const bedCenters: [number, number][] = [];
  const bedPlan: { zone: Region; count: number; tight: boolean }[] = [
    { zone: regions.garden, count: 22, tight: true },
    { zone: regions.meadow, count: 10, tight: false },
    { zone: regions.waterside, count: 7, tight: false },
    { zone: regions.grove, count: 5, tight: false },
  ];
  for (const plan of bedPlan) {
    for (let bed = 0; bed < plan.count; bed++) {
      const p = pickIn(plan.zone, 1.0);
      if (!p) continue;
      bedCenters.push(p);
      const spread = plan.tight ? 1.1 : 2.0;
      const count = (plan.tight ? 9 : 5) + Math.floor(rand() * 6);
      for (let i = 0; i < count; i++) {
        const fx = p[0] + (rand() - 0.5) * spread * 2;
        const fz = p[1] + (rand() - 0.5) * spread * 2;
        const flower = makeFlower(rand);
        flower.position.set(fx, yAt(fx, fz), fz);
        worldRoot.add(flower);
      }
    }
  }
  // The green's own signature: long drifts of daisies running with the lie of
  // the lawn. The garden's flowers come in tight round beds; these are loose
  // sweeps, so the two don't read as the same planting at different spacings.
  // Every stem in every drift goes into one geometry and every bloom into one
  // point cloud — four hundred flowers as four hundred objects would cost more
  // draw calls than the entire rest of the park.
  {
    const stemPos: number[] = [];
    const bloomPos: number[] = [];
    const bloomCol: number[] = [];
    const white = new Color("#f4f1e6");
    const cream = new Color("#ead98a");
    for (let drift = 0; drift < 10; drift++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * regions.meadow.r * 0.9;
      const cx = regions.meadow.x + Math.cos(a) * d;
      const cz = regions.meadow.z + Math.sin(a) * d;
      if (Math.hypot(cx - spawnX, cz - spawnZ) < 6) continue;
      const dir = rand() * Math.PI * 2;
      const len = 4 + rand() * 5;
      const tint = rand() < 0.65 ? white : cream;
      for (let i = 0; i < 46; i++) {
        const t = rand();
        // Thickest along the spine, thinning toward the edges of the sweep
        const off = (rand() + rand() - 1) * 1.5;
        const fx = cx + Math.cos(dir) * (t - 0.5) * len - Math.sin(dir) * off;
        const fz = cz + Math.sin(dir) * (t - 0.5) * len + Math.cos(dir) * off;
        if (fx < 2 || fx > worldWidth - 2 || fz < 2 || fz > worldDepth - 2) continue;
        if (!canPlace(fx, fz, 0.05)) continue;
        const y0 = yAt(fx, fz);
        const h = 0.11 + rand() * 0.08;
        stemPos.push(fx, y0, fz, fx + (rand() - 0.5) * 0.03, y0 + h, fz);
        bloomPos.push(fx + (rand() - 0.5) * 0.03, y0 + h, fz);
        bloomCol.push(tint.r, tint.g, tint.b);
      }
    }
    const stemGeo = new BufferGeometry();
    stemGeo.setAttribute("position", new Float32BufferAttribute(stemPos, 3));
    worldRoot.add(new LineSegments(stemGeo, new LineBasicMaterial({
      color: new Color("#4a6236"), transparent: true, opacity: 0.65,
    })));
    const bloomGeo = new BufferGeometry();
    bloomGeo.setAttribute("position", new Float32BufferAttribute(bloomPos, 3));
    bloomGeo.setAttribute("color", new Float32BufferAttribute(bloomCol, 3));
    worldRoot.add(new Points(bloomGeo, new PointsMaterial({
      size: 0.13, sizeAttenuation: true, vertexColors: true,
      // Point sprites are square by default, which at this size reads as a
      // scatter of paper chads rather than flower heads.
      map: bloomSprite, alphaTest: 0.4,
      transparent: true, opacity: 0.95, depthWrite: false,
    })));
  }

  // Butterflies over roughly a third of the beds
  spawnButterflies(worldRoot, bedCenters.filter((_, i) => i % 3 === 0));

  const lampCoords = lampSpots;
  for (const [lx, lz] of lampCoords) {
    const lamp = makeLampPost(rand);
    lamp.position.set(lx, yAt(lx, lz), lz);
    lamp.rotation.y = rand() * Math.PI * 2;
    worldRoot.add(lamp);
    colliders.push({ x: lx, z: lz, r: 0.3 });
  }

  const benchCoords = benchSpots;
  for (const [bx, bz] of benchCoords) {
    const bench = makeBench(rand);
    bench.position.set(bx, yAt(bx, bz), bz);
    worldRoot.add(bench);
    colliders.push({ x: bx, z: bz, r: 0.75 });
    const shadow = makeGroundShadow(0.85);
    shadow.position.set(bx + 0.08, yAt(bx, bz) + 0.004, bz + 0.08);
    worldRoot.add(shadow);
  }

  // Sun and moon are built in celestial.ts and positioned by the day/night
  // cycle; buildWorld just makes the mount points.
  const sunDisc = new Group();
  worldRoot.add(sunDisc);
  const moonDisc = new Group();
  worldRoot.add(moonDisc);

  void new Vector3();
  void makeHillRing;

  // The pond is solid — you walk around water, not across it.
  colliders.push({ x: pondCenter.x, z: pondCenter.z, r: pondCenter.radius * 0.92 });

  // The cliff the waterfall comes down is a wide wall, not a single boulder,
  // so it needs a row of colliders across its face rather than one circle.
  const cliffZ = pondCenter.z - 4.6;
  const cliffHalfWidth = 5.4;
  for (let i = -2; i <= 2; i++) {
    colliders.push({ x: pondCenter.x + (i / 2) * cliffHalfWidth, z: cliffZ, r: 1.9 });
  }

  return { scene, worldRoot, sun, fill, ambient, fog, stars, sunDisc, moonDisc, colliders, canopies };
}
