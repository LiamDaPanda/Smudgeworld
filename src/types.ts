export interface InputState {
  moveX: number; // -1 (left/west) to +1 (right/east)
  moveZ: number; // -1 (up the screen) to +1 (down the screen)
  /** True once for each request to raise the camera (E, Space, or the button). */
  consumePhoto(): boolean;
  sprint: boolean;
  aimX: number;
  aimY: number;
  /** Drag delta from right-mouse or a right-half touch. Unused in the 2D build. */
  consumeCameraYaw: () => number;
}

/**
 * A developed plate. This is the game's collectible — everything the library,
 * the sets and (eventually) the exchange operate on.
 */
export interface Snapshot {
  id: string;
  subjectName: string;
  set: string;
  /** 0..1. Timing, gear and conditions decide it. */
  clarity: number;
  /** The exact moment it was caught. Provenance is part of the card. */
  takenAt: string;
}

/**
 * The shape photo mode needs from whatever it's photographing. The 2D
 * subjects satisfy it structurally, so photo.ts doesn't have to know about
 * the world representation at all.
 */
export interface PhotoSubject {
  name: string;
  set: string;
  kind: "common" | "timed";
  timedWindow?: { start: number; end: number } | null;
  __lastShot?: unknown;
}
