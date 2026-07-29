// Game loop for the side-scrolling build.
//
// The park is a strip you walk left and right along. Photo mode, the library,
// the gear shop, audio and the HUD are untouched — none of them ever cared how
// the world was drawn.

import { createInput } from "./input.ts";
import {
  advanceDay, clockString, nightAmount, phaseName, setTimeOfDay, skyPalette, skyWash,
} from "./daynight2d.ts";
import {
  initAudio, isMuted, playLevelUp, playNearby, playSetComplete,
  playSuccess, playUiTick, toggleMute, updateAudio, updateFootsteps,
} from "./audio.ts";
import {
  addSnapshot, bestClarityOf, closeInventory, getSetSummary, openInventory,
  renderLibrary, restoreLibrary, serializeLibrary,
} from "./library.ts";
import { isPhotoModeActive, photoState, setAim, startPhotoMode } from "./photo.ts";
import { subjectIllustration } from "./subjects.ts";
import {
  drawAerial, drawChimney, drawCrate, drawLighthouse, drawMushroom, drawPortal,
  drawWashing,
} from "./sprites2d.ts";
import {
  calmScale, closeShop, grantGear, initShop, openShop, ownedGear,
  renderShop, restoreGear, spotRadius, type GearItem,
} from "./gear.ts";
import { bakePlayer, WALK_FRAMES, type Facing } from "./player2d.ts";
import {
  drawBackRise, drawGround, drawLayer, drawShadow, drawSky, drawWater, groundY,
  UNIT, worldToScreenX, type Camera,
} from "./render2d.ts";
import { buildScene2D, type Scene2D } from "./scene2d.ts";
import { START_WORLD, WORLDS } from "./worlds.ts";
import {
  bakeSmudge, createSmudges2D, markCaptured, updateSmudges2D, type Smudge2D,
} from "./smudges2d.ts";
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

const playerArt = bakePlayer();
const smudgeArt = bakeSmudge();
const input = createInput(canvas);

// Worlds are built the first time you walk into them and then kept, so a
// portal is instant on the way back and every subject you spooked is still
// where you left it.
const built = new Map<string, { scene: Scene2D; smudges: Smudge2D[] }>();
function world(id: string) {
  let w = built.get(id);
  if (!w) {
    const def = WORLDS[id] ?? WORLDS[START_WORLD];
    const scene = buildScene2D(def);
    built.set(id, (w = { scene, smudges: createSmudges2D(scene, def) }));
  }
  return w;
}
let current = world(START_WORLD);
let scene = current.scene;
let smudges = current.smudges;

const player = { x: scene.spawn, vx: 0, facing: "right" as Facing, phase: 0 };
let nearPortal: { x: number; to: string; name: string } | null = null;
let portalCooldown = 0;
const cam: Camera = { x: player.x };

let coins = 0, snapshotCount = 0, xp = 0, time = 0;
let gameActive = false, paused = false;
let nearest: Smudge2D | null = null;
let lastChimed: Smudge2D | null = null;
const fleeingNow = new Set<string>();

const SAVE_KEY = "smudgeworld-save-v1";

// ---------------- HUD ----------------

const levelFromXp = (v: number) => 1 + Math.floor(v / 100);

function updateHud() {
  const coin = document.getElementById("coin-val");
  const found = document.getElementById("found-val");
  if (coin) coin.textContent = String(coins);
  if (found) found.textContent = String(snapshotCount);
  const summary = getSetSummary();
  // Prefer a set you can actually work on from where you're standing. The bar
  // is meant to say "here's what to hunt next", and with six sets across four
  // worlds the first-incomplete-overall rule pointed at Park Life while you
  // were on a rooftop.
  const here = new Set((WORLDS[scene.id]?.subjects ?? []).map((x) => x.set));
  const target = summary.find((x) => !x.complete && here.has(x.name))
    ?? summary.find((x) => !x.complete)
    ?? summary[summary.length - 1];
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
  if (xpFill) xpFill.style.width = `${xp % 100}%`;
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

// ---------------- Save ----------------

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins, snapshotCount, xp, world: scene.id,
      gear: ownedGear(), library: serializeLibrary(),
    }));
  } catch { /* storage unavailable */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    coins = d.coins ?? 0;
    snapshotCount = d.snapshotCount ?? 0;
    xp = d.xp ?? 0;
    restoreGear(d.gear);
    restoreLibrary(d.library);
    if (d.world && WORLDS[d.world] && d.world !== scene.id) {
      current = world(d.world);
      scene = current.scene;
      smudges = current.smudges;
      player.x = scene.spawn;
      cam.x = player.x;
    }
  } catch { /* corrupt save */ }
}
loadGame();
paintWorldChip();
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
    if (!s.visible || s.captured) continue;
    const d = Math.abs(s.x - player.x);
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
      // Once it's in the library you recognise it on sight, and knowing your
      // own best score is what turns a second sighting into a reason to stop.
      const bestClarity = bestClarityOf(best.name);
      if (n) {
        n.textContent = bestClarity === null
          ? "A blurry figure"
          : `${best.name} · best ${Math.round(bestClarity * 100)}%`;
      }
      if (best !== lastChimed) { lastChimed = best; playNearby(); }
    } else prompt?.classList.remove("show");
  }
  if (!best) lastChimed = null;
  document.body.classList.toggle("near-smudge", !!best);
}

/**
 * Say it once, the first time it happens. A subject that bolts for reasons the
 * player can't see just reads as the game being flaky; told once that running
 * is what did it, the walk/sprint choice becomes a decision instead of a
 * speed setting.
 */
function watchForBolts() {
  for (const s of smudges) {
    const running = s.fleeing > 0;
    if (running && !fleeingNow.has(s.id)) {
      fleeingNow.add(s.id);
      if (Math.abs(s.x - player.x) < 12) tipOnce("spook", "It bolted — walk, don't run, when you're closing in");
    } else if (!running) {
      fleeingNow.delete(s.id);
    }
  }
}

/**
 * Portals. Standing in one and pressing F walks you through.
 *
 * Deliberately not automatic: a portal you fall through by walking past it
 * would make the two ends of a world impossible to reach, and the subjects
 * nearest the doors unphotographable.
 */
function updatePortals(dt: number) {
  portalCooldown = Math.max(0, portalCooldown - dt);
  let best: typeof nearPortal = null;
  for (const p of scene.portals) {
    if (Math.abs(p.x - player.x) < 2.8) { best = p; break; }
  }
  const changed = best?.to !== nearPortal?.to;
  nearPortal = best;
  const el = document.getElementById("portal-prompt");
  if (changed) {
    if (best) {
      el?.classList.add("show");
      const n = document.getElementById("portal-name");
      if (n) n.textContent = best.name;
      playNearby();
    } else el?.classList.remove("show");
  }
}

function travel(to: string) {
  if (portalCooldown > 0) return;
  // Read where we came from *before* reassigning, which is the whole bug this
  // used to have: `current` was already the destination by the time the
  // arrival door was looked up, so the lookup could never match and every trip
  // dumped you at the left-hand end of the world however you got there.
  const fromId = scene.id;
  const next = world(to);
  current = next;
  scene = next.scene;
  smudges = next.smudges;
  nearest = null;
  lastChimed = null;
  fleeingNow.clear();
  document.getElementById("prox-prompt")?.classList.remove("show");
  document.getElementById("portal-prompt")?.classList.remove("show");
  nearPortal = null;

  // Come out of the door that leads back where you came from, standing beside
  // it rather than in it — otherwise the first press of F on the far side
  // sends you straight home again. Step toward the middle of the world, so
  // arriving at a door near an edge doesn't put you against the wall.
  const door = scene.portals.find((p) => p.to === fromId) ?? scene.portals[0];
  if (door) {
    const inward = door.x < scene.width / 2 ? 1 : -1;
    player.x = Math.max(2, Math.min(scene.width - 2, door.x + inward * 4));
  } else {
    player.x = scene.spawn;
  }
  player.vx = 0;
  cam.x = player.x;
  portalCooldown = 0.8;

  playSuccess();
  showToast(`${scene.name} — ${scene.blurb}`, 3400);
  paintWorldChip();
  updateHud();
  saveGame();
}

function paintWorldChip() {
  const el = document.getElementById("world-val");
  if (el) el.textContent = scene.name;
}

function tipOnce(key: string, text: string) {
  try {
    const k = `smudgeworld-tip-${key}`;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
  } catch { /* storage blocked — show it every time rather than never */ }
  showToast(text, 4200);
}

function launchPhoto() {
  if (!gameActive || isPhotoModeActive() || !nearest) return;
  const s = nearest;
  document.getElementById("prox-prompt")?.classList.remove("show");
  const context = {
    distance: () => Math.abs(s.x - player.x),
    best: bestClarityOf(s.name),
  };
  startPhotoMode(s, context, (shot: Snapshot | null) => {
    if (!shot) return;
    markCaptured(s, time);
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
    if (result.newSubject) {
      tipOnce("respawn", "Subjects wander back after a while — a better plate always replaces your best");
    }
    if (levelFromXp(xp) > prev) {
      showToast(`Photographer level ${levelFromXp(xp)}!`, 3000);
      playLevelUp();
    }
    document.getElementById("coin")?.classList.add("pop");
    setTimeout(() => document.getElementById("coin")?.classList.remove("pop"), 400);
    updateHud();
    renderLibrary();
    renderShop();
    saveGame();
  });
}

// ---------------- UI wiring ----------------

document.getElementById("inv-toggle")?.addEventListener("click", () => {
  playUiTick();
  document.getElementById("inv-toggle")?.classList.remove("has-new");
  openInventory();
});
document.getElementById("inv-close")?.addEventListener("click", closeInventory);
document.getElementById("shop-toggle")?.addEventListener("click", () => { playUiTick(); openShop(); });
document.getElementById("shop-close")?.addEventListener("click", closeShop);

const muteBtn = document.getElementById("mute-toggle");
const paintMute = () => { if (muteBtn) muteBtn.textContent = isMuted() ? "Sound off" : "Sound on"; };
muteBtn?.addEventListener("click", () => { toggleMute(); paintMute(); });
paintMute();

function setPaused(v: boolean) {
  paused = v;
  document.getElementById("pause-overlay")?.classList.toggle("open", v);
}
document.getElementById("pause-resume")?.addEventListener("click", () => setPaused(false));
document.getElementById("portal-go")?.addEventListener("click", () => {
  if (nearPortal) travel(nearPortal.to);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "i" || e.key === "I") openInventory();
  if (e.key === "Escape") {
    const inv = document.getElementById("inventory-modal")?.classList.contains("open");
    const shop = document.getElementById("shop-modal")?.classList.contains("open");
    if (inv) closeInventory();
    else if (shop) closeShop();
    else if (isPhotoModeActive()) { /* handled in photo mode */ }
    else if (gameActive) setPaused(!paused);
  }
  if ((e.key === "e" || e.key === "E") && gameActive && !isPhotoModeActive() && nearest) launchPhoto();
  if ((e.key === "f" || e.key === "F") && gameActive && !isPhotoModeActive() && nearPortal) {
    travel(nearPortal.to);
  }
});

const menu = document.getElementById("menu-overlay");
document.getElementById("menu-start")?.addEventListener("click", () => {
  initAudio();
  menu?.classList.add("hidden");
  document.getElementById("cutscene-overlay")?.classList.remove("show");
  gameActive = true;
});

// ---------------- Movement ----------------

const WALK = 8.5;
const SPRINT = 14;

function updatePlayer(dt: number) {
  let ix = input.moveX;
  const raw = Math.abs(ix);
  const DEAD = 0.14;
  let mag = 0;
  if (raw > DEAD) { mag = Math.min(1, (raw - DEAD) / (1 - DEAD)); ix = Math.sign(ix); }
  else ix = 0;

  const speed = input.sprint ? SPRINT : WALK * (0.45 + 0.55 * mag);
  const target = ix * speed * mag;
  const k = 1 - Math.exp(-(mag > 0 ? 16 : 20) * dt);
  player.vx += (target - player.vx) * k;
  if (Math.abs(player.vx) < 0.03) player.vx = 0;

  // Scenery does not stop you.
  //
  // A side-scroller has exactly one walkable line, so a "blocker" on it isn't
  // an obstacle you steer around — it's a wall across the whole world. Every
  // playfield tree was one, which made the park impassable 6 units in out of
  // 340. It never showed up because every test drove the player with `warp`.
  // The player draws in front of the playfield layer, so walking past a trunk
  // reads correctly with no collision at all.
  player.x += player.vx * dt;
  player.x = Math.max(2, Math.min(scene.width - 2, player.x));

  if (ix !== 0) player.facing = ix > 0 ? "right" : "left";
  player.phase = (player.phase + Math.abs(player.vx) * dt * 0.22) % 1;
  return Math.abs(player.vx);
}

// ---------------- Render ----------------

const PLAYFIELD = 4;
/** Layers below this index draw behind the river. */
const BEHIND_WATER = 3;

function render(gait: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gy = groundY(vh);

  const sky = skyPalette();
  drawSky(ctx, vw, vh, sky.top, sky.mid, sky.horizon);
  // Each world colours its own sky over the top of the clock's, so a coast at
  // noon and a wood at noon aren't the same blue but both still go dark.
  if (scene.skyTint) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = scene.skyTint.alpha;
    ctx.fillStyle = scene.skyTint.hex;
    ctx.fillRect(0, 0, vw, groundY(vh));
    ctx.restore();
  }
  drawGround(ctx, scene, cam, vw, vh);

  scene.layers.forEach((layer, i) => {
    // The river stands above the ground line, between the far hills and the
    // tree band, so the bank plants in front of it overlap the water.
    if (i === BEHIND_WATER) {
      drawWater(ctx, scene, cam, vw, vh);
      drawBackRise(ctx, scene, cam, vw, vh);
    }

    if (i !== PLAYFIELD) {
      drawLayer(ctx, layer.items, layer.parallax, cam, vw, vh);
      return;
    }
    // Contact shadows first, so nothing on the playfield floats.
    for (const it of layer.items) {
      if (it.scale < 0.9) continue;
      const sx = worldToScreenX(cam, it.x, 1, vw);
      if (sx < -80 || sx > vw + 80) continue;
      drawShadow(ctx, sx, gy, 22 * it.scale, 0.14);
    }
    drawLayer(ctx, layer.items, layer.parallax, cam, vw, vh);

    for (const s of smudges) {
      if (!s.visible || s.captured) continue;
      const sx = worldToScreenX(cam, s.x, 1, vw);
      if (sx < -140 || sx > vw + 140) continue;
      const sc = (UNIT / 64) * 1.15;
      ctx.drawImage(
        smudgeArt,
        sx - 75 * sc, gy - 138 * sc - s.y * UNIT,
        150 * sc, 150 * sc
      );
    }

    const px = worldToScreenX(cam, player.x, 1, vw);
    drawShadow(ctx, px, gy, 22, 0.3);
    const frame = gait > 0.4
      ? playerArt.frames[player.facing][Math.floor(player.phase * WALK_FRAMES) % WALK_FRAMES]
      : playerArt.idle[player.facing];
    const psc = (UNIT / 64) * 1.5;
    ctx.drawImage(
      frame.canvas,
      px - frame.anchorX * psc, gy - frame.anchorY * psc,
      frame.canvas.width * psc, frame.canvas.height * psc
    );
  });

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

// ---------------- Loop ----------------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!paused) {
    time += dt;
    advanceDay(dt);
    const night = nightAmount();
    const gait = gameActive && !isPhotoModeActive() ? updatePlayer(dt) : 0;
    updateSmudges2D(smudges, time, night, isPhotoModeActive() ? nearest : null, {
      playerX: player.x,
      width: scene.width,
      sprinting: input.sprint && gait > 0.4,
      calm: calmScale(),
    }, dt);
    watchForBolts();

    // The camera leads in the direction of travel, so you see more of where
    // you're going than where you've been, and it clamps at the map's ends.
    const half = vw / (2 * UNIT);
    const lead = player.vx * 0.22;
    const target = Math.max(half, Math.min(Math.max(half, scene.width - half), player.x + lead));
    cam.x += (target - cam.x) * (1 - Math.exp(-7 * dt));

    if (gameActive && !isPhotoModeActive()) {
      updateProximity();
      updatePortals(dt);
      if (input.consumePhoto()) launchPhoto();
    } else if (isPhotoModeActive()) {
      // Drain it: Space fires the shutter *and* sets the world's photo flag, so
      // without this the camera re-opens the instant the result card closes.
      input.consumePhoto();
      document.getElementById("prox-prompt")?.classList.remove("show");
    }

    updateClockHud();
    const walking = gait > 0.4;
    const w = scene.water[0];
    const pondD = !w ? 999
      : player.x > w.from && player.x < w.to ? 0
      : Math.min(Math.abs(player.x - w.from), Math.abs(player.x - w.to));
    updateAudio(dt, { waterDistance: pondD, walking, strideHz: input.sprint ? 3.1 : 2.0, night });
    updateFootsteps(dt, walking, input.sprint ? 3.1 : 2.0);
    render(gait);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(saveGame, 15000);
window.addEventListener("beforeunload", saveGame);

(window as unknown as { __sw: unknown }).__sw = {
  warp: (x: number) => { player.x = x; cam.x = x; },
  pose: () => ({ x: player.x }),
  setTime: (t: number) => setTimeOfDay(t),
  smudgeNames: () => smudges.map((s) => s.name),
  teleportToSmudge: (i: number) => {
    const s = smudges[i];
    if (!s) return;
    player.x = s.x - 1.2;
    cam.x = player.x;
  },
  subjectPos: () => nearest && { x: nearest.x },
  addCoins: (n: number) => { coins += n; updateHud(); renderShop(); },
  smudgeState: (i: number) => {
    const s = smudges[i];
    return s && {
      x: s.x, alert: s.alert, fleeing: s.fleeing,
      captured: s.captured, respawnAt: s.respawnAt, now: time,
    };
  },
  photoState,
  setAim,
  plate: (name: string) => subjectIllustration(name),
  propSprites: () => ({
    lighthouse: drawLighthouse(1900).canvas,
    chimney: drawChimney(1500).canvas,
    aerial: drawAerial(1600).canvas,
    washing: drawWashing(1700).canvas,
    crate: drawCrate(1800).canvas,
    mushroom: drawMushroom(1400).canvas,
    portal: drawPortal("#9dc06a", 5100).canvas,
  }),
  skipTime: (n: number) => { time += n; },
  worldId: () => scene.id,
  worldWidth: () => scene.width,
  worldList: () => Object.keys(WORLDS),
  goWorld: (id: string) => { portalCooldown = 0; travel(id); },
  portals: () => scene.portals.map((p) => ({ x: p.x, to: p.to })),
};
