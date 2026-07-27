// Time of day, without the 3D scene attached.
//
// In 3D this drove lights, fog, a sky dome and two celestial bodies. In 2D it
// only has to produce a colour to wash over the frame and a "how dark is it"
// number, which is all the gameplay ever needed from it.

const DAY_LENGTH = 480; // seconds for a full cycle

let timeOfDay = 0.36; // start mid-morning

export function getTimeOfDay() { return timeOfDay; }
export function setTimeOfDay(t: number) { timeOfDay = ((t % 1) + 1) % 1; }
export function advanceDay(dt: number) { timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1; }

/** 0 in full daylight, 1 at night, with dusk and dawn ramps. */
export function nightAmount(): number {
  const t = timeOfDay;
  if (t >= 0.86 || t <= 0.16) return 1;
  if (t > 0.16 && t < 0.26) return 1 - (t - 0.16) / 0.1;
  if (t > 0.76 && t < 0.86) return (t - 0.76) / 0.1;
  return 0;
}

export function clockString(): string {
  const m = Math.floor(timeOfDay * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function phaseName(): string {
  const t = timeOfDay;
  if (t < 0.22) return "Night";
  if (t < 0.31) return "Dawn";
  if (t < 0.7) return "Day";
  if (t < 0.82) return "Dusk";
  return "Night";
}

interface Key { at: number; tint: string; alpha: number }

// A wash laid over the finished frame. Multiply-ish blending in the renderer
// keeps the paper feel rather than just darkening everything to grey.
const KEYS: Key[] = [
  { at: 0.0, tint: "#1b2748", alpha: 0.78 },   // midnight
  { at: 0.25, tint: "#f0b478", alpha: 0.24 },  // sunrise
  { at: 0.5, tint: "#fff6dc", alpha: 0.06 },   // noon
  { at: 0.78, tint: "#e08a52", alpha: 0.3 },   // sunset
];

function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

export function skyWash(): { tint: string; alpha: number } {
  let i0 = KEYS.length - 1;
  let i1 = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const next = KEYS[(i + 1) % KEYS.length];
    const start = KEYS[i].at;
    const end = next.at > start ? next.at : next.at + 1;
    const tt = timeOfDay >= start ? timeOfDay : timeOfDay + 1;
    if (tt >= start && tt <= end) { i0 = i; i1 = (i + 1) % KEYS.length; break; }
  }
  const a = KEYS[i0], b = KEYS[i1];
  const start = a.at;
  const end = b.at > start ? b.at : b.at + 1;
  const tt = timeOfDay >= start ? timeOfDay : timeOfDay + 1;
  const f = (tt - start) / Math.max(0.0001, end - start);
  return { tint: lerpHex(a.tint, b.tint, f), alpha: a.alpha + (b.alpha - a.alpha) * f };
}
