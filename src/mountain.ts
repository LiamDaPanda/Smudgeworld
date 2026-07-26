import {
  BufferGeometry,
  CanvasTexture,
  SRGBColorSpace,
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
  t.colorSpace = SRGBColorSpace;
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
  // Peaks are squashed and sheared per-peak rather than dropped in as upright
  // cones on an even pitch: identical isoceles triangles at regular spacing
  // read as a row of paper tents, not a range.
  const bands = [
    { z: -34, color: "#8f8a80", count: 7, h: 16, spread: 56, outline: 0.5 },
    { z: -50, color: "#a5a7ae", count: 8, h: 23, spread: 82, outline: 0.3 },
    { z: -66, color: "#c2c6ce", count: 8, h: 30, spread: 108, outline: 0.16 },
  ];
  for (const band of bands) {
    for (let i = 0; i < band.count; i++) {
      const t = (i + 0.5) / band.count;
      // Jitter along the ridge is a large fraction of the spacing, so peaks
      // overlap into ridgelines instead of standing apart in a row.
      const px = cx + (t - 0.5) * band.spread + (rand() - 0.5) * (band.spread / band.count) * 1.5;
      const h = band.h * (0.55 + rand() * 0.85);
      const r = h * (0.4 + rand() * 0.3);
      const peak = outlined(
        new ConeGeometry(r, h, 5 + Math.floor(rand() * 3), 2),
        new Color(band.color),
        { threshold: 22, outlineOpacity: band.outline }
      );
      peak.position.set(px, h / 2 - 1.5, cz + band.z + (rand() - 0.5) * 9);
      peak.rotation.y = rand() * Math.PI;
      // Lean and stretch: a peak wider than it is tall reads as a shoulder,
      // a leaning one as a weathered horn.
      peak.rotation.z = (rand() - 0.5) * 0.22;
      peak.scale.set(0.8 + rand() * 0.9, 1, 0.8 + rand() * 0.5);
      group.add(peak);

      // Snow cap on the tallest of the far peaks
      if (h > band.h * 1.15) {
        const capH = h * 0.26;
        const cap = outlined(
          new ConeGeometry(r * 0.29, capH, 6, 1),
          new Color("#eef1f4"),
          { threshold: 24, outlineOpacity: 0.3 }
        );
        cap.position.set(px, h - capH / 2 - 1.5, cz + band.z + 0.02);
        cap.rotation.copy(peak.rotation);
        cap.scale.copy(peak.scale);
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

  // A solid mass behind the wall first. The wall itself is a plane, and a
  // plane's straight top and sides seen against open sky is exactly what made
  // the falls look like a signboard propped up in a field. With a bigger,
  // darker landform behind it, the wall reads as a face cut into rock and
  // never shows a silhouette of its own.
  const backing = outlined(
    new ConeGeometry(wallW * 1.25, wallH * 1.7, 6, 1),
    new Color("#8b8578"),
    { threshold: 26, outlineOpacity: 0.45 }
  );
  backing.position.set(cx, (wallH * 1.7) / 2 - 1.6, cz - wallW * 0.75);
  backing.scale.set(1, 1, 0.85);
  group.add(backing);

  const wall = new Mesh(
    new PlaneGeometry(wallW, wallH),
    // Darker than the rock around it: this is the shaded inside of a notch,
    // and lighting it like a sunlit face is what made it pop forward.
    new MeshBasicMaterial({ map: rockTex, color: new Color("#9b9488"), side: DoubleSide })
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

  // Buttresses either side of the fall, angled inward. They deliberately
  // straddle the wall's vertical edges: left to itself the wall is a plane,
  // and a plane's two straight sides against open sky is what made it read as
  // a slab propped up in a field.
  for (const side of [-1, 1]) {
    const bw = cliffWidth * 0.72;
    // Taller than the wall on purpose, so the crest of the notch sits between
    // two rock masses rather than against the sky.
    const bh = wallH * 1.16;
    const buttress = outlined(
      new ConeGeometry(bw, bh, 4, 1),
      new Color(side < 0 ? "#8a8479" : "#948e82"),
      { threshold: 24, outlineOpacity: 0.6 }
    );
    buttress.position.set(cx + side * (wallW / 2), bh / 2 - 0.6, cz + 0.25);
    buttress.rotation.y = Math.PI / 4;
    buttress.scale.set(1, 1, 0.7);
    group.add(buttress);

    // An outer shoulder beyond each buttress, running the cliff line down to
    // ground level so the massif meets the grass on a slope, not a step.
    const sh = wallH * 0.42;
    const shoulder = outlined(
      new ConeGeometry(cliffWidth * 1.1, sh, 5, 1),
      new Color(side < 0 ? "#979183" : "#8f897d"),
      { threshold: 26, outlineOpacity: 0.45 }
    );
    shoulder.position.set(cx + side * (wallW * 0.82), sh / 2 - 0.9, cz - 0.6);
    shoulder.rotation.y = rand() * Math.PI;
    shoulder.scale.set(1, 1, 0.8);
    group.add(shoulder);
  }

  // Talus along the foot of the wall — a rubble line so the cliff doesn't
  // meet flat grass along a ruler-straight horizontal edge.
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const bx = cx + (t - 0.5) * wallW * 1.5;
    // Thinned in front of the falls so the plunge pool stays visible.
    if (Math.abs(bx - cx) < cliffWidth * 0.45 && rand() < 0.75) continue;
    const r = 0.28 + rand() * 0.45;
    const b = outlined(new IcosahedronGeometry(r, 0), new Color(["#8d877c", "#9a948a", "#847e73"][Math.floor(rand() * 3)]),
                       { threshold: 28, outlineOpacity: 0.6 });
    b.position.set(bx, r * 0.35 - 0.1, cz + 0.1 + rand() * 0.5);
    b.rotation.set(rand(), rand() * Math.PI, rand());
    b.scale.set(1.3, 0.62, 1);
    group.add(b);
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
