import { playShutter, playUiTick } from "./audio.ts";
import { nightAmount, phaseName } from "./daynight.ts";
import { subjectIllustration } from "./subjects.ts";
import type { Smudge, Snapshot } from "./types.ts";

type OnComplete = (snapshot: Snapshot | null) => void;

interface Session {
  smudge: Smudge;
  onComplete: OnComplete;
  running: boolean;
  startAt: number;
  frameFocus: number; // 0..1 (perfect at 1)
  raf: number;
  ringPhase: number;
  active: boolean;
}

let session: Session | null = null;

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
    <div class="pv-viewfinder">
      <div class="pv-scene">
        <canvas id="pv-subject-canvas" width="320" height="320"></canvas>
        <div class="pv-focus-ring" id="pv-focus-ring"></div>
        <div class="pv-focus-target"></div>
      </div>
      <div class="pv-bracket tl"></div>
      <div class="pv-bracket tr"></div>
      <div class="pv-bracket bl"></div>
      <div class="pv-bracket br"></div>
      <div class="pv-meta">
        <div class="pv-name" id="pv-name">Park Cat</div>
        <div class="pv-hint">tap when the focus ring is smallest for the sharpest shot</div>
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

  document.getElementById("pv-cancel")?.addEventListener("click", () => finish(false));
  document.getElementById("pv-shutter")?.addEventListener("click", fireShutter);
  document.getElementById("pv-done")?.addEventListener("click", () => finish(true));
  window.addEventListener("keydown", (e) => {
    if (!session?.active) return;
    if (e.key === "Escape") finish(false);
    if (e.key === " " || e.key === "Enter") {
      // If result panel showing, treat as done, else fire shutter
      const result = document.getElementById("pv-result");
      if (result?.classList.contains("show")) finish(true);
      else fireShutter();
      e.preventDefault();
    }
  });
}

export function isPhotoModeActive() {
  return !!session?.active;
}

export function startPhotoMode(smudge: Smudge, onComplete: OnComplete) {
  ensureUI();
  session = {
    smudge,
    onComplete,
    running: true,
    startAt: performance.now(),
    frameFocus: 0,
    raf: 0,
    ringPhase: 0,
    active: true,
  };

  const overlay = document.getElementById("photo-overlay")!;
  playUiTick();
  overlay.classList.add("show");
  overlay.classList.remove("firing");
  document.getElementById("pv-result")!.classList.remove("show");

  const subjectCanvas = document.getElementById("pv-subject-canvas") as HTMLCanvasElement;
  const targetCtx = subjectCanvas.getContext("2d")!;
  targetCtx.clearRect(0, 0, subjectCanvas.width, subjectCanvas.height);
  targetCtx.drawImage(subjectIllustration(smudge.name), 0, 0, subjectCanvas.width, subjectCanvas.height);

  el<HTMLElement>("#pv-name").textContent = smudge.name;
  const ring = el<HTMLElement>("#pv-focus-ring");
  ring.style.transform = "translate(-50%, -50%) scale(1.6)";

  animate();
}

function animate() {
  if (!session?.running) return;
  const t = (performance.now() - session.startAt) / 1000;
  // Focus ring oscillates: expands out, contracts to 0, expands out, ...
  const cycle = 1.6; // seconds
  const phase = (t % cycle) / cycle; // 0..1
  session.ringPhase = phase;
  // Convert to scale: 1.6 → 0.5 → 1.6 (triangle)
  const p = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0..1..0
  const scale = 1.6 - p * 1.1;
  const ring = document.getElementById("pv-focus-ring");
  if (ring) ring.style.transform = `translate(-50%, -50%) scale(${scale})`;
  session.frameFocus = 1 - Math.abs(scale - 0.5) / 1.1; // 1 at scale 0.5, 0 at 1.6
  session.raf = requestAnimationFrame(animate);
}

function fireShutter() {
  if (!session?.running) return;
  session.running = false;
  cancelAnimationFrame(session.raf);
  playShutter();
  const flash = document.getElementById("pv-flash");
  flash?.classList.add("fire");
  setTimeout(() => flash?.classList.remove("fire"), 380);

  const focus = session.frameFocus;
  // Timing gate for timed smudges — narrower window
  let timingScore = 1;
  if (session.smudge.kind === "timed" && session.smudge.timedWindow) {
    // For photo mode we approximate: focus quality gates the timed shot too
    timingScore = focus > 0.6 ? focus : 0;
  }
  let clarity = Math.max(0.15, Math.min(1, focus * 0.85 + timingScore * 0.15));

  // Condition bonuses, per the design doc: shooting a subject in its element
  // develops a sharper picture. Night subjects caught after dark, and any
  // subject caught in the golden light of dawn or dusk, both grade up.
  const bonuses: { label: string; amount: number }[] = [];
  const night = nightAmount();
  if (session.smudge.set === "After Dark" && night > 0.5) {
    bonuses.push({ label: "Night film", amount: 0.1 });
  }
  const phase = phaseName();
  if (phase === "Dawn" || phase === "Dusk") {
    bonuses.push({ label: "Golden hour", amount: 0.08 });
  }
  if (focus > 0.94) {
    bonuses.push({ label: "Pin-sharp focus", amount: 0.05 });
  }
  for (const b of bonuses) clarity += b.amount;
  clarity = Math.min(1, clarity);

  setTimeout(() => showResult(clarity, bonuses), 420);
}

function showResult(clarity: number, bonuses: { label: string; amount: number }[] = []) {
  if (!session) return;
  const result = document.getElementById("pv-result")!;
  const thumb = document.getElementById("pv-thumb") as HTMLElement;
  const nameEl = el<HTMLElement>("#pv-result-name");
  const metaEl = el<HTMLElement>("#pv-result-meta");

  // Build a canvas with the subject at clarity-based blur
  const c = document.createElement("canvas");
  c.width = c.height = 220;
  const ctx = c.getContext("2d")!;
  ctx.filter = `blur(${(1 - clarity) * 10}px)`;
  ctx.drawImage(subjectIllustration(session.smudge.name), 0, 0, c.width, c.height);
  ctx.filter = "none";
  thumb.innerHTML = "";
  thumb.appendChild(c);

  nameEl.textContent = session.smudge.name;
  const bonusHtml = bonuses.length
    ? `<div class="pv-bonuses">${bonuses
        .map((b) => `<span class="pv-bonus">${b.label} +${Math.round(b.amount * 100)}%</span>`)
        .join("")}</div>`
    : "";
  metaEl.innerHTML =
    `<strong>${Math.round(clarity * 100)}%</strong> clarity · <span>${session.smudge.set}</span>${bonusHtml}`;

  result.classList.add("show");

  // Stash the finished snapshot for finish()
  session.smudge.__lastShot = {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    subjectName: session.smudge.name,
    set: session.smudge.set,
    clarity,
    takenAt: new Date().toISOString(),
  } as Snapshot;
}

function finish(accept: boolean) {
  if (!session) return;
  const overlay = document.getElementById("photo-overlay");
  overlay?.classList.remove("show");
  document.getElementById("pv-result")?.classList.remove("show");
  const shot = accept ? session.smudge.__lastShot ?? null : null;
  session.smudge.__lastShot = undefined;
  const onComplete = session.onComplete;
  const wasActive = session.active;
  session.active = false;
  session = null;
  if (wasActive) onComplete(shot);
}
