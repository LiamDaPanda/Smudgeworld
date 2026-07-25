import type { PerspectiveCamera, Scene, Group, Vector3 } from "three";
import type { Fish, Pond, Waterfall } from "./water.ts";

export interface InputState {
  moveX: number; // -1 (left/west) to +1 (right/east)
  moveZ: number; // -1 (forward/into scene) to +1 (backward/toward camera)
  cameraHeld: boolean;
  sprint: boolean;
  aimX: number;
  aimY: number;
  consumeSnap: () => boolean;
  // Camera orbit — accumulates drag delta from right-mouse or right-half touch.
  consumeCameraYaw: () => number;
}

export interface Player {
  root: Group;
  worldX: number;
  worldZ: number;
  yaw: number; // radians; 0 = facing +X, PI/2 = facing +Z
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
