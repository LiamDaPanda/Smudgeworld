import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";

// Sun and moon are separate bodies riding opposite ends of the same arc, so
// one is always setting as the other rises. Both are drawn flat and facing
// the camera — they read as ink-and-wash drawings pinned to the sky rather
// than as lit spheres.

const INK = new Color("#2b2b2b");

function glowTexture(hex: string, seed: number): CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, hex + "cc");
  g.addColorStop(0.4, hex + "55");
  g.addColorStop(1, hex + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  void seed;
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export interface Celestial {
  group: Group;
  /** Set 0..1 opacity as the body rises and sets. */
  fade: (a: number) => void;
}

export function createSun(): Celestial {
  const group = new Group();

  // Soft halo behind everything
  const halo = new Mesh(
    new PlaneGeometry(9, 9),
    new MeshBasicMaterial({
      map: glowTexture("#f7d98a", 1), transparent: true, opacity: 0.75,
      depthWrite: false, fog: false,
    })
  );
  group.add(halo);

  // Disc. Declared transparent up front — flipping the flag later would
  // force a shader recompile mid-flight.
  const disc = new Mesh(
    new CircleGeometry(1.5, 40),
    new MeshBasicMaterial({ color: new Color("#fbeec2"), fog: false, transparent: true })
  );
  group.add(disc);

  // Wobbly ink rim, drawn as a closed loop of short segments
  const rim: number[] = [];
  const segs = 44;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const r0 = 1.5 * (1 + Math.sin(a0 * 5) * 0.012);
    const r1 = 1.5 * (1 + Math.sin(a1 * 5) * 0.012);
    rim.push(Math.cos(a0) * r0, Math.sin(a0) * r0, 0.01,
             Math.cos(a1) * r1, Math.sin(a1) * r1, 0.01);
  }
  const rimGeo = new BufferGeometry();
  rimGeo.setAttribute("position", new Float32BufferAttribute(rim, 3));
  const rimMat = new LineBasicMaterial({ color: new Color("#c9a24a"), transparent: true, opacity: 0.85, fog: false });
  group.add(new LineSegments(rimGeo, rimMat));

  // Rays: staggered dashes, long-short-long around the disc
  const rays: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const inner = 1.8 + (i % 2) * 0.25;
    const outer = inner + (i % 3 === 0 ? 1.1 : 0.6);
    rays.push(Math.cos(a) * inner, Math.sin(a) * inner, 0.01,
              Math.cos(a) * outer, Math.sin(a) * outer, 0.01);
  }
  const rayGeo = new BufferGeometry();
  rayGeo.setAttribute("position", new Float32BufferAttribute(rays, 3));
  const rayMat = new LineBasicMaterial({ color: new Color("#c9a24a"), transparent: true, opacity: 0.7, fog: false });
  group.add(new LineSegments(rayGeo, rayMat));

  const mats = [halo.material as MeshBasicMaterial, disc.material as MeshBasicMaterial, rimMat, rayMat];
  const base = [0.75, 1, 0.85, 0.7];
  return {
    group,
    fade(a: number) {
      group.visible = a > 0.01;
      mats.forEach((m, i) => { m.opacity = base[i] * a; });
    },
  };
}

export function createMoon(): Celestial {
  const group = new Group();

  const halo = new Mesh(
    new PlaneGeometry(7, 7),
    new MeshBasicMaterial({
      map: glowTexture("#cfd8ea", 2), transparent: true, opacity: 0.5,
      depthWrite: false, fog: false,
    })
  );
  group.add(halo);

  const disc = new Mesh(
    new CircleGeometry(1.15, 36),
    new MeshBasicMaterial({ color: new Color("#eef1f6"), fog: false, transparent: true })
  );
  group.add(disc);

  // Craters — a few pale grey discs across the face
  const craterMats: MeshBasicMaterial[] = [];
  const craters: [number, number, number][] = [
    [-0.35, 0.28, 0.26], [0.3, -0.12, 0.19], [0.1, 0.46, 0.13],
    [-0.15, -0.42, 0.16], [0.5, 0.34, 0.1],
  ];
  for (const [cx, cy, r] of craters) {
    const m = new MeshBasicMaterial({ color: new Color("#d3d9e4"), transparent: true, fog: false });
    const c = new Mesh(new CircleGeometry(r, 16), m);
    c.position.set(cx, cy, 0.005);
    group.add(c);
    craterMats.push(m);
  }

  // Ink rim
  const rim: number[] = [];
  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    rim.push(Math.cos(a0) * 1.15, Math.sin(a0) * 1.15, 0.01,
             Math.cos(a1) * 1.15, Math.sin(a1) * 1.15, 0.01);
  }
  const rimGeo = new BufferGeometry();
  rimGeo.setAttribute("position", new Float32BufferAttribute(rim, 3));
  const rimMat = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5, fog: false });
  group.add(new LineSegments(rimGeo, rimMat));

  const mats = [halo.material as MeshBasicMaterial, disc.material as MeshBasicMaterial, rimMat, ...craterMats];
  const base = [0.5, 1, 0.5, ...craterMats.map(() => 0.9)];
  return {
    group,
    fade(a: number) {
      group.visible = a > 0.01;
      mats.forEach((m, i) => { m.opacity = base[i] * a; });
    },
  };
}
