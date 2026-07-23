import type { InputState } from "./types.ts";

export function createInput(canvas: HTMLCanvasElement): InputState {
  const keys = new Set<string>();
  let snapPending = false;
  let aimX = window.innerWidth / 2;
  let aimY = window.innerHeight / 2;
  let touchLeft = false;
  let touchRight = false;
  let touchCam = false;

  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (isTouch) {
    document.body.classList.add("touch");
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "◀ ▶ walk · hold 📷 to raise camera · drag to aim · SNAP to shoot";
    // Try to lock landscape on first user gesture (required for the API to fire)
    const lockLandscape = () => {
      const anyScreen = screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
      anyScreen.orientation?.lock?.("landscape").catch(() => {});
      window.removeEventListener("touchstart", lockLandscape);
      window.removeEventListener("pointerdown", lockLandscape);
    };
    window.addEventListener("touchstart", lockLandscape, { once: true, passive: true });
    window.addEventListener("pointerdown", lockLandscape, { once: true });
  }

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

  // Touch: drag on canvas moves the aim reticle
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length > 0) {
        aimX = e.touches[0].clientX;
        aimY = e.touches[0].clientY;
      }
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 0) {
        aimX = e.touches[0].clientX;
        aimY = e.touches[0].clientY;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // Prevent iOS from treating rapid taps as zoom
  document.addEventListener(
    "gesturestart",
    (e) => e.preventDefault(),
    { passive: false }
  );

  function bindHold(id: string, onDown: () => void, onUp: () => void) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e: Event) => {
      onDown();
      el.classList.add("active");
      e.preventDefault();
    };
    const up = (e: Event) => {
      onUp();
      el.classList.remove("active");
      e.preventDefault();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
  }

  bindHold("walk-left", () => { touchLeft = true; }, () => { touchLeft = false; });
  bindHold("walk-right", () => { touchRight = true; }, () => { touchRight = false; });

  // Camera hold toggles the .cam-raised class on body so the SNAP button appears
  const camEl = document.getElementById("cam-btn");
  if (camEl) {
    const on = (e: Event) => {
      touchCam = true;
      camEl.classList.add("active");
      document.body.classList.add("cam-raised");
      e.preventDefault();
    };
    const off = (e: Event) => {
      touchCam = false;
      camEl.classList.remove("active");
      document.body.classList.remove("cam-raised");
      e.preventDefault();
    };
    camEl.addEventListener("pointerdown", on);
    camEl.addEventListener("pointerup", off);
    camEl.addEventListener("pointercancel", off);
    camEl.addEventListener("pointerleave", off);
  }

  const shutter = document.getElementById("shutter-btn");
  if (shutter) {
    shutter.addEventListener(
      "pointerdown",
      (e) => {
        snapPending = true;
        shutter.classList.add("active");
        e.preventDefault();
      }
    );
    const clear = () => shutter.classList.remove("active");
    shutter.addEventListener("pointerup", clear);
    shutter.addEventListener("pointercancel", clear);
    shutter.addEventListener("pointerleave", clear);
  }

  return {
    get left() { return keys.has("a") || keys.has("arrowleft") || touchLeft; },
    get right() { return keys.has("d") || keys.has("arrowright") || touchRight; },
    get cameraHeld() { return keys.has("shift") || touchCam; },
    get aimX() { return aimX; },
    get aimY() { return aimY; },
    consumeSnap() {
      if (snapPending) { snapPending = false; return true; }
      return false;
    },
  };
}
