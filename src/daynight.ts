import { Color, MeshBasicMaterial, PointsMaterial } from "three";
import { getLampGlows, paintSky, type WorldHandles } from "./world.ts";
import type { Celestial } from "./celestial.ts";

// The sun and moon bodies, handed in once at boot so the cycle can fade them.
let sunBody: Celestial | null = null;
let moonBody: Celestial | null = null;
export function registerCelestials(sun: Celestial, moon: Celestial) {
  sunBody = sun;
  moonBody = moon;
}

// A full day takes DAY_LENGTH seconds of real time. Long enough that a session
// sees the light change, short enough that a player chasing an After Dark
// smudge doesn't have to wait forever.
const DAY_LENGTH = 480; // 8 minutes

/**
 * Time of day as 0..1, where:
 *   0.00 midnight · 0.25 sunrise · 0.50 noon · 0.75 sunset
 * Starts mid-morning so a new player begins in comfortable daylight.
 */
let timeOfDay = 0.36;

export function getTimeOfDay() { return timeOfDay; }
export function setTimeOfDay(t: number) { timeOfDay = ((t % 1) + 1) % 1; }

/**
 * 0 in full daylight, 1 in full night, with smooth dusk/dawn ramps. Drives
 * night-only smudges, lamp glow, star opacity, and the audio bed.
 */
export function nightAmount(): number {
  const t = timeOfDay;
  // Night runs from ~0.80 through ~0.20 (wrapping midnight)
  if (t >= 0.86 || t <= 0.16) return 1;
  if (t > 0.16 && t < 0.26) return 1 - (t - 0.16) / 0.1;   // dawn ramp down
  if (t > 0.76 && t < 0.86) return (t - 0.76) / 0.1;        // dusk ramp up
  return 0;
}

/** Human-readable clock, e.g. "06:45". */
export function clockString(): string {
  const totalMin = Math.floor(timeOfDay * 24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Coarse label used by the HUD and by condition bonuses later. */
export function phaseName(): string {
  const t = timeOfDay;
  if (t < 0.22) return "Night";
  if (t < 0.31) return "Dawn";
  if (t < 0.70) return "Day";
  if (t < 0.82) return "Dusk";
  return "Night";
}

interface Palette {
  top: string; mid: string; horizon: string;
  sunColor: number; sunIntensity: number;
  fillColor: number; fillIntensity: number;
  ambient: number; ambientIntensity: number;
  fog: string;
}

// Key palettes at midnight / sunrise / noon / sunset, interpolated between.
const KEYS: { at: number; p: Palette }[] = [
  {
    at: 0.0, // midnight — deep blue paper, cold moonlight
    p: {
      top: "#1a2233", mid: "#27324a", horizon: "#3b4258",
      sunColor: 0x9fb4d8, sunIntensity: 0.28,
      fillColor: 0x6f84ad, fillIntensity: 0.16,
      ambient: 0x8ea0c4, ambientIntensity: 0.3,
      fog: "#2b3348",
    },
  },
  {
    at: 0.25, // sunrise — warm peach wash
    p: {
      top: "#7e97bd", mid: "#e8b184", horizon: "#f5d4a4",
      sunColor: 0xffcf9a, sunIntensity: 0.85,
      fillColor: 0xb9c8e0, fillIntensity: 0.35,
      ambient: 0xffe6cc, ambientIntensity: 0.5,
      fog: "#ecd3b4",
    },
  },
  {
    at: 0.5, // noon — soft blue overhead washing down to warm paper
    // The old daytime sky was #dfe4e8 to #f6f0e2, which is very nearly white
    // top to bottom. It read as a blank sheet above the treeline and gave the
    // clouds nothing to sit against. A blue at the zenith grading into the
    // paper tone at the horizon is what a wash actually does.
    p: {
      top: "#a6c1da", mid: "#d2dee2", horizon: "#f4eee1",
      sunColor: 0xfff2d0, sunIntensity: 1.1,
      fillColor: 0xc8d4e2, fillIntensity: 0.4,
      ambient: 0xffffff, ambientIntensity: 0.55,
      fog: "#f4efe6",
    },
  },
  {
    at: 0.78, // sunset — amber and rose
    p: {
      top: "#5c6b95", mid: "#dd9668", horizon: "#f1c392",
      sunColor: 0xffb877, sunIntensity: 0.75,
      fillColor: 0x9aa8cc, fillIntensity: 0.3,
      ambient: 0xffd9b8, ambientIntensity: 0.45,
      fog: "#e5bb96",
    },
  },
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

const cA = new Color();
const cB = new Color();
const cOut = new Color();
function lerpHex(a: string, b: string, t: number): string {
  cA.set(a); cB.set(b);
  cOut.copy(cA).lerp(cB, t);
  return "#" + cOut.getHexString();
}

function lerpNum(a: number, b: number, t: number): number {
  cA.setHex(a); cB.setHex(b);
  cOut.copy(cA).lerp(cB, t);
  return cOut.getHex();
}

function paletteAt(t: number): Palette {
  // Find the bracketing keys, wrapping around midnight
  let i0 = KEYS.length - 1;
  let i1 = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const next = KEYS[(i + 1) % KEYS.length];
    const start = KEYS[i].at;
    const end = next.at > start ? next.at : next.at + 1;
    const tt = t >= start ? t : t + 1;
    if (tt >= start && tt <= end) { i0 = i; i1 = (i + 1) % KEYS.length; break; }
  }
  const a = KEYS[i0];
  const b = KEYS[i1];
  const start = a.at;
  const end = b.at > start ? b.at : b.at + 1;
  const tt = t >= start ? t : t + 1;
  const f = (tt - start) / Math.max(0.0001, end - start);
  return {
    top: lerpHex(a.p.top, b.p.top, f),
    mid: lerpHex(a.p.mid, b.p.mid, f),
    horizon: lerpHex(a.p.horizon, b.p.horizon, f),
    sunColor: lerpNum(a.p.sunColor, b.p.sunColor, f),
    sunIntensity: lerp(a.p.sunIntensity, b.p.sunIntensity, f),
    fillColor: lerpNum(a.p.fillColor, b.p.fillColor, f),
    fillIntensity: lerp(a.p.fillIntensity, b.p.fillIntensity, f),
    ambient: lerpNum(a.p.ambient, b.p.ambient, f),
    ambientIntensity: lerp(a.p.ambientIntensity, b.p.ambientIntensity, f),
    fog: lerpHex(a.p.fog, b.p.fog, f),
  };
}

let lastPaintedKey = "";

export function updateDayNight(dt: number, w: WorldHandles, worldWidth: number, worldDepth: number) {
  timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
  const p = paletteAt(timeOfDay);

  // Repainting the sky canvas every frame is wasteful; only redo it when the
  // rounded palette actually changes (~256 steps across a full day).
  const key = `${p.top}|${p.mid}|${p.horizon}`;
  if (key !== lastPaintedKey) {
    lastPaintedKey = key;
    w.scene.background = paintSky(p.top, p.mid, p.horizon);
  }

  w.sun.color.setHex(p.sunColor);
  w.sun.intensity = p.sunIntensity;
  w.fill.color.setHex(p.fillColor);
  w.fill.intensity = p.fillIntensity;
  w.ambient.color.setHex(p.ambient);
  w.ambient.intensity = p.ambientIntensity;
  w.fog.color.set(p.fog);

  const night = nightAmount();

  // Sun and moon ride the same arc half a day apart, so one is always setting
  // as the other rises. Each fades out as it dips toward the horizon rather
  // than sinking through the ground.
  const arcR = Math.max(worldWidth, worldDepth) * 0.62;
  const place = (mount: { position: { set: (x: number, y: number, z: number) => void } }, phase: number) => {
    const a = (phase - 0.25) * Math.PI * 2;
    const y = Math.sin(a) * arcR * 0.5;
    mount.position.set(worldWidth / 2 + Math.cos(a) * arcR, 5 + y, -42);
    // Fade out only once the body is well down behind the range, so the sun
    // still hangs low and warm through golden hour instead of blinking off
    // while it's plainly still in the sky.
    return Math.max(0, Math.min(1, (y + arcR * 0.18) / (arcR * 0.15)));
  };
  const sunVis = place(w.sunDisc, timeOfDay);
  const moonVis = place(w.moonDisc, (timeOfDay + 0.5) % 1);
  sunBody?.fade(sunVis);
  moonBody?.fade(moonVis);

  // Key light follows whichever body is up
  const lightAng = (timeOfDay - 0.25) * Math.PI * 2;
  w.sun.position.set(Math.cos(lightAng) * 1.6, Math.max(0.25, Math.sin(lightAng) + 0.5), -0.6);

  // Stars fade in with night
  (w.stars.material as PointsMaterial).opacity = night * 0.9;

  // Lamps warm up at dusk
  for (const { glow, bulb } of getLampGlows()) {
    (glow.material as MeshBasicMaterial).opacity = night * 0.7;
    const bm = bulb.material as MeshBasicMaterial;
    cA.set("#6b6250"); cB.set("#ffe9a8");
    bm.color.copy(cA).lerp(cB, night);
  }
}
