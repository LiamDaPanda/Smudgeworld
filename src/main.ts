import { createInput } from "./input.ts";
import { createWorld, drawWorld } from "./world.ts";
import { createPlayer, updatePlayer, drawPlayer } from "./player.ts";
import { drawViewfinder, tryTakePhoto } from "./camera.ts";
import { createSmudges, updateSmudges, drawSmudges } from "./smudges.ts";
import { addSnapshot, renderLibrary } from "./library.ts";
import type { GameState } from "./types.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

const input = createInput(canvas);
const world = createWorld(4000);
const player = createPlayer(200, 0);
const smudges = createSmudges(world.width);

const state: GameState = {
  world,
  player,
  smudges,
  input,
  cameraX: 0,
  time: 0,
  coins: 0,
  snapshotCount: 0,
};

function viewportW() { return window.innerWidth; }
function viewportH() { return window.innerHeight; }

function update(dt: number) {
  state.time += dt;
  updatePlayer(state.player, state.input, dt, state.world.width);
  updateSmudges(state.smudges, state.time);

  const targetCam = state.player.x - viewportW() * 0.4;
  state.cameraX += (targetCam - state.cameraX) * Math.min(1, dt * 6);
  state.cameraX = Math.max(0, Math.min(state.world.width - viewportW(), state.cameraX));

  if (state.input.consumeSnap() && state.player.cameraRaised) {
    const shot = tryTakePhoto(state);
    if (shot) {
      addSnapshot(shot);
      state.snapshotCount += 1;
      state.coins += Math.round(shot.clarity * 10);
      updateHud(state);
    }
  }
}

function render() {
  const w = viewportW();
  const h = viewportH();
  ctx.clearRect(0, 0, w, h);
  drawWorld(ctx, state, w, h);
  drawSmudges(ctx, state, w, h);
  drawPlayer(ctx, state, w, h);
  if (state.player.cameraRaised) drawViewfinder(ctx, state, w, h);
}

function updateHud(s: GameState) {
  const coin = document.getElementById("coin");
  const found = document.getElementById("found");
  if (coin) coin.textContent = `Coins: ${s.coins}`;
  if (found) found.textContent = `Snapshots: ${s.snapshotCount}`;
}
updateHud(state);
renderLibrary();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
