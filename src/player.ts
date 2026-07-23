import type { GameState, InputState, Player } from "./types.ts";

const WALK_SPEED = 220;

export function createPlayer(x: number, _y: number): Player {
  return {
    x,
    y: 0,
    vx: 0,
    facing: 1,
    walkPhase: 0,
    cameraRaised: false,
  };
}

export function updatePlayer(p: Player, input: InputState, dt: number, worldWidth: number) {
  p.cameraRaised = input.cameraHeld;
  const canMove = !p.cameraRaised;
  let dir = 0;
  if (canMove) {
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
  }
  p.vx = dir * WALK_SPEED;
  p.x += p.vx * dt;
  p.x = Math.max(20, Math.min(worldWidth - 20, p.x));
  if (dir !== 0) p.facing = dir > 0 ? 1 : -1;
  p.walkPhase += Math.abs(p.vx) * dt * 0.02;
}

export function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, _w: number, _h: number) {
  const p = state.player;
  const groundY = state.world.groundY;
  const sx = p.x - state.cameraX;
  const bodyH = 46;
  const headR = 9;
  const headY = groundY - bodyH - headR;
  const hipY = groundY - 22;

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(sx, headY, headR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sx, headY + headR);
  ctx.lineTo(sx, hipY);
  ctx.stroke();

  const swing = Math.sin(p.walkPhase) * 10;
  ctx.beginPath();
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx + swing, groundY);
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx - swing, groundY);
  ctx.stroke();

  const armShoulderY = headY + headR + 6;
  const armSwing = Math.cos(p.walkPhase) * 8;
  if (p.cameraRaised) {
    const cx = sx + p.facing * 10;
    const cy = armShoulderY + 4;
    ctx.beginPath();
    ctx.moveTo(sx, armShoulderY);
    ctx.lineTo(cx, cy);
    ctx.moveTo(sx, armShoulderY);
    ctx.lineTo(cx - p.facing * 2, cy + 2);
    ctx.stroke();
    ctx.strokeRect(cx - 8, cy - 5, 16, 10);
    ctx.beginPath();
    ctx.arc(cx + p.facing * 2, cy, 3, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(sx, armShoulderY);
    ctx.lineTo(sx + armSwing, armShoulderY + 16);
    ctx.moveTo(sx, armShoulderY);
    ctx.lineTo(sx - armSwing, armShoulderY + 16);
    ctx.stroke();
    ctx.strokeRect(sx - 6, armShoulderY + 4, 12, 8);
    ctx.beginPath();
    ctx.moveTo(sx - 6, armShoulderY + 4);
    ctx.lineTo(sx - 10, headY + headR - 2);
    ctx.moveTo(sx + 6, armShoulderY + 4);
    ctx.lineTo(sx + 10, headY + headR - 2);
    ctx.stroke();
  }
}
