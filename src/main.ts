import { PerspectiveCamera, WebGLRenderer } from "three";
import { createInput } from "./input.ts";
import { buildWorld } from "./world.ts";
import { createPlayer, updatePlayer } from "./player.ts";
import { attachSmudges, createSmudges, updateSmudges } from "./smudges.ts";
import { hideViewfinder } from "./camera.ts";
import { addSnapshot, closeInventory, getSetSummary, openInventory, renderLibrary } from "./library.ts";
import { createFish, createPond, createWaterfall, updateFish, updatePond, updateWaterfall } from "./water.ts";
import { isPhotoModeActive, startPhotoMode } from "./photo.ts";
import type { GameState, Smudge } from "./types.ts";

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
  const coin = document.getElementById("coin-val");
  const found = document.getElementById("found-val");
  if (coin) coin.textContent = String(s.coins);
  if (found) found.textContent = String(s.snapshotCount);
  updateProgress();
}

function updateProgress() {
  const summary = getSetSummary();
  // Show the first incomplete set, or the last one if all complete
  const target = summary.find((x) => !x.complete) ?? summary[summary.length - 1];
  const nameEl = document.getElementById("pb-name");
  const countEl = document.getElementById("pb-count");
  const fillEl = document.getElementById("pb-fill");
  if (!target) return;
  if (nameEl) nameEl.textContent = target.name;
  if (countEl) countEl.textContent = `${target.captured}/${target.total}`;
  if (fillEl) fillEl.style.width = `${(target.captured / target.total) * 100}%`;
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

// Menu → cutscene → game. The game loop keeps running but input is gated
// behind `gameActive` so nothing happens until the cutscene finishes.
let gameActive = false;
const menu = document.getElementById("menu-overlay");
const cutscene = document.getElementById("cutscene-overlay");
const cardstack = document.getElementById("cs-cardstack");
const shutter = document.getElementById("cs-shutter");
const caption = document.getElementById("cs-caption");

const introCards = [
  { name: "Park Cat", meta: "seen last Tuesday · 62%" },
  { name: "Pigeon Council", meta: "sunday market · 78%" },
  { name: "Comet Sparrow", meta: "1s window · 41%" },
  { name: "Bench Sitter", meta: "morning fog · 88%" },
];

function buildIntroCards() {
  if (!cardstack) return;
  cardstack.innerHTML = "";
  for (const c of introCards) {
    const card = document.createElement("div");
    card.className = "cs-card";
    card.innerHTML = `
      <div class="cs-thumb"></div>
      <div class="cs-name">${c.name}</div>
      <div class="cs-meta">${c.meta}</div>
    `;
    cardstack.appendChild(card);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playCutscene() {
  if (!cutscene || !cardstack) return;
  cutscene.classList.add("show");
  buildIntroCards();
  const cards = Array.from(cardstack.children) as HTMLElement[];
  const captions = [
    "Flipping through your camera…",
    "…yesterday's park…",
    "…a comet that stayed for a second…",
    "…time to find more.",
  ];
  for (let i = 0; i < cards.length; i++) {
    if (caption) caption.textContent = captions[i] ?? captions[captions.length - 1];
    cards[i].classList.add("active");
    await delay(950);
    cards[i].classList.remove("active");
  }
  if (caption) caption.textContent = "";
  shutter?.classList.add("fire");
  await delay(280);
  // Reveal the world under the shutter's flash peak
  cutscene.classList.remove("show");
  gameActive = true;
  await delay(400);
  shutter?.classList.remove("fire");
}

function startGame() {
  if (!menu) return;
  menu.classList.add("hidden");
  const anyScreen = screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
  anyScreen.orientation?.lock?.("landscape").catch(() => {});
  playCutscene();
}

document.getElementById("menu-start")?.addEventListener("click", startGame);

// ---------------- PWA install ----------------
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: BIP | null = null;
const installBtn = document.getElementById("install-btn");
const iosInstall = document.getElementById("ios-install");
const iosClose = document.getElementById("ios-install-close");

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const isStandalone =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

if (!isStandalone) {
  if (isIOS) {
    installBtn?.classList.remove("hidden");
    installBtn?.addEventListener("click", () => iosInstall?.classList.add("show"));
    iosClose?.addEventListener("click", () => iosInstall?.classList.remove("show"));
    iosInstall?.addEventListener("click", (e) => {
      if (e.target === iosInstall) iosInstall.classList.remove("show");
    });
  } else {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e as BIP;
      installBtn?.classList.remove("hidden");
    });
    installBtn?.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") installBtn?.classList.add("hidden");
      deferredPrompt = null;
    });
    window.addEventListener("appinstalled", () => {
      installBtn?.classList.add("hidden");
      deferredPrompt = null;
    });
  }
}

// Register the service worker so the site is installable and works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
window.addEventListener("keydown", (e) => {
  if (!gameActive && !menu?.classList.contains("hidden") && (e.key === "Enter" || e.key === " ")) {
    startGame();
    e.preventDefault();
  }
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

const idleInput = { moveX: 0, moveZ: 0, cameraHeld: false, aimX: 0, aimY: 0, consumeSnap: () => false };

// Proximity to smudges — updated each frame so the prompt tracks the nearest.
const PROX_RADIUS = 3.5;
let nearestSmudge: Smudge | null = null;

function updateProximity() {
  const p = state.player;
  let best: Smudge | null = null;
  let bestDist = PROX_RADIUS;
  for (const s of state.smudges) {
    if (!s.visible) continue;
    const dx = s.worldPos.x - p.worldX;
    const dz = s.worldPos.z - p.worldZ;
    const d = Math.hypot(dx, dz);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  const changed = best !== nearestSmudge;
  nearestSmudge = best;
  if (changed) {
    const prompt = document.getElementById("prox-prompt");
    const promptName = document.getElementById("prox-name");
    if (best && !isPhotoModeActive()) {
      prompt?.classList.add("show");
      if (promptName) promptName.textContent = "A blurry figure";
    } else {
      prompt?.classList.remove("show");
    }
  }
}

function launchPhotoIfPossible() {
  if (!gameActive || isPhotoModeActive() || !nearestSmudge) return;
  const s = nearestSmudge;
  document.getElementById("prox-prompt")?.classList.remove("show");
  startPhotoMode(s, (shot) => {
    if (!shot) return;
    const result = addSnapshot(shot);
    state.snapshotCount += 1;
    state.coins += Math.round(shot.clarity * 10);
    if (result.completedSet) {
      state.coins += result.reward;
      showToast(`Set complete: ${result.completedSet.name} · +${result.reward} coins`, 3400);
    } else if (result.newSubject) {
      showToast(`New: ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
    } else if (result.improvedBest) {
      showToast(`Better shot of ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
    }
    updateHud(state);
  });
}

document.getElementById("prox-btn")?.addEventListener("click", launchPhotoIfPossible);

// Debug hook — surface state for playwright screenshots
(window as unknown as { __sw?: unknown }).__sw = {
  teleportToSmudge: (i = 0) => {
    const s = state.smudges[i];
    if (!s) return;
    state.player.worldX = s.worldPos.x - 1;
    state.player.worldZ = s.worldPos.z + 1;
  },
  startPhoto: (i = 0) => startPhotoMode(state.smudges[i], () => {}),
};
window.addEventListener("keydown", (e) => {
  if ((e.key === "e" || e.key === "E") && gameActive && !isPhotoModeActive() && nearestSmudge) {
    launchPhotoIfPossible();
    e.preventDefault();
  }
});

function update(dt: number) {
  state.time += dt;
  // While the menu/cutscene is up or photo mode is active, freeze the player.
  const input = gameActive && !isPhotoModeActive() ? state.input : idleInput;
  updatePlayer(state.player, input, dt, bounds);
  updateSmudges(state.smudges, state.time);
  updatePond(state.pond, state.time);
  updateFish(state.fish, state.time);
  updateWaterfall(state.waterfall, state.time);
  if (gameActive && !isPhotoModeActive()) updateProximity();
  else if (isPhotoModeActive()) {
    // hide prompt during photo mode
    document.getElementById("prox-prompt")?.classList.remove("show");
  }

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

  // Old snap-with-viewfinder flow is gone in favor of the proximity/photo-mode
  // flow. Hide the DOM viewfinder in case anything else toggled it.
  hideViewfinder();
  // Consume any pending snap so it doesn't linger between modes.
  state.input.consumeSnap();
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
