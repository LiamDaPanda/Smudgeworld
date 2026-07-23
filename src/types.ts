export interface InputState {
  left: boolean;
  right: boolean;
  cameraHeld: boolean;
  aimX: number;
  aimY: number;
  consumeSnap: () => boolean;
}

export interface World {
  width: number;
  groundY: number;
  strokes: Stroke[];
  parallax: ParallaxLayer[];
}

export interface Stroke {
  points: { x: number; y: number }[];
  weight: number;
}

export interface ParallaxLayer {
  factor: number;
  strokes: Stroke[];
  color: string;
  weight: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  walkPhase: number;
  cameraRaised: boolean;
}

export interface Smudge {
  id: string;
  kind: "common" | "timed";
  x: number;
  baseY: number;
  radius: number;
  wobbleSeed: number;
  visible: boolean;
  timedWindow?: { start: number; end: number };
  name: string;
  set: string;
}

export interface GameState {
  world: World;
  player: Player;
  smudges: Smudge[];
  input: InputState;
  cameraX: number;
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
