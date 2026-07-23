import type { InputState } from "./types.ts";

export function createInput(canvas: HTMLCanvasElement): InputState {
  const keys = new Set<string>();
  let snapPending = false;
  let aimX = window.innerWidth / 2;
  let aimY = window.innerHeight / 2;

  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === " " || e.code === "Space") {
      snapPending = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove", (e) => {
    aimX = e.clientX;
    aimY = e.clientY;
  });
  canvas.addEventListener("mousedown", () => {
    snapPending = true;
  });

  return {
    get left() { return keys.has("a") || keys.has("arrowleft"); },
    get right() { return keys.has("d") || keys.has("arrowright"); },
    get cameraHeld() { return keys.has("shift"); },
    get aimX() { return aimX; },
    get aimY() { return aimY; },
    consumeSnap() {
      if (snapPending) { snapPending = false; return true; }
      return false;
    },
  };
}
