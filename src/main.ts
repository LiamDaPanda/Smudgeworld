import { PerspectiveCamera, WebGLRenderer } from "three";
import { createInput } from "./input.ts";
import { buildWorld, sampleGroundHeight, updateAtmosphere } from "./world.ts";
import { clockString, nightAmount, phaseName, setTimeOfDay, updateDayNight } from "./daynight.ts";
import {
  initAudio, isMuted, playLevelUp, playNearby, playSetComplete,
  playSuccess, playUiTick, toggleMute, updateAudio, updateFootsteps,
} from "./audio.ts";
import { createPlayer, updatePlayer } from "./player.ts";
import { attachSmudges, createSmudges, updateSmudges } from "./smudges.ts";
import { hideViewfinder } from "./camera.ts";
import {
  addSnapshot, closeInventory, getCapturedSubjects, getSetSummary,
  openInventory, renderLibrary, restoreLibrary, serializeLibrary,
} from "./library.ts";
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
const world = buildWorld(worldWidth, worldDepth);
const { scene, worldRoot } = world;
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

// ---------------- Save / load ----------------
// Declared before the boot-time loadGame()/updateLevelHud() calls below —
// function declarations hoist, but let-bindings do not.
const SAVE_KEY = "smudgeworld-save-v1";
let xp = 0;

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
loadGame();
updateHud(state);
updateLevelHud();
renderLibrary();

// Paper grain + vignette overlay — generated once, sits above the canvas but
// below all UI, with multiply blending so the whole scene reads as ink on
// textured paper.
(function addPaperOverlay() {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 235 + Math.floor(Math.random() * 20);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 4;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const grain = document.createElement("div");
  grain.id = "paper-overlay";
  grain.style.cssText = `
    position: fixed; inset: 0; z-index: 4; pointer-events: none;
    background-image: url(${c.toDataURL()});
    background-repeat: repeat;
    mix-blend-mode: multiply;
    opacity: 0.55;
  `;
  document.body.appendChild(grain);
  const vignette = document.createElement("div");
  vignette.id = "vignette-overlay";
  vignette.style.cssText = `
    position: fixed; inset: 0; z-index: 4; pointer-events: none;
    background: radial-gradient(ellipse at center,
      rgba(0,0,0,0) 55%, rgba(43,38,28,0.18) 100%);
  `;
  document.body.appendChild(vignette);

  // Night colour grade. Much of the world (ground, path, grass patches, ink
  // splatters) uses MeshBasicMaterial and so ignores scene lights entirely —
  // a multiply tint over the canvas is what actually sells nightfall, and it
  // grades every layer uniformly.
  const nightTint = document.createElement("div");
  nightTint.id = "night-tint";
  nightTint.style.cssText = `
    position: fixed; inset: 0; z-index: 3; pointer-events: none;
    background: #2c3a5c;
    mix-blend-mode: multiply;
    opacity: 0;
  `;
  document.body.appendChild(nightTint);
})();

const nightTintEl = document.getElementById("night-tint");
function updateNightGrade(night: number) {
  if (nightTintEl) nightTintEl.style.opacity = String(night * 0.72);
}

document.getElementById("inv-toggle")?.addEventListener("click", () => {
  document.getElementById("inv-toggle")?.classList.remove("has-new");
  playUiTick();
  openInventory();
});

// Mute toggle — reflects state in the chip label.
const muteBtn = document.getElementById("mute-toggle");
function paintMuteBtn() {
  if (muteBtn) muteBtn.textContent = isMuted() ? "Sound off" : "Sound on";
}
muteBtn?.addEventListener("click", () => {
  toggleMute();
  paintMuteBtn();
  playUiTick();
});
paintMuteBtn();
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
  // Browsers only allow an AudioContext to start from a user gesture, so the
  // ENTER press is where the whole sound graph comes to life.
  initAudio();
  playUiTick();
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
// User-controlled additional yaw offset for the camera around the player.
let cameraOrbit = 0;

const idleInput = {
  moveX: 0, moveZ: 0, cameraHeld: false, sprint: false, aimX: 0, aimY: 0,
  consumeSnap: () => false, consumeCameraYaw: () => 0,
};

function saveGame() {
  try {
    const lib = serializeLibrary();
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins,
      snapshotCount: state.snapshotCount,
      xp,
      library: lib,
    }));
  } catch { /* storage full or unavailable — play on without saving */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.coins = data.coins ?? 0;
    state.snapshotCount = data.snapshotCount ?? 0;
    xp = data.xp ?? 0;
    restoreLibrary(data.library ?? null);
    // Reflect captured subjects on the world's smudges
    const captured = getCapturedSubjects();
    for (const s of state.smudges) {
      if (captured.has(s.name)) s.captured = true;
    }
  } catch { /* corrupt save — start fresh */ }
}

// Photographer level: every 100 XP is a level. XP comes from clarity.
function levelFromXp(x: number) { return Math.floor(x / 100) + 1; }

function updateLevelHud() {
  const lvlEl = document.getElementById("level-val");
  const fillEl = document.getElementById("xp-fill");
  if (lvlEl) lvlEl.textContent = String(levelFromXp(xp));
  if (fillEl) fillEl.style.width = `${xp % 100}%`;
}

// Floating "+N" that drifts up from the coin chip when coins are gained.
function coinPop(amount: number) {
  const chip = document.getElementById("coin");
  if (!chip || amount <= 0) return;
  const el = document.createElement("span");
  el.className = "coin-pop";
  el.textContent = `+${amount}`;
  chip.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function markCollectionNew() {
  document.getElementById("inv-toggle")?.classList.add("has-new");
}

let lastClockText = "";
function updateClockHud() {
  const el = document.getElementById("clock-val");
  if (!el) return;
  const text = `${clockString()} · ${phaseName()}`;
  if (text !== lastClockText) {
    lastClockText = text;
    el.textContent = text;
    document.getElementById("clock-chip")?.classList.toggle("is-night", nightAmount() > 0.5);
  }
}

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
      playNearby();
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
    s.captured = true;
    const result = addSnapshot(shot);
    state.snapshotCount += 1;
    const coinGain = Math.round(shot.clarity * 10) + (result.completedSet ? result.reward : 0);
    state.coins += coinGain;
    const prevLevel = levelFromXp(xp);
    xp += Math.round(shot.clarity * 20) + (result.newSubject ? 15 : 0);
    if (result.completedSet) {
      showToast(`Set complete: ${result.completedSet.name} · +${result.reward} coins`, 3400);
      playSetComplete();
    } else if (result.newSubject) {
      showToast(`New: ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      markCollectionNew();
      playSuccess();
    } else if (result.improvedBest) {
      showToast(`Better shot of ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      playSuccess();
    }
    if (levelFromXp(xp) > prevLevel) {
      showToast(`Photographer level ${levelFromXp(xp)}!`, 3000);
      playLevelUp();
    }
    coinPop(coinGain);
    updateHud(state);
    updateLevelHud();
    saveGame();
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
  setTime: (t: number) => setTimeOfDay(t),
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
  // Follow terrain height (currently returns 0; kept for future terrain work)
  const y = sampleGroundHeight(state.player.worldX, state.player.worldZ);
  if (state.player.root.position.y !== y) state.player.root.position.y = y;
  updateDayNight(dt, world, state.worldWidth, state.worldDepth);
  const night = nightAmount();
  updateSmudges(state.smudges, state.time, night);
  updatePond(state.pond, state.time);
  updateFish(state.fish, state.time);
  updateWaterfall(state.waterfall, state.time);
  updateAtmosphere(dt, state.time);
  updateClockHud();
  updateNightGrade(night);

  // Ambience: pond bed by distance, footsteps in time with the stride.
  const pondDist = Math.hypot(
    state.player.worldX - state.pond.center[0],
    state.player.worldZ - state.pond.center[1]
  ) - state.pond.radius;
  const isWalking = gameActive && !isPhotoModeActive()
    && Math.hypot(state.input.moveX, state.input.moveZ) > 0.05;
  const strideHz = state.input.sprint ? 3.1 : 2.0;
  updateAudio(dt, { waterDistance: Math.max(0, pondDist), walking: isWalking, strideHz, night });
  updateFootsteps(dt, isWalking, strideHz);
  if (gameActive && !isPhotoModeActive()) updateProximity();
  else if (isPhotoModeActive()) {
    // hide prompt during photo mode
    document.getElementById("prox-prompt")?.classList.remove("show");
  }

  const p = state.player;
  cameraOrbit += state.input.consumeCameraYaw();
  // Camera sits behind the player, plus the user's orbit offset. This lets
  // the player rotate the view around themselves.
  const camYaw = p.yaw + cameraOrbit;
  const forwardX = -Math.sin(camYaw);
  const forwardZ = -Math.cos(camYaw);
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
