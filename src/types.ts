import type { PerspectiveCamera, Scene, Group, Vector3 } from "three";
import type { Fish, Pond, Waterfall } from "./water.ts";

export interface InputState {
  moveX: number; // -1 (left/west) to +1 (right/east)
  moveZ: number; // -1 (forward/into scene) to +1 (backward/toward camera)
  /** True once for each request to raise the camera (E, Space, or the button). */
  consumePhoto(): boolean;
  sprint: boolean;
  aimX: number;
  aimY: number;
  // Camera orbit — accumulates drag delta from right-mouse or right-half touch.
  consumeCameraYaw: () => number;
}

export interface Player {
  root: Group;
  worldX: number;
  worldZ: number;
  yaw: number; // radians; 0 = facing +X, PI/2 = facing +Z
  /** Current planar velocity, so starting and stopping have some weight. */
  velX: number;
  velZ: number;
  walkPhase: number;
  cameraRaised: boolean;
  leftLeg: Group;
  rightLeg: Group;
  leftArm: Group;
  rightArm: Group;
  cameraProp: Group;
}

export interface Smudge {
  id: string;
  kind: "common" | "timed";
  worldPos: Vector3;
  radius: number;
  wobbleSeed: number;
  visible: boolean;
  sprite: Group;
  indicator?: import("three").Mesh;
  captured: boolean;
  // Wander: subjects drift around this home point rather than sitting still.
  homeX: number;
  homeZ: number;
  wanderRadius: number;
  timedWindow?: { start: number; end: number };
  name: string;
  set: string;
  __lastShot?: Snapshot; // scratch space for the photo-mode session
}

export interface GameState {
  scene: Scene;
  camera: PerspectiveCamera;
  worldWidth: number;
  worldDepth: number;
  worldRoot: Group;
  player: Player;
  smudges: Smudge[];
  pond: Pond;
  fish: Fish[];
  waterfall: Waterfall;
  input: InputState;
  time: number;
  coins: number;
  snapshotCount: number;
}

export interface Snapshot {
  id: string;
  subjectName: string;
  set: string;
  clarity: number;
  takenAt: string;
}
