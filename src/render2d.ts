// The 2D renderer: a three-quarter view onto the painted ground, with
// everything standing on it drawn back-to-front.
//
// Depth is world Y. Sorting by it means a tree in front of the player occludes
// them and a tree behind doesn't, which is the whole of what a 3D scene was
// buying and costs one sort here.

import { GROUND_PX, type Prop, type World2D } from "./world2d.ts";
import { BAKE_PX, type Sprite } from "./art2d.ts";

/** Vertical squash. 1 would be a flat top-down map; this reads as a view. */
export const FORESHORTEN = 0.66;
/** Screen pixels per world unit at scale 1. */
export const UNIT = 54;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Drawable {
  x: number;
  y: number;
  sprite: Sprite;
  scale: number;
  /** Extra alpha, for canopies fading over the player. */
  alpha?: number;
  /** Drawn after everything at its depth — used for the player. */
  bias?: number;
}

export function worldToScreen(
  cam: Camera, x: number, y: number, vw: number, vh: number
): [number, number] {
  const s = UNIT * cam.zoom;
  return [
    (x - cam.x) * s + vw / 2,
    (y - cam.y) * s * FORESHORTEN + vh / 2,
  ];
}

export function screenToWorld(
  cam: Camera, sx: number, sy: number, vw: number, vh: number
): [number, number] {
  const s = UNIT * cam.zoom;
  return [
    (sx - vw / 2) / s + cam.x,
    (sy - vh / 2) / (s * FORESHORTEN) + cam.y,
  ];
}

export function drawGround(
  ctx: CanvasRenderingContext2D, world: World2D, cam: Camera, vw: number, vh: number
) {
  const s = UNIT * cam.zoom;
  // The ground canvas is GROUND_PX per unit; scale it to the view.
  const k = s / GROUND_PX;
  const [ox, oy] = worldToScreen(cam, 0, 0, vw, vh);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(ox, oy);
  ctx.scale(k, k * FORESHORTEN);
  ctx.drawImage(world.ground, 0, 0);
  ctx.restore();
}

/**
 * Draw everything standing on the ground, sorted by depth.
 *
 * Sprites are baked at 46px per world unit for trees and similar for the rest,
 * so a scale factor converts to the current zoom.
 */
export function drawProps(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  cam: Camera, vw: number, vh: number
) {
  const s = UNIT * cam.zoom;
  // Sprites are baked at BAKE_PX per world unit; this brings them to the
  // view's scale.
  const k = s / BAKE_PX;
  items.sort((a, b) => (a.y + (a.bias ?? 0)) - (b.y + (b.bias ?? 0)));

  const marginX = vw * 0.6;
  const marginY = vh * 0.6;
  for (const it of items) {
    const [sx, sy] = worldToScreen(cam, it.x, it.y, vw, vh);
    if (sx < -marginX || sx > vw + marginX || sy < -marginY || sy > vh + marginY) continue;
    const sc = k * it.scale;
    const w = it.sprite.canvas.width * sc;
    const h = it.sprite.canvas.height * sc;
    if (it.alpha !== undefined && it.alpha < 1) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, it.alpha);
    }
    ctx.drawImage(
      it.sprite.canvas,
      sx - it.sprite.anchorX * sc,
      sy - it.sprite.anchorY * sc,
      w, h
    );
    if (it.alpha !== undefined && it.alpha < 1) ctx.restore();
  }
}

/** A soft contact shadow, drawn on the ground before the sprite. */
export function drawShadow(
  ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number,
  r: number, vw: number, vh: number, alpha = 0.22
) {
  const s = UNIT * cam.zoom;
  const [sx, sy] = worldToScreen(cam, x, y, vw, vh);
  const rx = r * s;
  const g = ctx.createRadialGradient(sx, sy, rx * 0.1, sx, sy, rx);
  g.addColorStop(0, `rgba(40,44,32,${alpha})`);
  g.addColorStop(1, "rgba(40,44,32,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, rx * FORESHORTEN, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Canopy fade: a prop standing between the camera and the player goes
 * translucent. In 3D this needed a boom march and a dissolve; here it's a
 * distance test on two numbers.
 */
export function canopyAlpha(p: Prop, px: number, py: number): number {
  if (!p.canopy) return 1;
  // "In front of" means nearer the camera, i.e. greater y.
  const dy = p.y - py;
  if (dy < 0 || dy > 4.5) return 1;
  const dx = Math.abs(p.x - px);
  if (dx > 2.6) return 1;
  const near = 1 - Math.min(1, dx / 2.6);
  return 1 - near * 0.62;
}
