// The subjects: dark, unresolvable shapes standing in the park.
//
// The look matters here more than anywhere — a smudge has to read as
// *something that won't come into focus*, not as a grey circle. It's drawn as
// several overlapping soft blobs at low alpha with no ink outline at all,
// which is the one thing in the world with no line on it.

import { hexA, seeded } from "./art2d.ts";
import type { Scene2D } from "./scene2d.ts";
import type { WorldDef } from "./worlds.ts";

export interface Smudge2D {
  id: string;
  name: string;
  set: string;
  kind: "common" | "timed";
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  wander: number;
  seed: number;
  visible: boolean;
  captured: boolean;
  /** Where in its section it lives, so a respawn can pick a fresh spot. */
  from: number;
  to: number;
  /** Game time at which a captured subject comes back. */
  respawnAt: number;
  /** 0..1. Rises when you crowd or run at it; at 1 the subject bolts. */
  alert: number;
  /** Seconds of flight remaining. */
  fleeing: number;
  fleeDir: number;
  /** Set for timed subjects while their one-second window is open. */
  timedWindow: { start: number; end: number } | null;
  /** photo.ts writes the finished shot here. */
  __lastShot?: unknown;
}


/**
 * One shared sprite, drawn large and scaled down — it's a blur either way.
 *
 * The trick is that a smudge has to look *out of focus*, not burnt. Piling up
 * near-black blobs gets you a scorch mark on the grass; what reads as a figure
 * refusing to resolve is a cool, mid-value mass with a suggestion of head and
 * shoulders in it and a pale bloom around the edge, the way a blown highlight
 * eats into a dark subject on film.
 */
export function bakeSmudge(): HTMLCanvasElement {
  const size = 150;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rand = seeded(4242);
  const cx = size / 2;

  // A pale bloom first, so the shape lifts off whatever is behind it.
  const halo = ctx.createRadialGradient(cx, size * 0.55, size * 0.1, cx, size * 0.55, size * 0.46);
  halo.addColorStop(0, hexA("#f2f4f2", 0.24));
  halo.addColorStop(1, hexA("#f2f4f2", 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Head, shoulders, mass — the three lumps that say "somebody".
  const lumps: [number, number, number][] = [
    [cx, size * 0.30, size * 0.115],   // head
    [cx, size * 0.47, size * 0.20],    // shoulders
    [cx, size * 0.68, size * 0.235],   // body
  ];
  for (const [x, y, r] of lumps) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#5a5c63", 0.5));
    g.addColorStop(0.55, hexA("#5a5c63", 0.32));
    g.addColorStop(1, hexA("#5a5c63", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Then break the edges up so it never settles into a silhouette.
  for (let i = 0; i < 18; i++) {
    const x = cx + (rand() - 0.5) * size * 0.4;
    const y = size * 0.52 + (rand() - 0.5) * size * 0.52;
    const r = size * (0.07 + rand() * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#4c4e56", 0.13 + rand() * 0.11));
    g.addColorStop(1, hexA("#4c4e56", 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function createSmudges2D(scene: Scene2D, def: WorldDef): Smudge2D[] {
  const rand = seeded(3141 + scene.width);
  const out: Smudge2D[] = [];
  let n = 0;

  for (const sub of def.subjects) {
    const sec = scene.sections.find((x) => x.name === sub.section) ?? scene.sections[0];
    // Kept off the section's edges so a subject never straddles a border, and
    // off the portals, so you don't have to stand in a doorway to shoot.
    const pad = Math.min(6, (sec.to - sec.from) * 0.2);
    const from = sec.from + pad;
    const to = Math.max(from + 1, sec.to - pad);
    let x = from + rand() * (to - from);
    for (const p of scene.portals) {
      if (Math.abs(x - p.x) < 4) x = x + (x < p.x ? -5 : 5);
    }
    x = Math.max(2, Math.min(scene.width - 2, x));
    out.push({
      id: `${def.id}-s${n++}`, name: sub.name, set: sub.set, kind: sub.kind,
      homeX: x, homeY: 0, x, y: 0,
      wander: 1.2 + rand() * 1.8,
      seed: rand() * 100,
      visible: sub.kind === "common",
      captured: false,
      from, to,
      respawnAt: 0,
      alert: 0,
      fleeing: 0,
      fleeDir: 1,
      timedWindow: null,
    });
  }
  return out;
}

/** How long a photographed subject stays gone before it drifts back. */
const RESPAWN_SECONDS = 75;
/** Inside this, running at a subject frightens it. */
const SPOOK_RANGE = 7;

export interface SmudgeWorld {
  /** Where the player is on the strip. */
  playerX: number;
  /** How long this world's strip is, for clamping wander and flight. */
  width: number;
  /** True while the player is sprinting — the thing that actually spooks. */
  sprinting: boolean;
  /** How far a subject tolerates you before it gets twitchy. Gear widens it. */
  calm: number;
}

export function updateSmudges2D(
  smudges: Smudge2D[], time: number, night: number, held: Smudge2D | null,
  world: SmudgeWorld, dt: number
) {
  const edge = world.width - 2;
  for (const s of smudges) {
    if (s.kind === "timed") {
      // Night only, and even then blinking through a one-second window on a
      // six-second cycle — you have to be there at the hour AND catch it.
      const dark = night > 0.5;
      const cycle = 6;
      const phase = ((time + s.seed) % cycle) / cycle;
      if (dark && phase > 0.9) {
        const start = time - (phase - 0.9) * cycle;
        s.timedWindow = { start, end: start + 1 };
        s.visible = s.captured ? false : true;
      } else {
        s.visible = false;
        s.timedWindow = null;
      }
    }

    // A photographed subject isn't gone for good — it wanders back somewhere
    // else in its section. Without this the library's best-take bookkeeping is
    // unreachable code: you get exactly one attempt at every subject, ever.
    if (s.captured && time >= s.respawnAt) {
      s.captured = false;
      s.alert = 0;
      s.fleeing = 0;
      s.homeX = s.from + ((s.seed * 37 + time) % 1) * (s.to - s.from);
      s.x = s.homeX;
      if (s.kind === "common") s.visible = true;
    }
    if (s.captured || s === held) continue;

    // --- Nerves ---
    // Sprinting at something is what scares it. Walking in is fine until you
    // are almost on top of it, and standing still calms it down fast — which
    // is the whole reason the movement has a walk and a run.
    const d = Math.abs(s.x - world.playerX);
    const near = SPOOK_RANGE * world.calm;
    if (d < near) {
      const closeness = 1 - d / near;
      const rate = world.sprinting ? 1.5 * closeness : Math.max(0, closeness - 0.55) * 0.9;
      s.alert = Math.min(1.2, s.alert + rate * dt);
    } else {
      s.alert = Math.max(0, s.alert - 0.5 * dt);
    }
    if (!world.sprinting && d > near * 0.55) s.alert = Math.max(0, s.alert - 0.35 * dt);

    if (s.alert >= 1 && s.fleeing <= 0) {
      s.fleeing = 1.8;
      s.fleeDir = s.x >= world.playerX ? 1 : -1;
    }

    if (s.fleeing > 0) {
      s.fleeing -= dt;
      s.x += s.fleeDir * 7.5 * dt;
      s.x = Math.max(2, Math.min(edge, s.x));
      s.y = Math.abs(Math.sin(time * 9 + s.seed)) * 0.2;
      if (s.fleeing <= 0) {
        // It settles somewhere new rather than snapping back.
        s.homeX = Math.max(s.from, Math.min(s.to, s.x));
        s.alert = 0;
      }
      continue;
    }

    // Drift along the strip, and bob a little — a subject that sits perfectly
    // still reads as scenery. A nervous one fidgets faster.
    const jitter = 1 + s.alert * 1.6;
    const t = time * 0.35 * jitter + s.seed;
    s.x = s.homeX + Math.sin(t) * s.wander + Math.sin(t * 0.43) * s.wander * 0.4;
    s.x = Math.max(2, Math.min(edge, s.x));
    s.y = Math.sin(t * 1.6) * 0.12;
  }
}

/** Called when a shot lands: the subject bolts and comes back later. */
export function markCaptured(s: Smudge2D, time: number) {
  s.captured = true;
  s.visible = false;
  s.respawnAt = time + RESPAWN_SECONDS;
}
