import {
  CanvasTexture,
  Color,
  Group,
  NormalBlending,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import type { Smudge } from "./types.ts";

const NAMES_COMMON = ["Park Cat", "Bench Sitter", "Pigeon Council", "Kite Runner", "Fountain Diver"];
const NAMES_TIMED = ["Comet Sparrow", "Blink Fox"];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeSmudgeTexture(size = 256): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, "rgba(20, 20, 20, 0.95)");
  g.addColorStop(0.55, "rgba(20, 20, 20, 0.55)");
  g.addColorStop(1, "rgba(20, 20, 20, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Sketchy outline swirl
  ctx.strokeStyle = "rgba(20, 20, 20, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    const r = size * (0.28 + Math.sin(a * 3) * 0.05);
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

let SHARED_TEX: CanvasTexture | null = null;
function smudgeTex(): CanvasTexture {
  if (!SHARED_TEX) SHARED_TEX = makeSmudgeTexture();
  return SHARED_TEX;
}

function makeSmudgeSprite(radius: number): Group {
  const g = new Group();
  const mat = new SpriteMaterial({
    map: smudgeTex(),
    color: new Color(0xffffff),
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const sprite = new Sprite(mat);
  sprite.scale.setScalar(radius * 2.4);
  g.add(sprite);
  return g;
}

export function createSmudges(worldWidth: number, worldDepth: number): Smudge[] {
  const r = rand(1337);
  const smudges: Smudge[] = [];
  const clearRadius = 4;
  const cx = worldWidth / 2;
  const cz = worldDepth / 2;
  const pick = (): [number, number] => {
    for (let tries = 0; tries < 40; tries++) {
      const x = 4 + r() * (worldWidth - 8);
      const z = 4 + r() * (worldDepth - 8);
      if (Math.hypot(x - cx, z - cz) >= clearRadius) return [x, z];
    }
    return [worldWidth * 0.75, worldDepth * 0.75];
  };
  for (let i = 0; i < 6; i++) {
    const radius = 0.55 + r() * 0.2;
    const sprite = makeSmudgeSprite(radius);
    const [x, z] = pick();
    const y = 0.9 + r() * 0.5;
    sprite.position.set(x, y, z);
    smudges.push({
      id: `common-${i}`,
      kind: "common",
      worldPos: new Vector3(x, y, z),
      radius,
      wobbleSeed: r() * 100,
      visible: true,
      sprite,
      name: NAMES_COMMON[i % NAMES_COMMON.length],
      set: "Park Life",
    });
  }
  for (let i = 0; i < 2; i++) {
    const radius = 0.5;
    const sprite = makeSmudgeSprite(radius);
    const [x, z] = pick();
    const y = 1.1 + r() * 0.3;
    sprite.position.set(x, y, z);
    sprite.visible = false;
    smudges.push({
      id: `timed-${i}`,
      kind: "timed",
      worldPos: new Vector3(x, y, z),
      radius,
      wobbleSeed: r() * 100,
      visible: false,
      sprite,
      timedWindow: { start: 0, end: 0 },
      name: NAMES_TIMED[i % NAMES_TIMED.length],
      set: "After Dark",
    });
  }
  return smudges;
}

export function attachSmudges(smudges: Smudge[], worldRoot: Group) {
  for (const s of smudges) worldRoot.add(s.sprite);
}

export function updateSmudges(smudges: Smudge[], time: number) {
  for (const s of smudges) {
    if (s.kind === "timed") {
      const cycle = 6;
      const phase = ((time + s.wobbleSeed) % cycle) / cycle;
      if (phase > 0.9) {
        const start = time - (phase - 0.9) * cycle;
        s.timedWindow = { start, end: start + 1 };
        s.visible = true;
      } else {
        s.visible = false;
      }
      s.sprite.visible = s.visible;
    }
    // Idle wobble
    const wobble = Math.sin(time * 2 + s.wobbleSeed) * 0.05;
    s.sprite.position.set(s.worldPos.x, s.worldPos.y + wobble, s.worldPos.z);
  }
}
