// Authored tree models.
//
// These used to be a cylinder with an icosahedron balanced on top. The problem
// wasn't the shading, it was the silhouette: a cylinder reads as a cylinder and
// a subdivided sphere reads as a ball, and no amount of watercolour texture on
// a lollipop makes it a tree.
//
// What's here instead is real geometry. A trunk is a lofted tube along a spine
// that leans and kinks, swelling into a root flare where it meets the ground.
// Boughs fork off it and taper to points. A crown is a stack of rings on an
// authored radius profile — narrow at the base, bulging, cut flat and dished
// on top — built from a few big irregular facets rather than a smooth sphere.
//
// Each tree comes out as ONE geometry rather than a Group of six or seven
// primitives, so the better model is also cheaper to draw than what it
// replaced.

import { Color } from "three";
import { blob, MeshBuilder, place, resample, tube, type V3 } from "./modeling.ts";

export interface TreeParts {
  /** Trunk, boughs and roots — one merged bark-coloured mesh. */
  wood: MeshBuilder;
  /** Foliage masses — one merged mesh per tone. */
  leaf: MeshBuilder[];
  /** Where the crown sits, for shadow and camera-fade bookkeeping. */
  crownY: number;
  crownR: number;
}

const TAU = Math.PI * 2;

/**
 * A trunk that leans, kinks slightly, and flares into roots at the base.
 *
 * The root flare is the single detail that most stops a trunk reading as a
 * pipe pushed into the ground: real trunks get wider in the last few
 * centimetres, and buttress into two or three ridges.
 */
function trunk(
  rand: () => number,
  height: number,
  baseR: number,
  lean: number,
  sides: number
): { mb: MeshBuilder; top: V3; dir: V3 } {
  const leanDir = rand() * TAU;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;
  // A slight S: trunks rarely rise straight, and a single kink at a third
  // height reads as growth toward light.
  const kick = (rand() - 0.5) * 0.5;
  const spine = resample([
    [0, 0, 0],
    [lx * 0.18 + kick * 0.1, height * 0.33, lz * 0.18],
    [lx * 0.55, height * 0.68, lz * 0.55],
    [lx, height, lz],
  ], 9);

  const mb = tube(
    spine,
    (t) => {
      // Root flare in the bottom eighth, then a steady taper.
      const flare = t < 0.12 ? 1 + (0.12 - t) * 7.5 : 1;
      return baseR * flare * (1 - t * 0.55);
    },
    {
      sides,
      roll: (t) => t * 0.6,
      // Low-frequency radius variation so the bark has flat planes down it
      // rather than being a perfect circle in section.
      wobble: (t, k) => 1 + Math.sin(k * 2.3 + t * 3.1) * 0.09,
      capStart: true,
    }
  );

  // Root buttresses: short flattened cones splaying out at the foot.
  const roots = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * TAU + rand() * 0.7;
    const reach = baseR * (1.7 + rand() * 1.3);
    const rSpine = resample([
      [0, baseR * 0.9, 0],
      [Math.cos(a) * reach * 0.5, baseR * 0.35, Math.sin(a) * reach * 0.5],
      [Math.cos(a) * reach, -0.02, Math.sin(a) * reach],
    ], 5);
    mb.merge(tube(rSpine, (t) => baseR * 0.5 * (1 - t * 0.75), { sides: 5, tipEnd: true }));
  }

  const tip = spine[spine.length - 1];
  return { mb, top: tip, dir: [lx / (height || 1), 1, lz / (height || 1)] };
}

/** A bough: forks off the trunk, bends upward, tapers to a point. */
function bough(rand: () => number, from: V3, angle: number, length: number, r: number): { mb: MeshBuilder; end: V3 } {
  const out: V3 = [Math.cos(angle), 0, Math.sin(angle)];
  const rise = 0.55 + rand() * 0.5;
  const spine = resample([
    from,
    [from[0] + out[0] * length * 0.4, from[1] + length * rise * 0.35, from[2] + out[2] * length * 0.4],
    [from[0] + out[0] * length * 0.8, from[1] + length * rise * 0.8, from[2] + out[2] * length * 0.8],
    [from[0] + out[0] * length, from[1] + length * rise * 1.15, from[2] + out[2] * length],
  ], 7);
  const mb = tube(spine, (t) => r * (1 - t * 0.8), { sides: 5, tipEnd: true });
  return { mb, end: spine[spine.length - 1] };
}

/**
 * A foliage mass. The profile is the whole point: narrow where it meets the
 * branch, widest a third of the way up, and flattened with a slight dish on
 * top, which is what a broadleaf canopy actually does under its own weight.
 */
function canopyMass(rand: () => number, r: number, squash = 1): MeshBuilder {
  // Taller than it is wide. The first version was flatter than a sphere and
  // every crown came out a green table balanced on a stick — a canopy has to
  // have volume from the side or the tree reads as scaffolding.
  const h = r * 1.25 * squash;
  const profile: [number, number][] = [
    [0, -h],
    [r * 0.5, -h * 0.82],
    [r * 0.86, -h * 0.46],
    [r * 1.0, -h * 0.05],
    [r * 0.97, h * 0.3],
    [r * 0.78, h * 0.58],
    [r * 0.44, h * 0.82],
    [0, h],
  ];
  return blob(profile, 9, rand, 0.24);
}

/** A conifer tier: a splayed, drooping skirt rather than a smooth cone. */
function coniferTier(rand: () => number, r: number, h: number): MeshBuilder {
  const profile: [number, number][] = [
    [r * 0.12, h * 0.55],
    [r * 0.5, h * 0.18],
    [r * 0.86, -h * 0.1],
    [r, -h * 0.3],      // widest point is below the tier's middle — it droops
    [r * 0.72, -h * 0.42],
    [0, -h * 0.5],
  ];
  return blob(profile, 9, rand, 0.16);
}

export type TreeKind = "mixed" | "birch" | "snag" | "willow" | "ornamental" | "conifer";

export const LEAF_TONES = ["#7f9b62", "#8ea86e", "#6f8a55", "#9cae76"];
export const BLOSSOM_TONES = ["#e0b3c2", "#efdde2", "#e2c3d6"];

export function buildTree(rand: () => number, kind: TreeKind): TreeParts {
  const wood = new MeshBuilder();
  const leafA = new MeshBuilder();
  const leafB = new MeshBuilder();

  if (kind === "conifer") {
    const h = 0.6 + rand() * 0.35;
    const t = trunk(rand, h, 0.075, 0.04, 6);
    wood.merge(t.mb);
    // A bare spar running up through the tiers, visible between them.
    const spar = resample([[0, h * 0.6, 0], [0.02, h + 3.1, 0]], 5);
    wood.merge(tube(spar, (u) => 0.055 * (1 - u * 0.85), { sides: 5, tipEnd: true }));

    const tiers = 5 + Math.floor(rand() * 3);
    const top = h + 2.9 + rand() * 0.8;
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1);
      const y = h * 0.5 + f * (top - h * 0.5);
      // Widest near the bottom, narrowing to the leader.
      const r = (0.95 - f * 0.72) * (0.85 + rand() * 0.3);
      const tier = coniferTier(rand, r, 0.85 - f * 0.35);
      (f < 0.5 ? leafA : leafB).merge(place(tier, rand() * TAU, [0, y, 0]));
    }
    return { wood, leaf: [leafA, leafB], crownY: h + 1.4, crownR: 1.0 };
  }

  if (kind === "snag") {
    // A dead tree is all silhouette: a broken trunk and a few bare forks.
    const h = 1.5 + rand() * 1.4;
    const t = trunk(rand, h, 0.12 + rand() * 0.05, 0.22 + rand() * 0.2, 6);
    wood.merge(t.mb);
    const forks = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < forks; i++) {
      const a = (i / forks) * TAU + rand() * 0.8;
      const from: V3 = [t.top[0] * 0.7, h * (0.45 + rand() * 0.5), t.top[2] * 0.7];
      const limb = bough(rand, from, a, 0.35 + rand() * 0.5, 0.05 + rand() * 0.03);
      wood.merge(limb.mb);
      // Half of them fork again — that's what makes a snag read as dead wood
      // rather than as a hat stand.
      if (rand() < 0.55) {
        wood.merge(bough(rand, limb.end, a + (rand() - 0.5) * 1.4, 0.22 + rand() * 0.3, 0.028).mb);
      }
    }
    return { wood, leaf: [leafA, leafB], crownY: h * 0.8, crownR: 0.5 };
  }

  if (kind === "willow") {
    const h = 1.1 + rand() * 0.5;
    const t = trunk(rand, h, 0.19 + rand() * 0.06, 0.12, 7);
    wood.merge(t.mb);
    const boughs = 4 + Math.floor(rand() * 3);
    const ends: V3[] = [];
    for (let i = 0; i < boughs; i++) {
      const a = (i / boughs) * TAU + rand() * 0.5;
      const b = bough(rand, [t.top[0], h * 0.85, t.top[2]], a, 0.8 + rand() * 0.6, 0.07);
      wood.merge(b.mb);
      ends.push(b.end);
    }
    // Foliage hangs off the bough ends and droops, rather than sitting as a
    // ball above them.
    for (const e of ends) {
      const r = 0.72 + rand() * 0.32;
      const mass = canopyMass(rand, r, 1.15);
      (rand() < 0.5 ? leafA : leafB).merge(place(mass, rand() * TAU, [e[0], e[1] - r * 0.35, e[2]]));
    }
    return { wood, leaf: [leafA, leafB], crownY: h + 0.6, crownR: 1.5 };
  }

  if (kind === "birch") {
    const h = 2.4 + rand() * 1.1;
    const t = trunk(rand, h, 0.075 + rand() * 0.02, 0.18, 6);
    wood.merge(t.mb);
    const boughs = 2 + Math.floor(rand() * 2);
    const ends: V3[] = [[t.top[0], h, t.top[2]]];
    for (let i = 0; i < boughs; i++) {
      const a = rand() * TAU;
      const b = bough(rand, [t.top[0] * 0.85, h * 0.78, t.top[2] * 0.85], a, 0.45 + rand() * 0.35, 0.045);
      wood.merge(b.mb);
      ends.push(b.end);
    }
    // Birch crowns are small, high and open — a light tree.
    for (const e of ends) {
      const r = 0.66 + rand() * 0.3;
      (rand() < 0.5 ? leafA : leafB).merge(
        place(canopyMass(rand, r, 0.95), rand() * TAU, [e[0] * 0.8, e[1] + r * 0.4, e[2] * 0.8])
      );
    }
    return { wood, leaf: [leafA, leafB], crownY: h + 0.3, crownR: 1.0 };
  }

  if (kind === "ornamental") {
    const h = 1.0 + rand() * 0.45;
    const t = trunk(rand, h, 0.075 + rand() * 0.02, 0.06, 6);
    wood.merge(t.mb);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rand() * 0.6;
      wood.merge(bough(rand, [t.top[0], h * 0.9, t.top[2]], a, 0.22 + rand() * 0.14, 0.04).mb);
    }
    // Pruned: one tight rounded mass, wider than it is tall.
    const r = 0.6 + rand() * 0.25;
    leafA.merge(place(canopyMass(rand, r, 0.78), rand() * TAU, [t.top[0], h + r * 0.42, t.top[2]]));
    return { wood, leaf: [leafA, leafB], crownY: h + r * 0.4, crownR: r * 1.1 };
  }

  // Deciduous: a real branching structure with foliage sitting on the ends.
  const h = 1.9 + rand() * 1.1;
  const t = trunk(rand, h, 0.11 + rand() * 0.045, 0.16 + rand() * 0.14, 7);
  wood.merge(t.mb);

  const boughs = 3 + Math.floor(rand() * 2);
  const tips: V3[] = [];
  const base: V3 = [t.top[0] * 0.9, h * 0.82, t.top[2] * 0.9];
  for (let i = 0; i < boughs; i++) {
    const a = (i / boughs) * TAU + rand() * 0.7;
    const b = bough(rand, base, a, 0.34 + rand() * 0.3, 0.062);
    wood.merge(b.mb);
    tips.push(b.end);
    if (rand() < 0.5) {
      const b2 = bough(rand, b.end, a + (rand() - 0.5) * 1.2, 0.3 + rand() * 0.25, 0.035);
      wood.merge(b2.mb);
      tips.push(b2.end);
    }
  }
  // A leader continuing past the fork, so the crown isn't a flat plate.
  tips.push([t.top[0], h + 0.35, t.top[2]]);

  // Foliage goes on in a few big overlapping masses rather than one per
  // branch tip. Small masses spread across a wide fork read as separate
  // objects; large overlapping ones fuse into a single crown silhouette.
  let maxR = 0;
  const picks = tips.filter((_, i) => i % 2 === 0 || rand() < 0.5).slice(0, 4);
  for (const p of picks.length ? picks : tips.slice(0, 3)) {
    const r = 0.85 + rand() * 0.45;
    maxR = Math.max(maxR, Math.hypot(p[0], p[2]) + r);
    (rand() < 0.5 ? leafA : leafB).merge(
      place(canopyMass(rand, r), rand() * TAU, [p[0] * 0.75, p[1] + r * 0.45, p[2] * 0.75])
    );
  }
  return { wood, leaf: [leafA, leafB], crownY: h + 0.7, crownR: Math.max(1.1, maxR) };
}

export const TRUNK_TONES: Record<string, string> = {
  birch: "#d6d1bd",
  snag: "#9a9184",
  willow: "#7d6a52",
  ornamental: "#8a7359",
  conifer: "#6f5c46",
  mixed: "#7d6a51",
};

export function leafTone(kind: TreeKind, blossom: boolean, i: number): Color {
  if (blossom) return new Color(BLOSSOM_TONES[i % BLOSSOM_TONES.length]);
  if (kind === "conifer") return new Color(i === 0 ? "#4e6b41" : "#5c7a49");
  if (kind === "birch") return new Color(i === 0 ? "#9cb473" : "#adc184");
  if (kind === "willow") return new Color(i === 0 ? "#8ba55f" : "#9cb271");
  return new Color(LEAF_TONES[i % LEAF_TONES.length]);
}
