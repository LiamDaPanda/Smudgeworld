import type { InputState } from "./types.ts";

export function createInput(canvas: HTMLCanvasElement): InputState {
  const keys = new Set<string>();
  let snapPending = false;
  let aimX = window.innerWidth / 2;
  let aimY = window.innerHeight / 2;
  let touchCam = false;
  let joyX = 0;
  let joyZ = 0;

  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (isTouch) {
    document.body.classList.add("touch");
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "Joystick to walk · hold the camera to raise · drag to aim · SNAP to shoot";
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

  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });

  // Virtual joystick — Roblox-style. Drag the knob within the base radius, the
  // knob returns to center on release. Emits normalized (dx, dz) in [-1, 1].
  const joystick = document.getElementById("joystick");
  const knob = document.getElementById("joystick-knob");
  if (joystick && knob) {
    const baseRect = () => joystick.getBoundingClientRect();
    const maxRadius = 40; // px the knob can travel
    let activePointer: number | null = null;

    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const reset = () => {
      joyX = 0;
      joyZ = 0;
      setKnob(0, 0);
      activePointer = null;
    };
    const update = (clientX: number, clientY: number) => {
      const rect = baseRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      setKnob(dx, dy);
      joyX = dx / maxRadius;
      joyZ = dy / maxRadius; // +y on screen = +z toward camera
    };

    joystick.addEventListener("pointerdown", (e) => {
      activePointer = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      update(e.clientX, e.clientY);
      e.preventDefault();
    });
    joystick.addEventListener("pointermove", (e) => {
      if (activePointer !== e.pointerId) return;
      update(e.clientX, e.clientY);
    });
    const release = (e: PointerEvent) => {
      if (activePointer !== e.pointerId) return;
      reset();
    };
    joystick.addEventListener("pointerup", release);
    joystick.addEventListener("pointercancel", release);
    joystick.addEventListener("lostpointercapture", () => reset());
  }

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
    shutter.addEventListener("pointerdown", (e) => {
      snapPending = true;
      shutter.classList.add("active");
      e.preventDefault();
    });
    const clear = () => shutter.classList.remove("active");
    shutter.addEventListener("pointerup", clear);
    shutter.addEventListener("pointercancel", clear);
    shutter.addEventListener("pointerleave", clear);
  }

  return {
    get moveX() {
      let x = joyX;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      return Math.max(-1, Math.min(1, x));
    },
    get moveZ() {
      let z = joyZ;
      if (keys.has("w") || keys.has("arrowup")) z -= 1; // W = forward = -Z
      if (keys.has("s") || keys.has("arrowdown")) z += 1;
      return Math.max(-1, Math.min(1, z));
    },
    get cameraHeld() { return keys.has("shift") || touchCam; },
    get aimX() { return aimX; },
    get aimY() { return aimY; },
    consumeSnap() {
      if (snapPending) { snapPending = false; return true; }
      return false;
    },
  };
}
