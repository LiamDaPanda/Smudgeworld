// A small modelling toolkit, so the world can be built from authored shapes
// instead of assembled from Three's primitives.
//
// The problem with primitives is silhouette. A trunk made from a cylinder is a
// cylinder no matter what texture goes on it; a crown made from an icosahedron
// is a ball. Shading can't fix an outline. What low-poly art actually needs is
// control over where the vertices go — a trunk that flares into roots and
// leans, a crown with a flat top and an undercut, a rock with three big
// facets and one sharp corner.
//
// Everything here builds *non-indexed* triangles on purpose: with no shared
// vertices, `computeVertexNormals` gives one normal per face, which is exactly
// the flat faceted shading the style wants. It also means a whole tree can be
// one geometry — one draw call instead of the eight or nine a group of
// primitives cost.

import { BufferGeometry, Float32BufferAttribute } from "three";

export type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export { add as vadd, sub as vsub, mul as vmul, norm as vnorm };

/** Accumulates raw triangles and hands back a flat-shaded geometry. */
export class MeshBuilder {
  private pos: number[] = [];

  tri(a: V3, b: V3, c: V3) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3) {
    this.tri(a, b, c);
    this.tri(a, c, d);
    return this;
  }

  /** Skin between two loops of the same length. */
  band(lower: V3[], upper: V3[], closed = true) {
    const n = lower.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      this.quad(lower[i], lower[j], upper[j], upper[i]);
    }
    return this;
  }

  /** Fan a loop to a single point — a cone tip, a rounded end. */
  fan(loop: V3[], apex: V3, flip = false) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(loop[j], loop[i], apex);
      else this.tri(loop[i], loop[j], apex);
    }
    return this;
  }

  /** Close a loop with a flat face through its centroid. */
  cap(loop: V3[], flip = false) {
    let c: V3 = [0, 0, 0];
    for (const p of loop) c = add(c, p);
    return this.fan(loop, mul(c, 1 / loop.length), flip);
  }

  /** Merge another builder's triangles, optionally offset. */
  merge(other: MeshBuilder, offset?: V3) {
    if (!offset) {
      this.pos.push(...other.pos);
    } else {
      const [ox, oy, oz] = offset;
      for (let i = 0; i < other.pos.length; i += 3) {
        this.pos.push(other.pos[i] + ox, other.pos[i + 1] + oy, other.pos[i + 2] + oz);
      }
    }
    return this;
  }

  get triangleCount() { return this.pos.length / 9; }

  /**
   * Signed volume of the triangle soup. Positive when the winding faces
   * outward, negative when it's inside out.
   */
  private signedVolume(): number {
    let v = 0;
    const p = this.pos;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2];
      const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
      const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
      v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    return v / 6;
  }

  /** Reverse every triangle, turning the surface inside out. */
  flip() {
    const p = this.pos;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t;
      }
    }
    return this;
  }

  geometry(): BufferGeometry {
    // Auto-correct the winding. Getting it right by hand means tracking, for
    // every helper, whether the profile runs bottom-to-top and whether the
    // ring angles run clockwise in the local frame — and one wrong combination
    // renders a closed shape as its own interior. (That's exactly what
    // happened: every lathed hat came out a hollow bowl, because front faces
    // were being culled and the inside was all that was left.)
    //
    // The volume of a closed mesh answers the question directly, so ask it.
    // Open shells have a volume near zero relative to their bounding box, and
    // are left alone.
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.pos.length; i += 3) {
      minX = Math.min(minX, this.pos[i]); maxX = Math.max(maxX, this.pos[i]);
      minY = Math.min(minY, this.pos[i + 1]); maxY = Math.max(maxY, this.pos[i + 1]);
      minZ = Math.min(minZ, this.pos[i + 2]); maxZ = Math.max(maxZ, this.pos[i + 2]);
    }
    const bbox = Math.max(1e-9, (maxX - minX) * (maxY - minY) * (maxZ - minZ));
    const vol = this.signedVolume();
    if (vol < 0 && Math.abs(vol) > bbox * 0.02) this.flip();

    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals(); // one normal per face — flat, faceted shading
    return g;
  }
}

/**
 * A moving reference frame along a spine, by parallel transport.
 *
 * Naively orienting each ring to its own tangent makes a bending limb twist
 * wildly wherever the curve turns through vertical. Carrying the previous
 * frame forward and only rotating it by the change in tangent keeps a branch
 * from corkscrewing along its own length.
 */
function frames(spine: V3[]): { t: V3; n: V3; b: V3 }[] {
  const out: { t: V3; n: V3; b: V3 }[] = [];
  let normal: V3 | null = null;
  for (let i = 0; i < spine.length; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const t = norm(sub(next, prev));
    if (!normal) {
      // Seed with any axis not parallel to the tangent.
      const seed: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      normal = norm(cross(seed, t));
    } else {
      // Re-orthogonalise the carried normal against the new tangent.
      normal = norm(sub(normal, mul(t, normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2])));
    }
    out.push({ t, n: normal, b: norm(cross(t, normal)) });
  }
  return out;
}

export interface TubeOptions {
  sides?: number;
  /** Per-ring roll, in radians, so facets don't line up down the length. */
  roll?: (t: number, i: number) => number;
  /** Per-vertex radius multiplier — low frequency gives big flat facets. */
  wobble?: (t: number, k: number) => number;
  /** Squash across the frame's binormal, for oval trunks. */
  flatten?: number;
  capStart?: boolean;
  capEnd?: boolean;
  /** Taper the last ring to a point instead of capping it. */
  tipEnd?: boolean;
}

/**
 * Skin a tube along a spine. This is the workhorse: trunks, boughs, limbs,
 * reeds, cattails — anything with a length and a varying thickness.
 */
export function tube(
  spine: V3[],
  radiusAt: (t: number, i: number) => number,
  opts: TubeOptions = {}
): MeshBuilder {
  const sides = opts.sides ?? 7;
  const mb = new MeshBuilder();
  const fr = frames(spine);
  const loops: V3[][] = [];

  for (let i = 0; i < spine.length; i++) {
    const t = i / (spine.length - 1);
    const r = radiusAt(t, i);
    const roll = opts.roll ? opts.roll(t, i) : 0;
    const { n, b } = fr[i];
    const loop: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + roll;
      const rr = r * (opts.wobble ? opts.wobble(t, k) : 1);
      const ca = Math.cos(a) * rr;
      const sa = Math.sin(a) * rr * (opts.flatten !== undefined ? opts.flatten : 1);
      loop.push([
        spine[i][0] + n[0] * ca + b[0] * sa,
        spine[i][1] + n[1] * ca + b[1] * sa,
        spine[i][2] + n[2] * ca + b[2] * sa,
      ]);
    }
    loops.push(loop);
  }

  for (let i = 0; i < loops.length - 1; i++) mb.band(loops[i], loops[i + 1]);
  if (opts.capStart) mb.cap(loops[0], true);
  if (opts.tipEnd) mb.fan(loops[loops.length - 1], spine[spine.length - 1]);
  else if (opts.capEnd) mb.cap(loops[loops.length - 1]);
  return mb;
}

/**
 * Revolve a 2D profile of [radius, height] pairs around Y.
 *
 * Used where the shape is defined by its outline rather than by a path —
 * mushroom caps, urns, the flare where a trunk meets the ground.
 */
export function lathe(
  profile: [number, number][],
  sides = 8,
  wobble?: (row: number, k: number) => number
): MeshBuilder {
  const mb = new MeshBuilder();
  const loops: V3[][] = profile.map(([r, y], row) => {
    const loop: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const rr = r * (wobble ? wobble(row, k) : 1);
      loop.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    return loop;
  });
  for (let i = 0; i < loops.length - 1; i++) {
    // A zero-radius row is a point, so fan to it rather than skinning a
    // degenerate band.
    if (profile[i][0] < 1e-4) mb.fan(loops[i + 1], [0, profile[i][1], 0], true);
    else if (profile[i + 1][0] < 1e-4) mb.fan(loops[i], [0, profile[i + 1][1], 0]);
    else mb.band(loops[i], loops[i + 1]);
  }
  // Close whichever ends aren't already points, so the result is a solid.
  if (profile[0][0] >= 1e-4) mb.cap(loops[0]);
  if (profile[profile.length - 1][0] >= 1e-4) mb.cap(loops[loops.length - 1]);
  return mb;
}

/**
 * Extrude a closed 2D outline along Z, with the front and back faces inset so
 * the edges read as a bevel rather than a card seen from the side.
 *
 * Silhouette-first: draw the shape you want, then give it thickness.
 */
export function extrude(outline: [number, number][], depth: number, bevel = 0.72): MeshBuilder {
  const mb = new MeshBuilder();
  const hz = depth / 2;
  const front: V3[] = outline.map(([x, y]) => [x * bevel, y * bevel, hz]);
  const back: V3[] = outline.map(([x, y]) => [x * bevel, y * bevel, -hz]);
  const mid: V3[] = outline.map(([x, y]) => [x, y, 0]);
  mb.band(mid, front);
  mb.band(back, mid);
  mb.cap(front);
  mb.cap(back, true);
  return mb;
}

/**
 * A chunky faceted volume: rings stacked on an authored radius profile, each
 * rolled and wobbled so the facets are large and irregular.
 *
 * This is what foliage and boulders are made of. The distinction from a
 * displaced sphere is that the profile is *authored* — a crown is narrow at
 * the base, bulges, and is cut flat on top; a boulder is wide and low with an
 * undercut. Those are shapes you decide, not noise you apply.
 */
export function blob(
  profile: [number, number][],
  sides: number,
  rand: () => number,
  amount = 0.22
): MeshBuilder {
  // One wobble value per (row, side), held in a table so neighbouring rows
  // share some of their deviation — that's what produces big flat facets
  // instead of a crumpled surface.
  const rows = profile.length;
  const w: number[][] = [];
  for (let r = 0; r < rows; r++) {
    w.push([]);
    for (let k = 0; k < sides; k++) {
      const prev = r > 0 ? w[r - 1][k] : 1;
      const target = 1 + (rand() - 0.5) * 2 * amount;
      w[r].push(prev * 0.55 + target * 0.45);
    }
  }
  const roll = rand() * Math.PI * 2;
  const mb = new MeshBuilder();
  const loops: V3[][] = profile.map(([r, y], row) => {
    const loop: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + roll;
      const rr = r * w[row][k];
      loop.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    return loop;
  });
  for (let i = 0; i < loops.length - 1; i++) {
    if (profile[i][0] < 1e-4) mb.fan(loops[i + 1], [0, profile[i][1], 0], true);
    else if (profile[i + 1][0] < 1e-4) mb.fan(loops[i], [0, profile[i + 1][1], 0]);
    else mb.band(loops[i], loops[i + 1]);
  }
  if (profile[0][0] >= 1e-4) mb.cap(loops[0], true);
  if (profile[rows - 1][0] >= 1e-4) mb.cap(loops[rows - 1]);
  return mb;
}

/** Rotate a builder's triangles about Y, then translate. Cheap instancing. */
export function place(mb: MeshBuilder, yaw: number, at: V3, scale = 1): MeshBuilder {
  const out = new MeshBuilder();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const src = (mb as unknown as { pos: number[] }).pos;
  const dst = (out as unknown as { pos: number[] }).pos;
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i] * scale, y = src[i + 1] * scale, z = src[i + 2] * scale;
    dst.push(x * c + z * s + at[0], y + at[1], -x * s + z * c + at[2]);
  }
  return out;
}

/** Smooth a coarse spine into something a tube can follow without kinking. */
export function resample(points: V3[], steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (points.length - 1);
    const i0 = Math.min(points.length - 1, Math.floor(t));
    const i1 = Math.min(points.length - 1, i0 + 1);
    const f = t - i0;
    // Catmull-Rom through the control points, clamped at the ends.
    const p0 = points[Math.max(0, i0 - 1)];
    const p1 = points[i0];
    const p2 = points[i1];
    const p3 = points[Math.min(points.length - 1, i1 + 1)];
    const q = (a: number, b: number, c: number, d: number) =>
      0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1]), q(p0[2], p1[2], p2[2], p3[2])]);
  }
  return out;
}
