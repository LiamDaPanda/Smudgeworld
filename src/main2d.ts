// Game loop for the 2D build.
//
// The systems that were never about rendering — photo mode, the library, the
// gear shop, audio, the HUD — carry over unchanged. What's new is the world,
// the renderer, and movement, which in 2D are all much smaller.

import { createInput } from "./input.ts";
import {
  advanceDay, clockString, nightAmount, phaseName, setTimeOfDay, skyWash,
} from "./daynight2d.ts";
import {
  initAudio, isMuted, playLevelUp, playNearby, playSetComplete,
  playSuccess, playUiTick, toggleMute, updateAudio, updateFootsteps,
} from "./audio.ts";
import {
  addSnapshot, closeInventory, getSetSummary, openInventory,
  renderLibrary, restoreLibrary, serializeLibrary,
} from "./library.ts";
import { isPhotoModeActive, startPhotoMode } from "./photo.ts";
import {
  closeShop, grantGear, initShop, openShop, ownedGear,
  renderShop, restoreGear, spotRadius, type GearItem,
} from "./gear.ts";
import { bakePlayer, facingFor, type Facing } from "./player2d.ts";
import {
  canopyAlpha, drawGround, drawProps, drawShadow, screenToWorld,
  UNIT, worldToScreen, type Camera, type Drawable,
} from "./render2d.ts";
import { bakeSmudge, createSmudges2D, updateSmudges2D, type Smudge2D } from "./smudges2d.ts";
import { buildWorld2D, WORLD_H, WORLD_W } from "./world2d.ts";
import { drawTree } from "./sprites2d.ts";
import type { Snapshot } from "./types.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let vw = 0, vh = 0, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
}
resize();
window.addEventListener("resize", resize);

const world = buildWorld2D();
const playerArt = bakePlayer();
const smudgeArt = bakeSmudge();
const smudges = createSmudges2D(world.regions, world.pond);
const input = createInput(canvas);

const player = {
  x: world.spawn[0],
  y: world.spawn[1],
  vx: 0, vy: 0,
  facing: "down" as Facing,
  phase: 0,
};
const cam: Camera = { x: player.x, y: player.y, zoom: 1 };

// Solids the player collides with, flattened out of the prop list once.
const solids = world.props.filter((p) => p.solid > 0).map((p) => ({ x: p.x, y: p.y, r: p.solid }));

let coins = 0;
let snapshotCount = 0;
let xp = 0;
let time = 0;
let gameActive = false;
let paused = false;
let nearest: Smudge2D | null = null;
let lastChimed: Smudge2D | null = null;

const SAVE_KEY = "smudgeworld-save-v1";

// ---------------- HUD ----------------

function levelFromXp(v: number) { return 1 + Math.floor(v / 100); }

function updateHud() {
  const coin = document.getElementById("coin-val");
  const found = document.getElementById("found-val");
  if (coin) coin.textContent = String(coins);
  if (found) found.textContent = String(snapshotCount);
  const summary = getSetSummary();
  const target = summary.find((x) => !x.complete) ?? summary[summary.length - 1];
  if (target) {
    const n = document.getElementById("pb-name");
    const c = document.getElementById("pb-count");
    const f = document.getElementById("pb-fill");
    if (n) n.textContent = target.name;
    if (c) c.textContent = `${target.captured}/${target.total}`;
    if (f) f.style.width = `${(target.captured / target.total) * 100}%`;
  }
  const lvl = document.getElementById("level-val");
  const xpFill = document.getElementById("xp-fill");
  if (lvl) lvl.textContent = String(levelFromXp(xp));
  if (xpFill) xpFill.style.width = `${(xp % 100)}%`;
}

function updateClockHud() {
  const el = document.getElementById("clock-val");
  if (el) el.textContent = `${clockString()} · ${phaseName()}`;
  document.getElementById("clock-chip")?.classList.toggle("is-night", nightAmount() > 0.5);
}

let toastTimer = 0;
function showToast(text: string, ms = 2400) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
}

function coinPop(n: number) {
  if (n <= 0) return;
  const el = document.getElementById("coin");
  el?.classList.add("pop");
  setTimeout(() => el?.classList.remove("pop"), 400);
}

// ---------------- Save ----------------

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins, snapshotCount, xp, gear: ownedGear(), library: serializeLibrary(),
    }));
  } catch { /* storage unavailable — play on */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    coins = data.coins ?? 0;
    snapshotCount = data.snapshotCount ?? 0;
    xp = data.xp ?? 0;
    restoreGear(data.gear);
    restoreLibrary(data.library);
  } catch { /* corrupt save — start fresh */ }
}

loadGame();
updateHud();
renderLibrary();

initShop(() => coins, (item: GearItem) => {
  if (coins < item.cost) return;
  coins -= item.cost;
  grantGear(item.id);
  playSuccess();
  showToast(`${item.name} acquired`);
  updateHud();
  renderShop();
  saveGame();
});

// ---------------- Photography ----------------

function updateProximity() {
  const acquire = spotRadius();
  const hold = acquire * 1.35;
  let best: Smudge2D | null = null;
  let bestD = Infinity;
  for (const s of smudges) {
    if (!s.visible) continue;
    const d = Math.hypot(s.x - player.x, s.y - player.y);
    const limit = s === nearest ? hold : acquire;
    if (d < limit && d < bestD) { best = s; bestD = d; }
  }
  const changed = best !== nearest;
  nearest = best;
  if (changed) {
    const prompt = document.getElementById("prox-prompt");
    if (best) {
      prompt?.classList.add("show");
      const n = document.getElementById("prox-name");
      if (n) n.textContent = "A blurry figure";
      if (best !== lastChimed) { lastChimed = best; playNearby(); }
    } else {
      prompt?.classList.remove("show");
    }
  }
  if (!best) lastChimed = null;
  document.body.classList.toggle("near-smudge", !!best);
}

function launchPhoto() {
  if (!gameActive || isPhotoModeActive() || !nearest) return;
  const s = nearest;
  document.getElementById("prox-prompt")?.classList.remove("show");
  startPhotoMode(s, (shot: Snapshot | null) => {
    if (!shot) return;
    s.captured = true;
    const result = addSnapshot(shot);
    snapshotCount += 1;
    const gain = Math.round(shot.clarity * 10) + (result.completedSet ? result.reward : 0);
    coins += gain;
    const prev = levelFromXp(xp);
    xp += Math.round(shot.clarity * 20) + (result.newSubject ? 15 : 0);
    if (result.completedSet) {
      showToast(`Set complete: ${result.completedSet.name} · +${result.reward} coins`, 3400);
      playSetComplete();
    } else if (result.newSubject) {
      showToast(`New: ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      document.getElementById("inv-toggle")?.classList.add("has-new");
      playSuccess();
    } else if (result.improvedBest) {
      showToast(`Better shot of ${shot.subjectName} · ${Math.round(shot.clarity * 100)}%`);
      playSuccess();
    }
    if (levelFromXp(xp) > prev) {
      showToast(`Photographer level ${levelFromXp(xp)}!`, 3000);
      playLevelUp();
    }
    coinPop(gain);
    updateHud();
    renderLibrary();
    renderShop();
    saveGame();
  });
}

// ---------------- Input wiring ----------------

document.getElementById("inv-toggle")?.addEventListener("click", () => {
  playUiTick();
  document.getElementById("inv-toggle")?.classList.remove("has-new");
  openInventory();
});
document.getElementById("inv-close")?.addEventListener("click", closeInventory);
document.getElementById("shop-toggle")?.addEventListener("click", () => { playUiTick(); openShop(); });
document.getElementById("shop-close")?.addEventListener("click", closeShop);

const muteBtn = document.getElementById("mute-toggle");
function paintMute() { if (muteBtn) muteBtn.textContent = isMuted() ? "Sound off" : "Sound on"; }
muteBtn?.addEventListener("click", () => { toggleMute(); paintMute(); });
paintMute();

function setPaused(v: boolean) {
  paused = v;
  document.getElementById("pause-overlay")?.classList.toggle("open", v);
}
document.getElementById("pause-resume")?.addEventListener("click", () => setPaused(false));

window.addEventListener("keydown", (e) => {
  if (e.key === "i" || e.key === "I") openInventory();
  if (e.key === "Escape") {
    const inv = document.getElementById("inventory-modal")?.classList.contains("open");
    const shop = document.getElementById("shop-modal")?.classList.contains("open");
    if (inv) closeInventory();
    else if (shop) closeShop();
    else if (isPhotoModeActive()) { /* photo mode handles its own */ }
    else if (gameActive) setPaused(!paused);
  }
  if ((e.key === "e" || e.key === "E") && gameActive && !isPhotoModeActive() && nearest) launchPhoto();
});

// ---------------- Menu ----------------

const menu = document.getElementById("menu-overlay");
document.getElementById("menu-start")?.addEventListener("click", () => {
  initAudio();
  menu?.classList.add("hidden");
  document.getElementById("cutscene-overlay")?.classList.remove("show");
  gameActive = true;
});

// ---------------- Loop ----------------

const WALK = 7.5;
const SPRINT = 12;

function updatePlayer(dt: number) {
  let ix = input.moveX;
  let iy = input.moveZ; // -1 is "up the screen"
  const raw = Math.hypot(ix, iy);
  const DEAD = 0.14;
  let mag = 0;
  if (raw > DEAD) { mag = Math.min(1, (raw - DEAD) / (1 - DEAD)); ix /= raw; iy /= raw; }
  else { ix = 0; iy = 0; }

  const speed = input.sprint ? SPRINT : WALK * (0.45 + 0.55 * mag);
  const tx = ix * speed * mag;
  const ty = iy * speed * mag;
  const k = 1 - Math.exp(-(mag > 0 ? 16 : 20) * dt);
  player.vx += (tx - player.vx) * k;
  player.vy += (ty - player.vy) * k;
  if (Math.hypot(player.vx, player.vy) < 0.03) { player.vx = 0; player.vy = 0; }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Collision: push out of any solid we've ended up inside.
  for (const s of solids) {
    const dx = player.x - s.x;
    const dy = (player.y - s.y) / 0.7; // solids are squashed like the view
    const d = Math.hypot(dx, dy);
    const min = s.r + 0.35;
    if (d < min && d > 0.0001) {
      const push = (min - d) / d;
      player.x += dx * push;
      player.y += dy * push * 0.7;
    }
  }
  player.x = Math.max(1.5, Math.min(WORLD_W - 1.5, player.x));
  player.y = Math.max(1.5, Math.min(WORLD_H - 1.5, player.y));

  const gait = Math.hypot(player.vx, player.vy);
  if (mag > 0) player.facing = facingFor(ix, iy, player.facing);
  player.phase = (player.phase + gait * dt * 0.24) % 1;
  return gait;
}

const drawables: Drawable[] = [];

function render(gait: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = "#e9e5d6";
  ctx.fillRect(0, 0, vw, vh);

  drawGround(ctx, world, cam, vw, vh);

  // Shadows go straight onto the ground, before anything stands on it.
  for (const p of world.props) {
    if (p.solid <= 0) continue;
    const [sx, sy] = worldToScreen(cam, p.x, p.y, vw, vh);
    if (sx < -200 || sx > vw + 200 || sy < -200 || sy > vh + 200) continue;
    drawShadow(ctx, cam, p.x, p.y, p.solid * 2.6 * p.scale, vw, vh, 0.2);
  }
  drawShadow(ctx, cam, player.x, player.y, 0.42, vw, vh, 0.28);

  drawables.length = 0;
  for (const p of world.props) {
    drawables.push({
      x: p.x, y: p.y, sprite: p.sprite, scale: p.scale,
      alpha: canopyAlpha(p, player.x, player.y),
    });
  }
  // Smudges are drawn from the shared blur canvas rather than a Sprite.
  const smudgeSprite = { canvas: smudgeArt, anchorX: 75, anchorY: 132 };
  for (const s of smudges) {
    if (!s.visible || s.captured) continue;
    drawables.push({ x: s.x, y: s.y, sprite: smudgeSprite, scale: 1.0 });
  }
  const frame = playerArt.frames[player.facing][
    gait > 0.4 ? Math.floor(player.phase * 4) % 4 : 0
  ];
  drawables.push({ x: player.x, y: player.y, sprite: frame, scale: 1.15, bias: 0.01 });

  drawProps(ctx, drawables, cam, vw, vh);

  // Time-of-day wash over the finished frame.
  const wash = skyWash();
  if (wash.alpha > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = wash.alpha;
    ctx.fillStyle = wash.tint;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!paused) {
    time += dt;
    advanceDay(dt);
    const night = nightAmount();
    const gait = gameActive && !isPhotoModeActive() ? updatePlayer(dt) : 0;

    updateSmudges2D(smudges, time, night, isPhotoModeActive() ? nearest : null);

    // Camera eases toward the player rather than snapping.
    const ck = 1 - Math.exp(-6 * dt);
    cam.x += (player.x - cam.x) * ck;
    cam.y += (player.y - cam.y) * ck;

    if (gameActive && !isPhotoModeActive()) {
      updateProximity();
      if (input.consumePhoto()) launchPhoto();
    } else if (isPhotoModeActive()) {
      document.getElementById("prox-prompt")?.classList.remove("show");
    }

    updateClockHud();
    const walking = gait > 0.4;
    const pondD = Math.hypot(player.x - world.pond.x, player.y - world.pond.y) - world.pond.r;
    updateAudio(dt, {
      waterDistance: Math.max(0, pondD), walking,
      strideHz: input.sprint ? 3.1 : 2.0, night,
    });
    updateFootsteps(dt, walking, input.sprint ? 3.1 : 2.0);
    render(gait);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(saveGame, 15000);
window.addEventListener("beforeunload", saveGame);

// Debug hooks, same shape as the 3D build's so the test scripts still work.
(window as unknown as { __sw: unknown }).__sw = {
  warp: (x: number, y: number) => { player.x = x; player.y = y; cam.x = x; cam.y = y; },
  pose: () => ({ x: player.x, y: player.y }),
  setTime: (t: number) => setTimeOfDay(t),
  smudgeNames: () => smudges.map((s) => s.name),
  teleportToSmudge: (i: number) => {
    const s = smudges[i];
    if (!s) return;
    player.x = s.x; player.y = s.y + 1.5;
    cam.x = player.x; cam.y = player.y;
  },
  subjectPos: () => nearest && { x: nearest.x, y: nearest.y },
  addCoins: (n: number) => { coins += n; updateHud(); renderShop(); },
  screenToWorld: (sx: number, sy: number) => screenToWorld(cam, sx, sy, vw, vh),
  unit: () => UNIT,
  spriteURL: (kind: string, seed = 901) => {
    const sp = drawTree(kind as never, 3, seed);
    return sp.canvas.toDataURL("image/png");
  },
};
