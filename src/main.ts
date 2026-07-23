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

const camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 8);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

const worldWidth = 60;
const worldDepth = 40;
const { scene, worldRoot } = buildWorld(worldWidth, worldDepth);
const player = createPlayer(worldWidth / 2, worldDepth / 2);
worldRoot.add(player.root);

const smudges = createSmudges(worldWidth, worldDepth);
attachSmudges(smudges, worldRoot);

const input = createInput(canvas);

const state: GameState = {
  scene,
  camera,
  worldWidth,
  worldDepth,
  worldRoot,
  player,
  smudges,
  input,
  time: 0,
  coins: 0,
  snapshotCount: 0,
};

const bounds = { minX: 1, maxX: worldWidth - 1, minZ: 1, maxZ: worldDepth - 1 };

function updateHud(s: GameState) {
  const coin = document.getElementById("coin");
  const found = document.getElementById("found");
  if (coin) coin.textContent = `Coins: ${s.coins}`;
  if (found) found.textContent = `Snapshots: ${s.snapshotCount}`;
}
updateHud(state);
renderLibrary();

// Third-person follow: camera sits behind the player relative to their yaw,
// slightly elevated, looking down at head height. When they turn, the camera
// smoothly swings around to stay behind.
const CAM_DISTANCE = 6.5;
const CAM_HEIGHT = 3.4;
const CAM_LOOK_HEIGHT = 1.3;

function update(dt: number) {
  state.time += dt;
  updatePlayer(state.player, state.input, dt, bounds);
  updateSmudges(state.smudges, state.time);

  const p = state.player;
  // "Behind" the player means opposite of the direction they're facing.
  // yaw=0 faces +X, yaw=PI faces -X. Player forward = (sin(yaw), 0, cos(yaw))
  // — actually with our convention: forward = (-sin(yaw), 0, -cos(yaw)).
  // Camera sits at player - forward * distance.
  const forwardX = -Math.sin(p.yaw);
  const forwardZ = -Math.cos(p.yaw);
  const targetX = p.worldX - forwardX * CAM_DISTANCE;
  const targetZ = p.worldZ - forwardZ * CAM_DISTANCE;
  const targetY = CAM_HEIGHT;
  const k = Math.min(1, dt * 4);
  camera.position.x += (targetX - camera.position.x) * k;
  camera.position.z += (targetZ - camera.position.z) * k;
  camera.position.y += (targetY - camera.position.y) * k;
  camera.lookAt(p.worldX, CAM_LOOK_HEIGHT, p.worldZ);

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
