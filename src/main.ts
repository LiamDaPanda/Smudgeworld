import { PerspectiveCamera, WebGLRenderer } from "three";
import { createInput } from "./input.ts";
import { buildWorld } from "./world.ts";
import { createPlayer, updatePlayer } from "./player.ts";
import { attachSmudges, createSmudges, updateSmudges } from "./smudges.ts";
import { drawViewfinder, hideViewfinder, tryTakePhoto } from "./camera.ts";
import { addSnapshot, closeInventory, openInventory, renderLibrary } from "./library.ts";
import { createFish, createPond, createWaterfall, updateFish, updatePond, updateWaterfall } from "./water.ts";
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

// Water feature: pond near the north edge with a waterfall behind it and a
// few fish drifting on the surface.
const pondCx = worldWidth * 0.72;
const pondCz = worldDepth * 0.28;
const pond = createPond(pondCx, pondCz, 3.8);
worldRoot.add(pond.group);
const waterfall = createWaterfall(pondCx, pondCz - 3.5, 3.2, 3.6);
worldRoot.add(waterfall.group);
const fish = createFish(pond, 4);

const input = createInput(canvas);

const state: GameState = {
  scene,
  camera,
  worldWidth,
  worldDepth,
  worldRoot,
  player,
  smudges,
  pond,
  fish,
  waterfall,
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

document.getElementById("inv-toggle")?.addEventListener("click", openInventory);
document.getElementById("inv-close")?.addEventListener("click", closeInventory);
document.getElementById("inventory-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeInventory();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "i" || e.key === "I") openInventory();
  if (e.key === "Escape") closeInventory();
});

let toastTimer = 0;
function showToast(msg: string, ms = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), ms);
}

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
  updatePond(state.pond, state.time);
  updateFish(state.fish, state.time);
  updateWaterfall(state.waterfall, state.time);

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
      const result = addSnapshot(shot);
      state.snapshotCount += 1;
      state.coins += Math.round(shot.clarity * 10);
      shutterFlash();

      if (result.completedSet) {
        state.coins += result.reward;
        showToast(`Set complete: ${result.completedSet.name} · +${result.reward} coins`, 3400);
      } else if (result.newSubject) {
        showToast(`New: ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      } else if (result.improvedBest) {
        showToast(`Better shot of ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      }
      updateHud(state);
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
