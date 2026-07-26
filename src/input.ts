import type { InputState } from "./types.ts";

export function createInput(canvas: HTMLCanvasElement): InputState {
  const keys = new Set<string>();
  let aimX = window.innerWidth / 2;
  let aimY = window.innerHeight / 2;
  let photoPending = false;
  let joyX = 0;
  let joyZ = 0;

  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (isTouch) {
    document.body.classList.add("touch");
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "Joystick to walk · drag the right of the screen to look · camera button to photograph";
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
    // Space is a second way to raise the camera, so you never have to take a
    // hand off the movement keys to reach E.
    if (e.key === " " || e.code === "Space") {
      photoPending = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  let pendingCameraYaw = 0;
  let rightDown = false;
  let rightLastX = 0;

  canvas.addEventListener("mousemove", (e) => {
    if (rightDown) {
      pendingCameraYaw += (e.clientX - rightLastX) * 0.008;
      rightLastX = e.clientX;
    } else {
      aimX = e.clientX;
      aimY = e.clientY;
    }
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      rightDown = true;
      rightLastX = e.clientX;
      e.preventDefault();
    } else {
      // Left-click on the world is a third way to raise the camera, for
      // players who never take their hand off the mouse.
      photoPending = true;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) rightDown = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

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
  let touchOrbitId: number | null = null;
  let touchOrbitLastX = 0;
  canvas.addEventListener(
    "touchmove",
    (e) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (touchOrbitId === t.identifier) {
          pendingCameraYaw += (t.clientX - touchOrbitLastX) * 0.008;
          touchOrbitLastX = t.clientX;
        }
      }
      if (e.touches.length > 0 && touchOrbitId === null) {
        aimX = e.touches[0].clientX;
        aimY = e.touches[0].clientY;
      }
      e.preventDefault();
    },
    { passive: false }
  );
  // A touch on the right half of the canvas becomes a camera-orbit drag.
  canvas.addEventListener("touchstart", (e) => {
    if (touchOrbitId !== null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.clientX > window.innerWidth * 0.55) {
        touchOrbitId = t.identifier;
        touchOrbitLastX = t.clientX;
        break;
      }
    }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchOrbitId) {
        touchOrbitId = null;
      }
    }
  });

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

  // The big round button is now a tap-to-photograph, not a hold-to-raise. The
  // old behaviour froze the player in place for as long as it was held and
  // then handed off to a separate SNAP button, so on a phone the only way to
  // take a picture was to stop walking and juggle two controls. Photo mode has
  // its own shutter, so all this has to do is open it.
  const camEl = document.getElementById("cam-btn");
  if (camEl) {
    camEl.addEventListener("pointerdown", (e) => {
      photoPending = true;
      camEl.classList.add("active");
      e.preventDefault();
    });
    const clear = () => camEl.classList.remove("active");
    camEl.addEventListener("pointerup", clear);
    camEl.addEventListener("pointercancel", clear);
    camEl.addEventListener("pointerleave", clear);
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
    consumePhoto() {
      if (photoPending) { photoPending = false; return true; }
      return false;
    },
    get sprint() {
      // Desktop: hold Shift. Touch: push the joystick to its edge.
      return keys.has("shift") || Math.hypot(joyX, joyZ) > 0.93;
    },
    get aimX() { return aimX; },
    get aimY() { return aimY; },
    consumeCameraYaw() {
      const y = pendingCameraYaw;
      pendingCameraYaw = 0;
      return y;
    },
  };
}
