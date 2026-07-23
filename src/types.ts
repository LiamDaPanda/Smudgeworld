import type { PerspectiveCamera, Scene, Group, Vector3 } from "three";

export interface InputState {
  left: boolean;
  right: boolean;
  cameraHeld: boolean;
  aimX: number;
  aimY: number;
  consumeSnap: () => boolean;
}

export interface Player {
  root: Group;
  worldX: number;
  facing: 1 | -1;
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
  timedWindow?: { start: number; end: number };
  name: string;
  set: string;
}

export interface GameState {
  scene: Scene;
  camera: PerspectiveCamera;
  worldWidth: number;
  worldRoot: Group;
  player: Player;
  smudges: Smudge[];
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
