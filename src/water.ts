import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
} from "three";

const INK = new Color("#2b2b2b");

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Blue watercolor texture with denser splotches near the center (deeper water).
function makePondTexture(size = 512): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seededRand(1200);

  const base = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  base.addColorStop(0, withAlpha("#6a94b0", 0.85));
  base.addColorStop(0.6, withAlpha("#89a8bd", 0.75));
  base.addColorStop(1, withAlpha("#b8c4c8", 0));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Extra darker deep-water splotches near the center
  for (let i = 0; i < 24; i++) {
    const cx = size / 2 + (rand() - 0.5) * size * 0.4;
    const cy = size / 2 + (rand() - 0.5) * size * 0.4;
    const r = 20 + rand() * 60;
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, withAlpha("#3f6a86", 0.35));
    g.addColorStop(1, withAlpha("#3f6a86", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Sparkle highlights
  for (let i = 0; i < 40; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 4 + rand() * 10;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha("#f4efe6", 0.55));
    g.addColorStop(1, withAlpha("#f4efe6", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const pondTex = makePondTexture();

interface Ripple {
  ring: Mesh;
  born: number;
  duration: number;
  seed: number;
}

export interface Pond {
  group: Group;
  center: [number, number];
  radius: number;
  ripples: Ripple[];
}

export function createPond(cx: number, cz: number, radius: number): Pond {
  const group = new Group();

  // Water disc
  const disc = new Mesh(
    new CircleGeometry(radius, 48),
    new MeshBasicMaterial({ map: pondTex, color: new Color("#a5c0d0"), transparent: true, opacity: 0.9, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(cx, 0.01, cz);
  group.add(disc);

  // Wobbly ink outline around the pond rim
  const rimPos: number[] = [];
  const segs = 64;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const r = radius * (0.98 + Math.sin(a * 7) * 0.02);
    rimPos.push(cx + Math.cos(a) * r, 0.012, cz + Math.sin(a) * r);
    if (i > 0 && i < segs) rimPos.push(cx + Math.cos(a) * r, 0.012, cz + Math.sin(a) * r);
  }
  const rimGeo = new BufferGeometry();
  rimGeo.setAttribute("position", new Float32BufferAttribute(rimPos, 3));
  group.add(new LineSegments(rimGeo, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 })));

  // Horizontal ink hatch strokes on the surface for water texture
  const hatchPos: number[] = [];
  for (let i = 0; i < 80; i++) {
    const r = Math.sqrt(Math.random()) * radius * 0.85;
    const ang = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    const len = 0.12 + Math.random() * 0.25;
    hatchPos.push(x - len / 2, 0.018, z, x + len / 2, 0.018, z);
  }
  const hatchGeo = new BufferGeometry();
  hatchGeo.setAttribute("position", new Float32BufferAttribute(hatchPos, 3));
  group.add(new LineSegments(hatchGeo, new LineBasicMaterial({ color: new Color("#2b2b2b"), transparent: true, opacity: 0.45 })));

  // Reeds around one side
  const reedPos: number[] = [];
  const rand = seededRand(1400);
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * 1.1 + rand() * Math.PI * 0.8;
    const r = radius * (1 + rand() * 0.15);
    const rx = cx + Math.cos(a) * r;
    const rz = cz + Math.sin(a) * r;
    const h = 0.25 + rand() * 0.25;
    reedPos.push(rx, 0, rz, rx + (rand() - 0.5) * 0.05, h, rz + (rand() - 0.5) * 0.05);
  }
  const reedGeo = new BufferGeometry();
  reedGeo.setAttribute("position", new Float32BufferAttribute(reedPos, 3));
  group.add(new LineSegments(reedGeo, new LineBasicMaterial({ color: new Color("#4a6a3a"), transparent: true, opacity: 0.85 })));

  return { group, center: [cx, cz], radius, ripples: [] };
}

export function updatePond(pond: Pond, time: number) {
  // Occasionally spawn a ripple at a random point on the pond
  const rand = Math.random;
  if (rand() < 0.03) {
    const a = rand() * Math.PI * 2;
    const r = pond.radius * 0.7 * Math.sqrt(rand());
    const cx = pond.center[0] + Math.cos(a) * r;
    const cz = pond.center[1] + Math.sin(a) * r;
    const ring = new Mesh(
      new RingGeometry(0.05, 0.09, 24),
      new MeshBasicMaterial({ color: new Color("#4a6a86"), transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.015, cz);
    pond.group.add(ring);
    pond.ripples.push({ ring, born: time, duration: 1.6, seed: rand() * 100 });
  }

  for (let i = pond.ripples.length - 1; i >= 0; i--) {
    const r = pond.ripples[i];
    const age = (time - r.born) / r.duration;
    if (age >= 1) {
      pond.group.remove(r.ring);
      r.ring.geometry.dispose();
      (r.ring.material as MeshBasicMaterial).dispose();
      pond.ripples.splice(i, 1);
      continue;
    }
    const scale = 1 + age * 12;
    r.ring.scale.set(scale, scale, 1);
    (r.ring.material as MeshBasicMaterial).opacity = 0.9 * (1 - age);
  }
}

// Fish — small elongated shapes that drift in loops on the pond surface.
// Each fish has a body (thin ellipse) plus a triangular tail; they lean into
// their turn as they swim.
export interface Fish {
  group: Group;
  center: [number, number];
  radius: number;
  height: number;
  phase: number;
  speed: number;
}

function makeFishBody(fillHex: string): Group {
  const g = new Group();
  const bodyLen = 0.45;
  const bodyW = 0.13;
  // Body triangle strip approximation: two triangles making a rhombus (fish-like)
  const geo = new BufferGeometry();
  const verts = new Float32Array([
    -bodyLen / 2, 0, 0,
     bodyLen * 0.15, 0,  bodyW,
     bodyLen * 0.15, 0, -bodyW,
     bodyLen / 2, 0, 0,
  ]);
  const idx = [0, 1, 2, 1, 3, 2];
  geo.setAttribute("position", new BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const body = new Mesh(geo, new MeshBasicMaterial({ color: new Color(fillHex), side: DoubleSide }));
  g.add(body);

  // Outline
  const outline = new BufferGeometry();
  outline.setAttribute("position", new Float32BufferAttribute([
    -bodyLen / 2, 0.001, 0,   bodyLen * 0.15, 0.001,  bodyW,
     bodyLen * 0.15, 0.001,  bodyW,   bodyLen / 2, 0.001, 0,
     bodyLen / 2, 0.001, 0,   bodyLen * 0.15, 0.001, -bodyW,
     bodyLen * 0.15, 0.001, -bodyW,  -bodyLen / 2, 0.001, 0,
  ], 3));
  g.add(new LineSegments(outline, new LineBasicMaterial({ color: INK })));

  // Tail
  const tailLen = 0.14;
  const tailGeo = new BufferGeometry();
  tailGeo.setAttribute("position", new Float32BufferAttribute([
    -bodyLen / 2, 0.001, 0,
    -bodyLen / 2 - tailLen, 0.001, tailLen * 0.6,
    -bodyLen / 2 - tailLen, 0.001, -tailLen * 0.6,
  ], 3));
  tailGeo.setIndex([0, 1, 2]);
  const tail = new Mesh(tailGeo, new MeshBasicMaterial({ color: new Color(fillHex), side: DoubleSide }));
  g.add(tail);

  const tailOutline = new BufferGeometry();
  tailOutline.setAttribute("position", new Float32BufferAttribute([
    -bodyLen / 2, 0.002, 0,   -bodyLen / 2 - tailLen, 0.002, tailLen * 0.6,
    -bodyLen / 2 - tailLen, 0.002, tailLen * 0.6,   -bodyLen / 2 - tailLen, 0.002, -tailLen * 0.6,
    -bodyLen / 2 - tailLen, 0.002, -tailLen * 0.6,  -bodyLen / 2, 0.002, 0,
  ], 3));
  g.add(new LineSegments(tailOutline, new LineBasicMaterial({ color: INK })));

  return g;
}

export function createFish(pond: Pond, count: number): Fish[] {
  const colors = ["#e08c50", "#d4a94a", "#c0605a", "#dcd8cc"];
  const rand = seededRand(1500);
  const fish: Fish[] = [];
  for (let i = 0; i < count; i++) {
    const fishBody = makeFishBody(colors[i % colors.length]);
    const g = new Group();
    g.add(fishBody);
    pond.group.add(g);
    fish.push({
      group: g,
      center: [pond.center[0] + (rand() - 0.5) * pond.radius * 0.4, pond.center[1] + (rand() - 0.5) * pond.radius * 0.4],
      radius: pond.radius * (0.25 + rand() * 0.35),
      height: 0.02 + rand() * 0.005,
      phase: rand() * Math.PI * 2,
      speed: (0.35 + rand() * 0.35) * (i % 2 ? 1 : -1),
    });
  }
  return fish;
}

export function updateFish(fish: Fish[], time: number) {
  for (const f of fish) {
    const a = f.phase + time * f.speed;
    const x = f.center[0] + Math.cos(a) * f.radius;
    const z = f.center[1] + Math.sin(a) * f.radius;
    f.group.position.set(x, f.height, z);
    // Face the direction of motion (derivative of the circular path)
    const tangent = a + Math.PI / 2 * Math.sign(f.speed);
    f.group.rotation.y = -tangent;
  }
}

// Waterfall — a stone slab with animated vertical water strands and a splash
// at the base. The strands' Y positions cycle downward; when they hit the base
// they reset to the top with a splash pulse.
export interface Waterfall {
  group: Group;
  strands: LineSegments;
  strandData: { x: number; z: number; phase: number; length: number }[];
  splashOpacity: { mat: LineBasicMaterial; nextPulse: number };
  base: [number, number];
  height: number;
  width: number;
}

export function createWaterfall(cx: number, cz: number, width: number, height: number): Waterfall {
  const group = new Group();

  // Stone slab (rock cliff) behind the water
  const rock = new Mesh(
    new PlaneGeometry(width * 1.4, height * 1.1),
    new MeshBasicMaterial({ color: new Color("#8a8073") })
  );
  rock.position.set(cx, height / 2, cz - 0.05);
  group.add(rock);

  // Sketchy stone outline
  const rockOutline = new BufferGeometry();
  const rw = width * 0.7;
  const rh = height * 0.55;
  const outlinePts: number[] = [];
  const segs = 20;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = t * (rh * 2);
    const dx = Math.sin(t * 6 + 0.7) * 0.15;
    outlinePts.push(cx - rw + dx, y, cz - 0.04, cx - rw + dx, y + (rh * 2) / segs, cz - 0.04);
    outlinePts.push(cx + rw - dx, y, cz - 0.04, cx + rw - dx, y + (rh * 2) / segs, cz - 0.04);
  }
  rockOutline.setAttribute("position", new Float32BufferAttribute(outlinePts, 3));
  group.add(new LineSegments(rockOutline, new LineBasicMaterial({ color: new Color("#4a463d"), transparent: true, opacity: 0.85 })));

  // Water backing plane so strands read as water, not just floating lines
  const water = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({ color: new Color("#b8d0e0"), transparent: true, opacity: 0.55, depthWrite: false })
  );
  water.position.set(cx, height / 2, cz - 0.02);
  group.add(water);

  // Water strands — many short vertical line segments that we animate each frame
  const strandCount = 26;
  const strandData: { x: number; z: number; phase: number; length: number }[] = [];
  for (let i = 0; i < strandCount; i++) {
    const x = cx - width / 2 + ((i + 0.5) / strandCount) * width;
    strandData.push({
      x,
      z: cz - 0.015,
      phase: Math.random(),
      length: 0.35 + Math.random() * 0.2,
    });
  }
  const strandGeo = new BufferGeometry();
  strandGeo.setAttribute("position", new BufferAttribute(new Float32Array(strandCount * 6), 3));
  const strands = new LineSegments(strandGeo, new LineBasicMaterial({ color: new Color("#eaf3f6"), transparent: true, opacity: 0.9 }));
  group.add(strands);

  // Splash pool at the base — a small ellipse of foam
  const splashMat = new LineBasicMaterial({ color: new Color("#f4efe6"), transparent: true, opacity: 0.7 });
  const splashPos: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI;
    const r = width * 0.45;
    const rx = cx + Math.cos(a) * r;
    const ry = 0.05 + Math.sin(a) * 0.05;
    const rz = cz + 0.35;
    splashPos.push(rx, ry, rz, rx + (Math.random() - 0.5) * 0.08, ry + Math.random() * 0.1, rz + (Math.random() - 0.5) * 0.08);
  }
  const splashGeo = new BufferGeometry();
  splashGeo.setAttribute("position", new Float32BufferAttribute(splashPos, 3));
  const splash = new LineSegments(splashGeo, splashMat);
  group.add(splash);

  return {
    group,
    strands,
    strandData,
    splashOpacity: { mat: splashMat, nextPulse: 0 },
    base: [cx, cz],
    height,
    width,
  };
}

export function updateWaterfall(wf: Waterfall, time: number) {
  const pos = wf.strands.geometry.attributes.position as BufferAttribute;
  const arr = pos.array as Float32Array;
  const speed = 2.0; // world units per second falling
  for (let i = 0; i < wf.strandData.length; i++) {
    const s = wf.strandData[i];
    // Cycle each strand from height down to 0, then wrap
    const t = ((time + s.phase * 5) * speed) % wf.height;
    const yTop = wf.height - t;
    const yBottom = Math.max(0, yTop - s.length);
    const o = i * 6;
    arr[o + 0] = s.x + (Math.sin(time * 5 + i) * 0.02);
    arr[o + 1] = yTop;
    arr[o + 2] = s.z;
    arr[o + 3] = s.x + (Math.sin(time * 5 + i + 0.5) * 0.02);
    arr[o + 4] = yBottom;
    arr[o + 5] = s.z;
  }
  pos.needsUpdate = true;

  // Pulse the splash so it visually breathes with the falling water
  const pulse = 0.55 + Math.sin(time * 6) * 0.15;
  wf.splashOpacity.mat.opacity = pulse;
}
