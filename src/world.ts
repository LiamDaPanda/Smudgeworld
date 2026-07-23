import type { GameState, ParallaxLayer, Stroke, World } from "./types.ts";

const GROUND_FROM_BOTTOM = 140;

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeStroke(rand: () => number, x0: number, y0: number, len: number, jitter: number): Stroke {
  const points = [];
  const steps = Math.max(4, Math.floor(len / 12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: x0 + t * len,
      y: y0 + (rand() - 0.5) * jitter,
    });
  }
  return { points, weight: 1 };
}

function makeHillLayer(width: number, seed: number, amplitude: number, period: number, baseY: number, color: string, weight: number): ParallaxLayer {
  const rand = seededRand(seed);
  const points = [];
  for (let x = -100; x <= width + 100; x += 20) {
    const y = baseY + Math.sin(x / period + seed) * amplitude + (rand() - 0.5) * amplitude * 0.15;
    points.push({ x, y });
  }
  return {
    factor: 0.35,
    strokes: [{ points, weight }],
    color,
    weight,
  };
}

export function createWorld(width: number): World {
  const groundY = window.innerHeight - GROUND_FROM_BOTTOM;
  const rand = seededRand(42);
  const strokes: Stroke[] = [];

  strokes.push({
    points: (() => {
      const pts = [];
      for (let x = 0; x <= width; x += 8) {
        pts.push({ x, y: groundY + (rand() - 0.5) * 2 });
      }
      return pts;
    })(),
    weight: 1.4,
  });

  for (let i = 0; i < 60; i++) {
    const x = rand() * width;
    strokes.push(makeStroke(rand, x, groundY + 6 + rand() * 20, 30 + rand() * 40, 3));
  }

  for (let i = 0; i < 24; i++) {
    const x = 200 + rand() * (width - 400);
    const trunkH = 60 + rand() * 60;
    const trunkTop = groundY - trunkH;
    strokes.push({ points: [{ x, y: groundY }, { x: x + (rand() - 0.5) * 6, y: trunkTop }], weight: 1.2 });
    const crown = 30 + rand() * 20;
    const crownPts = [];
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.35) {
      crownPts.push({
        x: x + Math.cos(a) * crown + (rand() - 0.5) * 6,
        y: trunkTop + Math.sin(a) * crown * 0.7 + (rand() - 0.5) * 5,
      });
    }
    strokes.push({ points: crownPts, weight: 1 });
  }

  const parallax: ParallaxLayer[] = [
    makeHillLayer(width, 7, 40, 260, groundY - 120, "#c9c1b3", 1.1),
    makeHillLayer(width, 13, 24, 180, groundY - 60, "#a89f8e", 1),
  ];
  parallax[0].factor = 0.25;
  parallax[1].factor = 0.5;

  return { width, groundY, strokes, parallax };
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, offsetX: number, color: string, weight: number) {
  if (s.points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x - offsetX, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x - offsetX, s.points[i].y);
  }
  ctx.stroke();
}

export function drawWorld(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, w, h);

  for (const layer of state.world.parallax) {
    const offset = state.cameraX * layer.factor;
    for (const s of layer.strokes) drawStroke(ctx, s, offset, layer.color, layer.weight);
  }

  for (const s of state.world.strokes) drawStroke(ctx, s, state.cameraX, "#2b2b2b", s.weight);
}
