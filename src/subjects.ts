// Stylized ink illustrations for each smudge subject, drawn on canvas.
// Rendered inside the photo-mode viewfinder as the "revealed" creature.

const cache = new Map<string, HTMLCanvasElement>();

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  s: number; // canvas size (square)
}

function base(size = 320): DrawCtx {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e2dcc9";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { ctx, s: size };
}

function drawParkCat(d: DrawCtx) {
  const { ctx, s } = d;
  const cx = s / 2, cy = s * 0.6;
  ctx.fillStyle = "#c48752";
  // body oval
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.25, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.18, cy - s * 0.06, s * 0.11, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ears
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.24, cy - s * 0.14); ctx.lineTo(cx - s * 0.22, cy - s * 0.22); ctx.lineTo(cx - s * 0.18, cy - s * 0.16); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, cy - s * 0.14); ctx.lineTo(cx - s * 0.12, cy - s * 0.22); ctx.lineTo(cx - s * 0.08, cy - s * 0.16); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // eye
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - s * 0.2, cy - s * 0.07, 3, 0, Math.PI * 2);
  ctx.fill();
  // tail curl
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.22, cy);
  ctx.quadraticCurveTo(cx + s * 0.4, cy - s * 0.08, cx + s * 0.32, cy - s * 0.18);
  ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy + s * 0.14); ctx.lineTo(cx - s * 0.1, cy + s * 0.2);
  ctx.moveTo(cx + s * 0.14, cy + s * 0.14); ctx.lineTo(cx + s * 0.14, cy + s * 0.2);
  ctx.stroke();
}

function drawBenchSitter(d: DrawCtx) {
  const { ctx, s } = d;
  const cx = s / 2, cy = s * 0.55;
  // bench slat
  ctx.fillStyle = "#a97848";
  ctx.fillRect(cx - s * 0.35, cy + s * 0.1, s * 0.7, s * 0.05);
  ctx.strokeRect(cx - s * 0.35, cy + s * 0.1, s * 0.7, s * 0.05);
  // legs
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy + s * 0.15); ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
  ctx.moveTo(cx + s * 0.32, cy + s * 0.15); ctx.lineTo(cx + s * 0.3, cy + s * 0.3);
  ctx.stroke();
  // person sitting: body
  ctx.fillStyle = "#5a4a70";
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.09, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // head
  ctx.fillStyle = "#e5c9a0";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.16, s * 0.06, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // legs to bench
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.05, cy + s * 0.1); ctx.lineTo(cx - s * 0.08, cy + s * 0.22);
  ctx.moveTo(cx + s * 0.05, cy + s * 0.1); ctx.lineTo(cx + s * 0.08, cy + s * 0.22);
  ctx.stroke();
  // book in hands
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(cx - s * 0.05, cy + s * 0.02, s * 0.1, s * 0.05);
  ctx.strokeRect(cx - s * 0.05, cy + s * 0.02, s * 0.1, s * 0.05);
}

function drawPigeonCouncil(d: DrawCtx) {
  const { ctx, s } = d;
  const drawPigeon = (x: number, y: number, r: number) => {
    ctx.fillStyle = "#8f8880";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath();
    ctx.arc(x - r * 1.1, y - r * 0.5, r * 0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // beak
    ctx.fillStyle = "#c99860";
    ctx.beginPath();
    ctx.moveTo(x - r * 1.6, y - r * 0.4); ctx.lineTo(x - r * 1.85, y - r * 0.4); ctx.lineTo(x - r * 1.6, y - r * 0.25);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // legs
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y + r * 0.85); ctx.lineTo(x - r * 0.4, y + r * 1.2);
    ctx.moveTo(x + r * 0.4, y + r * 0.85); ctx.lineTo(x + r * 0.4, y + r * 1.2);
    ctx.stroke();
    // eye
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(x - r * 1.25, y - r * 0.55, 2, 0, Math.PI * 2);
    ctx.fill();
  };
  drawPigeon(s * 0.35, s * 0.65, s * 0.08);
  drawPigeon(s * 0.55, s * 0.6, s * 0.09);
  drawPigeon(s * 0.72, s * 0.68, s * 0.075);
}

function drawKiteRunner(d: DrawCtx) {
  const { ctx, s } = d;
  // kite in the sky
  ctx.fillStyle = "#c4585a";
  ctx.beginPath();
  ctx.moveTo(s * 0.7, s * 0.15);
  ctx.lineTo(s * 0.85, s * 0.28);
  ctx.lineTo(s * 0.7, s * 0.42);
  ctx.lineTo(s * 0.55, s * 0.28);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // kite tail
  ctx.beginPath();
  ctx.moveTo(s * 0.7, s * 0.42);
  ctx.quadraticCurveTo(s * 0.6, s * 0.55, s * 0.5, s * 0.62);
  ctx.stroke();
  // string
  ctx.strokeStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.moveTo(s * 0.55, s * 0.28);
  ctx.quadraticCurveTo(s * 0.4, s * 0.5, s * 0.32, s * 0.68);
  ctx.stroke();
  // runner (stick figure)
  ctx.strokeStyle = "#1a1a1a";
  const rx = s * 0.28, ry = s * 0.7;
  ctx.beginPath();
  ctx.arc(rx, ry - s * 0.06, s * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx, ry - s * 0.02); ctx.lineTo(rx, ry + s * 0.08);
  ctx.moveTo(rx, ry + s * 0.08); ctx.lineTo(rx - s * 0.04, ry + s * 0.16);
  ctx.moveTo(rx, ry + s * 0.08); ctx.lineTo(rx + s * 0.04, ry + s * 0.16);
  ctx.moveTo(rx, ry); ctx.lineTo(rx - s * 0.07, ry + s * 0.02);
  ctx.moveTo(rx, ry); ctx.lineTo(rx + s * 0.07, ry - s * 0.02);
  ctx.stroke();
}

function drawFountainDiver(d: DrawCtx) {
  const { ctx, s } = d;
  // fountain basin
  ctx.fillStyle = "#a5c0d0";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.72, s * 0.32, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // basin stone rim
  ctx.strokeStyle = "#4a463d";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.78, s * 0.34, s * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  // water jets
  ctx.strokeStyle = "#6a8fb0";
  for (let i = -2; i <= 2; i++) {
    const dx = i * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(s * 0.5 + dx, s * 0.65);
    ctx.quadraticCurveTo(s * 0.5 + dx * 3, s * 0.35, s * 0.5 + dx * 5, s * 0.55);
    ctx.stroke();
  }
  // diver silhouette (curved figure)
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#3a4a5a";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.5, s * 0.05, s * 0.11, Math.PI / 5, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.5 + s * 0.07, s * 0.42, s * 0.035, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function drawCometSparrow(d: DrawCtx) {
  const { ctx, s } = d;
  // dark sky wash
  ctx.fillStyle = "#141926";
  ctx.fillRect(0, 0, s, s);
  // stars
  ctx.fillStyle = "#f4efe6";
  for (let i = 0; i < 20; i++) {
    ctx.fillRect(Math.random() * s, Math.random() * s * 0.7, 1.5, 1.5);
  }
  // comet trail
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, "rgba(244,239,230,0)");
  grad.addColorStop(0.6, "rgba(244,239,230,0.35)");
  grad.addColorStop(1, "rgba(244,239,230,0.9)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.15);
  ctx.lineTo(s * 0.7, s * 0.6);
  ctx.stroke();
  // sparrow silhouette (wings up)
  ctx.strokeStyle = "#f4efe6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, s * 0.55);
  ctx.quadraticCurveTo(s * 0.65, s * 0.4, s * 0.75, s * 0.55);
  ctx.quadraticCurveTo(s * 0.7, s * 0.6, s * 0.75, s * 0.68);
  ctx.quadraticCurveTo(s * 0.65, s * 0.62, s * 0.55, s * 0.55);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "#141926";
  ctx.fill();
}

function drawBlinkFox(d: DrawCtx) {
  const { ctx, s } = d;
  // fox body
  ctx.fillStyle = "#c86a3a";
  const cx = s / 2, cy = s * 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.24, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // head
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.05);
  ctx.lineTo(cx - s * 0.32, cy - s * 0.02);
  ctx.lineTo(cx - s * 0.32, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.08);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // ears
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.25, cy - s * 0.05); ctx.lineTo(cx - s * 0.24, cy - s * 0.14); ctx.lineTo(cx - s * 0.2, cy - s * 0.06); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // white face patch
  ctx.fillStyle = "#f4efe6";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, cy + s * 0.02);
  ctx.lineTo(cx - s * 0.32, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.26, cy + s * 0.07);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - s * 0.24, cy - s * 0.03, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // tail
  ctx.fillStyle = "#c86a3a";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.2, cy);
  ctx.quadraticCurveTo(cx + s * 0.38, cy - s * 0.02, cx + s * 0.4, cy - s * 0.16);
  ctx.quadraticCurveTo(cx + s * 0.32, cy - s * 0.05, cx + s * 0.24, cy + s * 0.02);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // tail tip
  ctx.fillStyle = "#f4efe6";
  ctx.beginPath();
  ctx.arc(cx + s * 0.4, cy - s * 0.15, s * 0.03, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, cy + s * 0.13); ctx.lineTo(cx - s * 0.12, cy + s * 0.22);
  ctx.moveTo(cx + s * 0.1, cy + s * 0.13); ctx.lineTo(cx + s * 0.1, cy + s * 0.22);
  ctx.stroke();
}

function drawHeron(d: DrawCtx) {
  const { ctx, s } = d;
  // reeds behind
  ctx.strokeStyle = "#4a6a3a";
  for (let i = 0; i < 5; i++) {
    const x = s * (0.14 + i * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, s * 0.85);
    ctx.quadraticCurveTo(x - s * 0.02, s * 0.6, x + s * 0.01, s * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = "#1a1a1a";
  // water line
  ctx.fillStyle = "#a5c0d0";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.86, s * 0.46, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // long legs
  ctx.beginPath();
  ctx.moveTo(s * 0.52, s * 0.84); ctx.lineTo(s * 0.53, s * 0.6);
  ctx.moveTo(s * 0.58, s * 0.84); ctx.lineTo(s * 0.56, s * 0.6);
  ctx.stroke();
  // body
  ctx.fillStyle = "#c3c9d2";
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.52, s * 0.13, s * 0.09, -0.25, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // long neck (S curve)
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.48);
  ctx.quadraticCurveTo(s * 0.4, s * 0.38, s * 0.46, s * 0.28);
  ctx.quadraticCurveTo(s * 0.5, s * 0.2, s * 0.55, s * 0.22);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineWidth = 2;
  // head
  ctx.fillStyle = "#c3c9d2";
  ctx.beginPath();
  ctx.ellipse(s * 0.57, s * 0.21, s * 0.045, s * 0.032, 0.2, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // beak
  ctx.fillStyle = "#d8b25a";
  ctx.beginPath();
  ctx.moveTo(s * 0.61, s * 0.21); ctx.lineTo(s * 0.74, s * 0.25); ctx.lineTo(s * 0.61, s * 0.24);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // eye
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(s * 0.585, s * 0.2, 2, 0, Math.PI * 2); ctx.fill();
}

function drawKoiShadow(d: DrawCtx) {
  const { ctx, s } = d;
  // pond surface fills the frame
  ctx.fillStyle = "#8fb0c4";
  ctx.fillRect(0, 0, s, s);
  // surface hatch
  ctx.strokeStyle = "rgba(26,26,26,0.25)";
  for (let i = 0; i < 22; i++) {
    const y = Math.random() * s;
    const x = Math.random() * s;
    const w = s * (0.06 + Math.random() * 0.1);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  }
  // two koi seen from above, one bright one pale
  const koi = (cx: number, cy: number, rot: number, fill: string, scale: number) => {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.13, s * 0.055, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, 0);
    ctx.lineTo(-s * 0.2, -s * 0.05);
    ctx.lineTo(-s * 0.2, s * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  koi(s * 0.42, s * 0.44, -0.3, "#e08a4a", 1);
  koi(s * 0.62, s * 0.66, 0.5, "#f0e6d8", 0.8);
  // ripple ring
  ctx.strokeStyle = "rgba(244,239,230,0.6)";
  ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.34, 0, Math.PI * 2); ctx.stroke();
}

function drawDragonfly(d: DrawCtx) {
  const { ctx, s } = d;
  const cx = s * 0.5, cy = s * 0.5;
  // reed it's perched on
  ctx.strokeStyle = "#4a6a3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s); ctx.quadraticCurveTo(s * 0.46, s * 0.7, s * 0.52, s * 0.52);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1a1a1a";
  // wings — four translucent blades
  ctx.fillStyle = "rgba(190,215,225,0.55)";
  const wing = (dx: number, dy: number, rot: number) => {
    ctx.save();
    ctx.translate(cx + dx, cy + dy); ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(s * 0.13, 0, s * 0.14, s * 0.035, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  wing(0, -s * 0.02, -0.35);
  wing(0, -s * 0.02, Math.PI + 0.35);
  wing(0, s * 0.02, 0.3);
  wing(0, s * 0.02, Math.PI - 0.3);
  // body
  ctx.fillStyle = "#3f8a9a";
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.028, s * 0.02, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // long abdomen
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - s * 0.22, cy + s * 0.06);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#3f8a9a";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1a1a1a";
  // head + eyes
  ctx.fillStyle = "#2b6b78";
  ctx.beginPath(); ctx.arc(cx + s * 0.04, cy - s * 0.005, s * 0.028, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function drawFrogChorus(d: DrawCtx) {
  const { ctx, s } = d;
  // lily pads on water
  ctx.fillStyle = "#8fb0c4";
  ctx.fillRect(0, s * 0.55, s, s * 0.45);
  const pad = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = "#5f8a48";
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.55, 0, 0.35, Math.PI * 2 + 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  };
  pad(s * 0.3, s * 0.78, s * 0.17);
  pad(s * 0.68, s * 0.85, s * 0.14);
  // frogs
  const frog = (cx: number, cy: number, sc: number) => {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc);
    ctx.fillStyle = "#6d9a4a";
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.075, s * 0.055, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // eyes on top
    ctx.beginPath(); ctx.arc(-s * 0.03, -s * 0.05, s * 0.022, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.03, -s * 0.05, s * 0.022, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(-s * 0.03, -s * 0.05, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.03, -s * 0.05, 2, 0, Math.PI * 2); ctx.fill();
    // back legs
    ctx.strokeStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, s * 0.03); ctx.lineTo(-s * 0.1, s * 0.06);
    ctx.moveTo(s * 0.06, s * 0.03); ctx.lineTo(s * 0.1, s * 0.06);
    ctx.stroke();
    ctx.restore();
  };
  frog(s * 0.3, s * 0.72, 1);
  frog(s * 0.68, s * 0.79, 0.8);
  // croak marks
  ctx.strokeStyle = "rgba(26,26,26,0.5)";
  ctx.beginPath();
  ctx.arc(s * 0.42, s * 0.62, s * 0.05, -0.9, 0.4); ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.42, s * 0.62, s * 0.08, -0.8, 0.3); ctx.stroke();
}

const drawers: Record<string, (d: DrawCtx) => void> = {
  "Heron": drawHeron,
  "Koi Shadow": drawKoiShadow,
  "Dragonfly": drawDragonfly,
  "Frog Chorus": drawFrogChorus,
  "Park Cat": drawParkCat,
  "Bench Sitter": drawBenchSitter,
  "Pigeon Council": drawPigeonCouncil,
  "Kite Runner": drawKiteRunner,
  "Fountain Diver": drawFountainDiver,
  "Comet Sparrow": drawCometSparrow,
  "Blink Fox": drawBlinkFox,
};

export function subjectIllustration(name: string): HTMLCanvasElement {
  if (cache.has(name)) return cache.get(name)!;
  const d = base();
  const draw = drawers[name];
  if (draw) draw(d);
  else {
    // generic silhouette fallback
    d.ctx.fillStyle = "#8a7a5a";
    d.ctx.beginPath();
    d.ctx.arc(d.s / 2, d.s / 2, d.s * 0.2, 0, Math.PI * 2);
    d.ctx.fill();
    d.ctx.stroke();
  }
  cache.set(name, d.ctx.canvas);
  return d.ctx.canvas;
}
