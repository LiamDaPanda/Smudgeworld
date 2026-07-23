import { Vector3 } from "three";
import type { GameState, Snapshot } from "./types.ts";

const FRAME_W = 320;
const FRAME_H = 220;

let overlayEls: ReturnType<typeof buildOverlay> | null = null;

function buildOverlay() {
  const wrap = document.createElement("div");
  wrap.id = "viewfinder";
  wrap.style.cssText =
    "position:fixed;inset:0;pointer-events:none;display:none;z-index:5;";

  const topMask = mask();
  const bottomMask = mask();
  const leftMask = mask();
  const rightMask = mask();
  const frame = document.createElement("div");
  frame.style.cssText =
    "position:absolute;border:1.2px solid #1a1a1a;box-sizing:border-box;";
  const crossH = document.createElement("div");
  const crossV = document.createElement("div");
  crossH.style.cssText = "position:absolute;background:#1a1a1a;height:1.5px;width:22px;";
  crossV.style.cssText = "position:absolute;background:#1a1a1a;width:1.5px;height:22px;";

  wrap.append(topMask, bottomMask, leftMask, rightMask, frame, crossH, crossV);
  document.body.appendChild(wrap);
  return { wrap, topMask, bottomMask, leftMask, rightMask, frame, crossH, crossV };
}

function mask() {
  const d = document.createElement("div");
  d.style.cssText = "position:absolute;background:rgba(30,30,30,0.30);";
  return d;
}

function ensureOverlay() {
  if (!overlayEls) overlayEls = buildOverlay();
  return overlayEls;
}

export function drawViewfinder(state: GameState, w: number, h: number) {
  const els = ensureOverlay();
  const cx = state.input.aimX;
  const cy = state.input.aimY;
  const left = cx - FRAME_W / 2;
  const top = cy - FRAME_H / 2;
  els.wrap.style.display = "block";
  els.topMask.style.cssText += `left:0;top:0;width:${w}px;height:${top}px;`;
  els.topMask.style.left = "0";
  els.topMask.style.top = "0";
  els.topMask.style.width = w + "px";
  els.topMask.style.height = Math.max(0, top) + "px";
  els.bottomMask.style.left = "0";
  els.bottomMask.style.top = top + FRAME_H + "px";
  els.bottomMask.style.width = w + "px";
  els.bottomMask.style.height = Math.max(0, h - (top + FRAME_H)) + "px";
  els.leftMask.style.left = "0";
  els.leftMask.style.top = top + "px";
  els.leftMask.style.width = Math.max(0, left) + "px";
  els.leftMask.style.height = FRAME_H + "px";
  els.rightMask.style.left = left + FRAME_W + "px";
  els.rightMask.style.top = top + "px";
  els.rightMask.style.width = Math.max(0, w - (left + FRAME_W)) + "px";
  els.rightMask.style.height = FRAME_H + "px";
  els.frame.style.left = left + "px";
  els.frame.style.top = top + "px";
  els.frame.style.width = FRAME_W + "px";
  els.frame.style.height = FRAME_H + "px";
  els.crossH.style.left = cx - 11 + "px";
  els.crossH.style.top = cy - 0.75 + "px";
  els.crossV.style.left = cx - 0.75 + "px";
  els.crossV.style.top = cy - 11 + "px";
}

export function hideViewfinder() {
  const els = ensureOverlay();
  els.wrap.style.display = "none";
}

const _v = new Vector3();

export function tryTakePhoto(state: GameState): Snapshot | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = state.input.aimX;
  const cy = state.input.aimY;

  let best: { smudge: (typeof state.smudges)[number]; clarity: number } | null = null;

  for (const s of state.smudges) {
    if (!s.visible) continue;
    _v.copy(s.worldPos);
    _v.project(state.camera);
    const sx = (_v.x * 0.5 + 0.5) * w;
    const sy = (-_v.y * 0.5 + 0.5) * h;
    const behind = _v.z > 1;
    if (behind) continue;

    const dx = sx - cx;
    const dy = sy - cy;
    if (Math.abs(dx) > FRAME_W / 2 - 4 || Math.abs(dy) > FRAME_H / 2 - 4) continue;

    const framingDist = Math.hypot(dx / (FRAME_W / 2), dy / (FRAME_H / 2));
    const framingScore = Math.max(0, 1 - framingDist);

    const distToPlayer = s.worldPos.distanceTo(state.player.root.position);
    const idealDist = 5;
    const distanceScore = Math.max(0, 1 - Math.abs(distToPlayer - idealDist) / 5);

    let timingScore = 1;
    if (s.kind === "timed" && s.timedWindow) {
      const t = state.time;
      if (t < s.timedWindow.start || t > s.timedWindow.end) timingScore = 0;
      else {
        const mid = (s.timedWindow.start + s.timedWindow.end) / 2;
        timingScore = 1 - Math.abs(t - mid) / ((s.timedWindow.end - s.timedWindow.start) / 2);
      }
    }

    const clarity = Math.max(0, Math.min(1, framingScore * 0.55 + distanceScore * 0.25 + timingScore * 0.2));
    if (!best || clarity > best.clarity) best = { smudge: s, clarity };
  }

  if (!best) return null;
  return {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    subjectName: best.smudge.name,
    set: best.smudge.set,
    clarity: best.clarity,
    takenAt: new Date().toISOString(),
  };
}
