import {
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";

// The waterfall used to spill from a mound of boulders sitting on flat grass.
// This builds the landform that actually justifies it: a cliff wall the water
// carves down, a massif of peaks rising behind, scree spilling to the pond,
// and mist where the fall lands.

const INK = new Color("#2b2b2b");

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Grey wash with darker striations, used on the cliff face. */
function makeRockTexture(hex: string, seed: number, size = 256): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seededRand(seed);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);

  // Vertical strata — the grain of a cut cliff
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const w = 4 + rand() * 26;
    ctx.fillStyle = `rgba(40,38,34,${0.04 + rand() * 0.09})`;
    ctx.fillRect(x, 0, w, size);
  }
  // Horizontal bedding lines
  ctx.strokeStyle = "rgba(30,28,24,0.16)";
  for (let i = 0; i < 12; i++) {
    const y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 24) {
      ctx.lineTo(x, y + (rand() - 0.5) * 7);
    }
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function outlined(geo: BufferGeometry, fill: Color, opts: { threshold?: number; map?: CanvasTexture; outlineOpacity?: number } = {}) {
  const g = new Group();
  const mesh = new Mesh(geo, new MeshBasicMaterial({ color: fill, map: opts.map }));
  g.add(mesh);
  g.add(new LineSegments(
    new EdgesGeometry(geo, opts.threshold ?? 26),
    new LineBasicMaterial({ color: INK, transparent: true, opacity: opts.outlineOpacity ?? 0.7 })
  ));
  return g;
}

export interface Mountain {
  group: Group;
  mist: Mesh[];
}

/**
 * Build the massif. `cx, cz` is the foot of the cliff (where the waterfall
 * lands); the range recedes away from the camera behind it.
 */
export function createMountain(cx: number, cz: number, cliffWidth: number, cliffHeight: number): Mountain {
  const group = new Group();
  const rand = seededRand(7788);

  // --- Peaks, in three depth bands. Each band further back is paler and
  // bluer, which is what actually creates the sense of distance.
  //
  // Distance matters more than size here: sitting them close made them read
  // as looming triangles crowding the falls rather than as a range on the
  // horizon. They're pushed out to 40-70 units, far enough that the scene fog
  // does the aerial-perspective work for us. ---
  const bands = [
    { z: -34, color: "#8f8a80", count: 5, h: 16, spread: 48 },
    { z: -50, color: "#a3a5ad", count: 6, h: 23, spread: 72 },
    { z: -66, color: "#bcc0c9", count: 6, h: 30, spread: 96 },
  ];
  for (const band of bands) {
    for (let i = 0; i < band.count; i++) {
      const t = (i + 0.5) / band.count;
      const px = cx + (t - 0.5) * band.spread + (rand() - 0.5) * 6;
      const h = band.h * (0.7 + rand() * 0.6);
      const r = h * (0.42 + rand() * 0.18);
      const peak = outlined(
        new ConeGeometry(r, h, 5 + Math.floor(rand() * 3), 2),
        new Color(band.color),
        { threshold: 22, outlineOpacity: 0.45 }
      );
      peak.position.set(px, h / 2 - 1.5, cz + band.z + (rand() - 0.5) * 5);
      peak.rotation.y = rand() * Math.PI;
      group.add(peak);

      // Snow cap on the tallest of the far peaks
      if (h > band.h * 1.05) {
        const capH = h * 0.26;
        const cap = outlined(
          new ConeGeometry(r * 0.29, capH, 6, 1),
          new Color("#eef1f4"),
          { threshold: 24, outlineOpacity: 0.35 }
        );
        cap.position.set(px, h - capH / 2 - 1.5, cz + band.z + 0.02);
        cap.rotation.copy(peak.rotation);
        group.add(cap);
      }
    }
  }

  // --- The cliff wall the waterfall comes down. A wide slab with a notch
  // cut for the water, flanked by buttresses so it reads as carved rock. ---
  // Sized to frame the falls rather than dominate them — at 3.4x the fall
  // width it sat a few units from the camera and filled the whole screen as
  // one dark slab. Lighter, too, so it reads as sunlit rock.
  const rockTex = makeRockTexture("#a29c90", 3311);
  const wallW = cliffWidth * 1.7;
  const wallH = cliffHeight * 1.5;
  const wall = new Mesh(
    new PlaneGeometry(wallW, wallH),
    new MeshBasicMaterial({ map: rockTex, color: new Color("#b3ada0"), side: DoubleSide })
  );
  wall.position.set(cx, wallH / 2 - 0.6, cz - 0.35);
  group.add(wall);

  // Ragged silhouette along the wall top, so it doesn't end in a straight line
  const crest: number[] = [];
  const steps = 30;
  let prevX = cx - wallW / 2;
  let prevY = wallH - 0.6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = cx - wallW / 2 + t * wallW;
    const y = wallH - 0.6 + Math.sin(t * 9) * 0.7 + (rand() - 0.5) * 1.1;
    crest.push(prevX, prevY, cz - 0.34, x, y, cz - 0.34);
    prevX = x; prevY = y;
  }
  const crestGeo = new BufferGeometry();
  crestGeo.setAttribute("position", new Float32BufferAttribute(crest, 3));
  group.add(new LineSegments(crestGeo, new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 })));

  // Buttresses either side of the fall, angled inward. Kept below the wall
  // crest so they frame the water rather than competing with it.
  for (const side of [-1, 1]) {
    const bw = cliffWidth * 0.62;
    const bh = wallH * 0.66;
    const buttress = outlined(
      new ConeGeometry(bw, bh, 4, 1),
      new Color(side < 0 ? "#8a8479" : "#948e82"),
      { threshold: 24, outlineOpacity: 0.6 }
    );
    buttress.position.set(cx + side * (cliffWidth * 1.15), bh / 2 - 0.6, cz + 0.25);
    buttress.rotation.y = Math.PI / 4;
    buttress.scale.set(1, 1, 0.7);
    group.add(buttress);
  }

  // --- Scree: boulders tumbling from the cliff foot toward the water. Kept
  // to a short run so none of them end up floating out in the pond. ---
  for (let i = 0; i < 11; i++) {
    const t = rand();
    // Biased to the flanks: a heap directly in front of the falls just hid
    // the water.
    const side = i % 2 === 0 ? -1 : 1;
    const bx = cx + side * (cliffWidth * 0.55 + rand() * cliffWidth * 0.6);
    const bz = cz + 0.5 + t * 1.6;
    const r = 0.16 + (1 - t) * 0.3 + rand() * 0.14;
    const shade = ["#8d877c", "#9a948a", "#7f7a70"][Math.floor(rand() * 3)];
    const b = outlined(new IcosahedronGeometry(r, 0), new Color(shade), { threshold: 28, outlineOpacity: 0.75 });
    b.position.set(bx, r * 0.55, bz);
    b.rotation.set(rand(), rand() * Math.PI, rand());
    b.scale.set(1.15, 0.8, 1);
    group.add(b);
  }

  // --- Mist at the plunge pool. Soft billboards that drift and pulse. ---
  const mistTex = (() => {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  })();

  const mist: Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const w = 2 + rand() * 2.4;
    const m = new Mesh(
      new PlaneGeometry(w, w * 0.62),
      new MeshBasicMaterial({
        map: mistTex, color: new Color("#f2f5f7"),
        transparent: true, opacity: 0.3, depthWrite: false,
      })
    );
    m.position.set(cx + (rand() - 0.5) * cliffWidth * 1.6, 0.4 + rand() * 1.3, cz + 1.1 + rand() * 1.4);
    m.userData.seed = rand() * 100;
    m.userData.baseY = m.position.y;
    m.userData.baseX = m.position.x;
    group.add(m);
    mist.push(m);
  }

  return { group, mist };
}

/** Drift and breathe the mist. Called each frame. */
export function updateMountain(m: Mountain, time: number) {
  for (const p of m.mist) {
    const s = p.userData.seed as number;
    p.position.y = (p.userData.baseY as number) + Math.sin(time * 0.5 + s) * 0.28;
    p.position.x = (p.userData.baseX as number) + Math.sin(time * 0.23 + s * 1.7) * 0.5;
    const mat = p.material as MeshBasicMaterial;
    mat.opacity = 0.2 + (Math.sin(time * 0.7 + s) * 0.5 + 0.5) * 0.24;
  }
}
