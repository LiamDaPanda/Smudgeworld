import type { GameState, Snapshot } from "./types.ts";

const FRAME_W = 260;
const FRAME_H = 180;

export function drawViewfinder(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  const cx = state.input.aimX;
  const cy = state.input.aimY;

  ctx.save();
  ctx.fillStyle = "rgba(30,30,30,0.25)";
  ctx.fillRect(0, 0, w, cy - FRAME_H / 2);
  ctx.fillRect(0, cy + FRAME_H / 2, w, h - (cy + FRAME_H / 2));
  ctx.fillRect(0, cy - FRAME_H / 2, cx - FRAME_W / 2, FRAME_H);
  ctx.fillRect(cx + FRAME_W / 2, cy - FRAME_H / 2, w - (cx + FRAME_W / 2), FRAME_H);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - FRAME_W / 2, cy - FRAME_H / 2, FRAME_W, FRAME_H);

  ctx.beginPath();
  ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
  ctx.restore();
}

export function tryTakePhoto(state: GameState): Snapshot | null {
  const cx = state.input.aimX;
  const cy = state.input.aimY;
  const groundY = state.world.groundY;

  let best: { smudge: (typeof state.smudges)[number]; clarity: number } | null = null;

  for (const s of state.smudges) {
    if (!s.visible) continue;
    const sx = s.x - state.cameraX;
    const sy = groundY - s.baseY;
    const dx = sx - cx;
    const dy = sy - cy;
    if (Math.abs(dx) > FRAME_W / 2 - 4 || Math.abs(dy) > FRAME_H / 2 - 4) continue;

    const framingDist = Math.hypot(dx / (FRAME_W / 2), dy / (FRAME_H / 2));
    const framingScore = Math.max(0, 1 - framingDist);

    const playerScreenX = state.player.x - state.cameraX;
    const distToPlayer = Math.hypot(sx - playerScreenX, sy - (groundY - 30));
    const idealDist = 240;
    const distanceScore = Math.max(0, 1 - Math.abs(distToPlayer - idealDist) / 260);

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
