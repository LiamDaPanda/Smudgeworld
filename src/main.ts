import { PerspectiveCamera, WebGLRenderer } from "three";
import { createInput } from "./input.ts";
import { buildWorld } from "./world.ts";
import { createPlayer, updatePlayer } from "./player.ts";
import { attachSmudges, createSmudges, updateSmudges } from "./smudges.ts";
import { drawViewfinder, hideViewfinder, tryTakePhoto } from "./camera.ts";
import { addSnapshot, renderLibrary } from "./library.ts";
import type { GameState } from "./types.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xf4efe6, 1);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.5, 8);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

const worldWidth = 120;
const { scene, worldRoot } = buildWorld(worldWidth);
const player = createPlayer(6);
worldRoot.add(player.root);

const smudges = createSmudges(worldWidth);
attachSmudges(smudges, worldRoot);

const input = createInput(canvas);

const state: GameState = {
  scene,
  camera,
  worldWidth,
  worldRoot,
  player,
  smudges,
  input,
  time: 0,
  coins: 0,
  snapshotCount: 0,
};

function updateHud(s: GameState) {
  const coin = document.getElementById("coin");
  const found = document.getElementById("found");
  if (coin) coin.textContent = `Coins: ${s.coins}`;
  if (found) found.textContent = `Snapshots: ${s.snapshotCount}`;
}
updateHud(state);
renderLibrary();

function update(dt: number) {
  state.time += dt;
  updatePlayer(state.player, state.input, dt, state.worldWidth);
  updateSmudges(state.smudges, state.time);

  // Camera follows player: side view, slightly elevated
  const targetX = state.player.worldX + state.player.facing * 0.5;
  const targetZ = 7.5;
  const targetY = 2.4;
  camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 4);
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 4);
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 4);
  camera.lookAt(state.player.worldX, 1.4, 0);

  if (state.player.cameraRaised) {
    drawViewfinder(state, window.innerWidth, window.innerHeight);
  } else {
    hideViewfinder();
  }

  if (state.input.consumeSnap() && state.player.cameraRaised) {
    const shot = tryTakePhoto(state);
    if (shot) {
      addSnapshot(shot);
      state.snapshotCount += 1;
      state.coins += Math.round(shot.clarity * 10);
      updateHud(state);
      shutterFlash();
    }
  }
}

function shutterFlash() {
  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;inset:0;background:#fff;opacity:0.7;pointer-events:none;z-index:10;transition:opacity 220ms ease;";
  document.body.appendChild(flash);
  requestAnimationFrame(() => (flash.style.opacity = "0"));
  setTimeout(() => flash.remove(), 260);
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(state.scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
