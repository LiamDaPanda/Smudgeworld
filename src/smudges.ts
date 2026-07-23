import type { GameState, Smudge } from "./types.ts";

const NAMES_COMMON = ["Park Cat", "Bench Sitter", "Pigeon Council", "Kite Runner", "Fountain Diver"];
const NAMES_TIMED = ["Comet Sparrow", "Blink Fox"];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function createSmudges(worldWidth: number): Smudge[] {
  const r = rand(1337);
  const smudges: Smudge[] = [];
  for (let i = 0; i < 5; i++) {
    smudges.push({
      id: `common-${i}`,
      kind: "common",
      x: 500 + i * (worldWidth / 6) + r() * 60,
      baseY: 60 + r() * 40,
      radius: 22 + r() * 10,
      wobbleSeed: r() * 100,
      visible: true,
      name: NAMES_COMMON[i % NAMES_COMMON.length],
      set: "Park Life",
    });
  }
  for (let i = 0; i < 2; i++) {
    smudges.push({
      id: `timed-${i}`,
      kind: "timed",
      x: 900 + i * 1400 + r() * 100,
      baseY: 90 + r() * 30,
      radius: 18,
      wobbleSeed: r() * 100,
      visible: false,
      timedWindow: { start: 0, end: 0 },
      name: NAMES_TIMED[i % NAMES_TIMED.length],
      set: "After Dark",
    });
  }
  return smudges;
}

export function updateSmudges(smudges: Smudge[], time: number) {
  for (const s of smudges) {
    if (s.kind !== "timed") continue;
    const cycle = 6;
    const phase = ((time + s.wobbleSeed) % cycle) / cycle;
    if (phase > 0.9) {
      const start = time - (phase - 0.9) * cycle;
      s.timedWindow = { start, end: start + 1 };
      s.visible = true;
    } else {
      s.visible = false;
    }
  }
}

export function drawSmudges(ctx: CanvasRenderingContext2D, state: GameState, _w: number, _h: number) {
  const groundY = state.world.groundY;
  for (const s of state.smudges) {
    if (!s.visible) continue;
    const sx = s.x - state.cameraX;
    const sy = groundY - s.baseY;
    if (sx < -100 || sx > window.innerWidth + 100) continue;

    const wobble = Math.sin(state.time * 2 + s.wobbleSeed) * 2;
    ctx.save();
    ctx.translate(sx + wobble, sy);
    const grad = ctx.createRadialGradient(0, 0, s.radius * 0.2, 0, 0, s.radius);
    grad.addColorStop(0, "rgba(30,30,30,0.85)");
    grad.addColorStop(1, "rgba(30,30,30,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(20,20,20,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = s.radius * (0.8 + Math.sin(a * 3 + s.wobbleSeed) * 0.15);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
