// Photo mode.
//
// Three skills decide a plate, not one:
//
//   focus    — the ring pulses; fire at its tightest
//   framing  — the subject drifts, and the lens only resolves what's at centre
//   distance — how close you walked in before you raised the camera
//
// The single most important thing here is that the viewfinder shows the subject
// *at its current focus*, blurred to whatever the ring is worth this instant.
// It used to show the finished illustration, which gave away the answer to the
// only question the game asks and turned the focus ring into an abstract timing
// bar with no visible consequence. Now the ring is the thing you read, because
// tightening it is what brings the smudge in.

import { playShutter, playUiTick } from "./audio.ts";
import { nightAmount, phaseName } from "./daynight2d.ts";
import { driftScale, focusCycleSeconds, focusTolerance, gearBonuses } from "./gear.ts";
import { subjectCutout, subjectIllustration } from "./subjects.ts";
import type { PhotoSubject, Snapshot } from "./types.ts";

type OnComplete = (snapshot: Snapshot | null) => void;

/** What photo mode needs from the world, read live while the camera is up. */
export interface PhotoContext {
  /** World distance from the player to the subject, in world units. */
  distance: () => number;
  /** The player's best clarity for this subject so far, if they have one. */
  best: number | null;
}

/** Distance at which the subject fills the frame, and where it's a speck. */
const NEAR = 1.6;
const FAR = 5.5;

interface Session {
  smudge: PhotoSubject;
  ctx: PhotoContext;
  onComplete: OnComplete;
  running: boolean;
  startAt: number;
  focus: number;
  framing: number;
  closeness: number;
  /** Where the player has the lens pointed, in canvas units. */
  aimX: number;
  aimY: number;
  /** Where the subject currently is, same units — read by the debug hook. */
  driftX: number;
  driftY: number;
  seed: number;
  raf: number;
  active: boolean;
}

let session: Session | null = null;
const held = new Set<string>();
let canvas: HTMLCanvasElement | null = null;
let c2d: CanvasRenderingContext2D | null = null;
let lastFrame = 0;

function el<T extends HTMLElement>(sel: string): T {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error("missing " + sel);
  return e;
}

function ensureUI() {
  if (document.getElementById("photo-overlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "photo-overlay";
  wrap.innerHTML = `
    <div class="pv-viewfinder" id="pv-viewfinder">
      <canvas id="pv-canvas"></canvas>
      <div class="pv-bracket tl"></div>
      <div class="pv-bracket tr"></div>
      <div class="pv-bracket bl"></div>
      <div class="pv-bracket br"></div>
      <div class="pv-window" id="pv-window">now</div>
      <div class="pv-meta">
        <div class="pv-name" id="pv-name">Park Cat</div>
        <div class="pv-hint" id="pv-hint">centre it, and fire when the ring is tightest</div>
      </div>
      <div class="pv-gauges">
        <div class="pv-gauge"><span>focus</span><i><b id="pv-g-focus"></b></i></div>
        <div class="pv-gauge"><span>framing</span><i><b id="pv-g-frame"></b></i></div>
        <div class="pv-gauge"><span>distance</span><i><b id="pv-g-dist"></b></i></div>
      </div>
      <div class="pv-controls">
        <button class="pv-btn pv-btn-cancel" id="pv-cancel">Cancel</button>
        <button class="pv-btn pv-btn-shutter" id="pv-shutter" aria-label="Shutter">
          <span class="pv-shutter-ring"></span>
        </button>
      </div>
      <div class="pv-flash" id="pv-flash"></div>
    </div>
    <div class="pv-result" id="pv-result">
      <div class="pv-result-card">
        <div class="pv-thumb" id="pv-thumb"></div>
        <div class="pv-result-name" id="pv-result-name"></div>
        <div class="pv-result-meta" id="pv-result-meta"></div>
        <div class="pv-result-actions">
          <button class="pv-btn" id="pv-done">Add to collection</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  canvas = document.getElementById("pv-canvas") as HTMLCanvasElement;
  c2d = canvas.getContext("2d");

  document.getElementById("pv-cancel")?.addEventListener("click", () => finish(false));
  document.getElementById("pv-shutter")?.addEventListener("click", fireShutter);
  document.getElementById("pv-done")?.addEventListener("click", () => finish(true));

  // Panning the lens: drag anywhere in the frame, or the movement keys.
  const vf = document.getElementById("pv-viewfinder")!;
  let dragging = false;
  let lastX = 0, lastY = 0;
  vf.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".pv-btn")) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    vf.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  vf.addEventListener("pointermove", (e) => {
    if (!dragging || !session?.running || !canvas) return;
    // Drag moves the frame, so the subject moves the other way — the same
    // direction sense as swinging a real camera.
    session.aimX += e.clientX - lastX;
    session.aimY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const stop = () => { dragging = false; };
  vf.addEventListener("pointerup", stop);
  vf.addEventListener("pointercancel", stop);

  window.addEventListener("keydown", (e) => {
    if (!session?.active) return;
    held.add(e.key.toLowerCase());
    if (e.key === "Escape") finish(false);
    if (e.key === " " || e.key === "Enter") {
      const result = document.getElementById("pv-result");
      if (result?.classList.contains("show")) finish(true);
      else fireShutter();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());
}

export function isPhotoModeActive() {
  return !!session?.active;
}

/** Debug hook: the three grading axes, the drift, and where the lens points. */
export function photoState() {
  if (!session) return null;
  const { focus, framing, closeness, aimX, aimY, driftX, driftY } = session;
  return { focus, framing, closeness, aimX, aimY, driftX, driftY };
}

/** Debug hook: point the lens somewhere, in canvas units. */
export function setAim(x: number, y: number) {
  if (!session) return;
  session.aimX = x;
  session.aimY = y;
}

export function startPhotoMode(
  smudge: PhotoSubject, context: PhotoContext, onComplete: OnComplete
) {
  ensureUI();
  held.clear();
  session = {
    smudge,
    ctx: context,
    onComplete,
    running: true,
    startAt: performance.now(),
    focus: 0,
    framing: 0,
    closeness: 0,
    aimX: 0,
    aimY: 0,
    driftX: 0,
    driftY: 0,
    seed: Math.random() * 100,
    raf: 0,
    active: true,
  };

  const overlay = document.getElementById("photo-overlay")!;
  playUiTick();
  overlay.classList.add("show");
  document.getElementById("pv-result")!.classList.remove("show");

  // Until it's developed you don't know what you're looking at — so the frame
  // is labelled by what you already know, not by what it is.
  el<HTMLElement>("#pv-name").textContent = context.best === null
    ? "Unidentified"
    : smudge.name;
  const hint = el<HTMLElement>("#pv-hint");
  hint.textContent = context.best === null
    ? "centre it, and fire when the ring is tightest"
    : `your best: ${Math.round(context.best * 100)}% — beat it`;

  lastFrame = performance.now();
  animate();
}

function resizeCanvas() {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}

function animate() {
  if (!session?.running || !canvas || !c2d) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = (now - session.startAt) / 1000;

  const dpr = resizeCanvas() ?? 1;
  const ctx = c2d;
  const W = canvas.width / dpr;
  const Hh = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = W / 2, cy = Hh / 2;
  const R = Math.min(W, Hh) / 2;

  // --- Focus: the ring pulses in and out; tightest is sharpest ---
  const cycle = focusCycleSeconds();
  const phase = (t % cycle) / cycle;
  const p = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  const ringScale = 1.6 - p * 1.1;
  const focus = Math.min(1, (1 - Math.abs(ringScale - 0.5) / 1.1) * focusTolerance());
  session.focus = focus;

  // --- Framing: the subject drifts; you pan to keep it under the reticle ---
  const amp = R * 0.36 * driftScale();
  const s = session.seed;
  const driftX = Math.sin(t * 0.83 + s) * amp + Math.sin(t * 1.61 + s * 2) * amp * 0.34;
  const driftY = Math.sin(t * 1.14 + s * 3) * amp * 0.62 + Math.cos(t * 2.03 + s) * amp * 0.2;
  session.driftX = driftX;
  session.driftY = driftY;

  const pan = R * 1.15;
  let ax = 0, ay = 0;
  if (held.has("a") || held.has("arrowleft")) ax -= 1;
  if (held.has("d") || held.has("arrowright")) ax += 1;
  if (held.has("w") || held.has("arrowup")) ay -= 1;
  if (held.has("s") || held.has("arrowdown")) ay += 1;
  session.aimX += ax * pan * dt;
  session.aimY += ay * pan * dt;
  const lim = R * 0.85;
  session.aimX = Math.max(-lim, Math.min(lim, session.aimX));
  session.aimY = Math.max(-lim, Math.min(lim, session.aimY));

  const offX = driftX - session.aimX;
  const offY = driftY - session.aimY;
  session.framing = Math.max(0, 1 - Math.hypot(offX, offY) / (R * 0.55));

  // --- Distance: fixed the moment you raised the camera, but shown live so
  // it's obvious that walking in is worth doing ---
  const d = session.ctx.distance();
  session.closeness = Math.max(0, Math.min(1, (FAR - d) / (FAR - NEAR)));

  // ------------------------------------------------------------ draw ----
  ctx.clearRect(0, 0, W, Hh);
  // Through the glass: a wash so the frame reads as aimed at somewhere.
  const bg = ctx.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, "#2b2f2c");
  bg.addColorStop(0.62, "#232622");
  bg.addColorStop(1, "#1b1d19");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, Hh);

  // The subject, at whatever the lens is currently worth.
  const size = R * (0.8 + session.closeness * 0.7);
  const blur = (1 - focus) * 15;
  ctx.save();
  ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.globalAlpha = 0.5 + focus * 0.5;
  ctx.drawImage(
    subjectCutout(session.smudge.name),
    cx + offX - size / 2, cy + offY - size / 2, size, size
  );
  ctx.restore();

  // Thirds, faint — a framing aid you can ignore.
  ctx.strokeStyle = "rgba(244,239,230,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo((W * i) / 3, 0); ctx.lineTo((W * i) / 3, Hh);
    ctx.moveTo(0, (Hh * i) / 3); ctx.lineTo(W, (Hh * i) / 3);
  }
  ctx.stroke();

  // The reticle: where the lens actually resolves. Turns solid as the subject
  // comes into it, which is the feedback the whole framing skill hangs on.
  const good = session.framing;
  ctx.strokeStyle = `rgba(244,239,230,${0.22 + good * 0.6})`;
  ctx.lineWidth = 1 + good * 1.4;
  ctx.setLineDash(good > 0.75 ? [] : [5, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9);
  ctx.stroke();

  // The focus ring. It closes onto the reticle exactly — at its tightest the
  // two circles coincide, so "fire when it lands on the target" is something
  // you can see rather than a number you have to be told.
  const RETICLE = R * 0.3;
  const ringR = RETICLE + ((ringScale - 0.5) / 1.1) * (R * 0.62 - RETICLE);
  ctx.strokeStyle = `rgba(244,239,230,${0.45 + focus * 0.5})`;
  ctx.lineWidth = 1.5 + focus * 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // --- Gauges ---
  setGauge("pv-g-focus", focus);
  setGauge("pv-g-frame", session.framing);
  setGauge("pv-g-dist", session.closeness);

  // Timed subjects: say plainly when the window is open. Grading a one-second
  // window the player can't see isn't difficulty, it's a coin toss.
  if (session.smudge.kind === "timed") {
    const open = !!session.smudge.timedWindow;
    document.getElementById("pv-window")?.classList.toggle("open", open);
  }

  session.raf = requestAnimationFrame(animate);
}

function setGauge(id: string, v: number) {
  const b = document.getElementById(id);
  if (b) b.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

function fireShutter() {
  if (!session?.running) return;
  session.running = false;
  cancelAnimationFrame(session.raf);
  playShutter();
  const flash = document.getElementById("pv-flash");
  flash?.classList.add("fire");
  setTimeout(() => flash?.classList.remove("fire"), 380);

  const { focus, framing, closeness } = session;
  // Focus and framing are curved: a shot with no skill in it used to land
  // around 60%, which left almost no room above for a shot with skill in it.
  // Distance stays linear — walking closer is a decision, not a precision act.
  const parts = [
    { label: "Focus", amount: Math.pow(focus, 1.6) * 0.5 },
    { label: "Framing", amount: Math.pow(framing, 1.6) * 0.32 },
    { label: "Distance", amount: closeness * 0.18 },
  ];
  let clarity = parts.reduce((n, x) => n + x.amount, 0);

  const bonuses: { label: string; amount: number }[] = [];
  let penalty: string | null = null;

  // Timed subjects: the window is real now, and read at the moment the shutter
  // fires rather than approximated from the focus value.
  if (session.smudge.kind === "timed") {
    if (session.smudge.timedWindow) {
      bonuses.push({ label: "Caught the moment", amount: 0.12 });
    } else {
      clarity *= 0.35;
      penalty = "Missed the moment";
    }
  }

  const night = nightAmount();
  bonuses.push(...gearBonuses(night));
  if (session.smudge.set === "After Dark" && night > 0.5) {
    bonuses.push({ label: "In its element", amount: 0.1 });
  }
  const phase = phaseName();
  if (phase === "Dawn" || phase === "Dusk") {
    bonuses.push({ label: "Golden hour", amount: 0.08 });
  }
  if (focus > 0.94 && framing > 0.9) {
    bonuses.push({ label: "Perfect frame", amount: 0.08 });
  }
  for (const b of bonuses) clarity += b.amount;
  clarity = Math.max(0.05, Math.min(1, clarity));

  setTimeout(() => showResult(clarity, parts, bonuses, penalty), 420);
}

function showResult(
  clarity: number,
  parts: { label: string; amount: number }[],
  bonuses: { label: string; amount: number }[],
  penalty: string | null
) {
  if (!session) return;
  const result = document.getElementById("pv-result")!;
  const thumb = document.getElementById("pv-thumb") as HTMLElement;
  const nameEl = el<HTMLElement>("#pv-result-name");
  const metaEl = el<HTMLElement>("#pv-result-meta");

  const c = document.createElement("canvas");
  c.width = c.height = 220;
  const ctx = c.getContext("2d")!;
  ctx.filter = `blur(${(1 - clarity) * 10}px)`;
  ctx.drawImage(subjectIllustration(session.smudge.name), 0, 0, c.width, c.height);
  ctx.filter = "none";
  thumb.innerHTML = "";
  thumb.appendChild(c);

  nameEl.textContent = session.smudge.name;
  // Show the three components. A grade the player can't take apart teaches
  // them nothing about what to do differently next time.
  const breakdown = parts
    .map((p) => `<span class="pv-part">${p.label} <b>${Math.round(p.amount * 100)}</b></span>`)
    .join("");
  const bonusHtml = bonuses.length
    ? `<div class="pv-bonuses">${bonuses
        .map((b) => `<span class="pv-bonus">${b.label} +${Math.round(b.amount * 100)}%</span>`)
        .join("")}</div>`
    : "";
  const penaltyHtml = penalty
    ? `<div class="pv-bonuses"><span class="pv-bonus bad">${penalty}</span></div>`
    : "";
  const best = session.ctx.best;
  const beat = best !== null && clarity > best
    ? `<div class="pv-beat">New best — was ${Math.round(best * 100)}%</div>` : "";
  metaEl.innerHTML =
    `<strong>${Math.round(clarity * 100)}%</strong> clarity · <span>${session.smudge.set}</span>` +
    `<div class="pv-parts">${breakdown}</div>${penaltyHtml}${bonusHtml}${beat}`;

  result.classList.add("show");

  session.smudge.__lastShot = {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    subjectName: session.smudge.name,
    set: session.smudge.set,
    clarity,
    takenAt: new Date().toISOString(),
  } satisfies Snapshot;
}

function finish(accept: boolean) {
  if (!session) return;
  const overlay = document.getElementById("photo-overlay");
  overlay?.classList.remove("show");
  document.getElementById("pv-result")?.classList.remove("show");
  cancelAnimationFrame(session.raf);
  held.clear();
  const shot = accept ? (session.smudge.__lastShot as Snapshot | undefined) ?? null : null;
  session.smudge.__lastShot = undefined;
  const onComplete = session.onComplete;
  const wasActive = session.active;
  session.active = false;
  session = null;
  if (wasActive) onComplete(shot);
}
