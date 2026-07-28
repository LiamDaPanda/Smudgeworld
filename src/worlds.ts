// The worlds you can walk to, and everything that makes one different from
// another.
//
// The park used to be hard-coded inside the scene builder — its sections, its
// tree mixes, its water, its one mountain. All of that is data now, because
// "another world" is only interesting if the next one isn't the park with the
// greens swapped: a coast has no trees to speak of and a great deal of sky, a
// deep wood is nothing but trees, and the rooftops have no ground at all in
// the sense the other three do.

import type { TreeKind } from "./sprites2d.ts";

/** Undergrowth flavour for a stretch of a world. */
export type Under = "bush" | "fern" | "hedge" | "reed" | "none";
/** Scatter props, drawn a few per section. */
export type Prop =
  | "log" | "cairn" | "bench" | "lamp"
  | "mushroom" | "chimney" | "aerial" | "washing" | "crate" | "lighthouse";

export interface SectionDef {
  name: string;
  /** Length in world units. Absolute from/to are derived in order. */
  span: number;
  ground: string;
  ground2: string;
  /** Omit for a stretch with no trees at all. */
  trees?: [TreeKind, number][];
  /** Trees per world unit, roughly. */
  density?: number;
  under?: Under;
  /** Rocks per world unit. */
  rocks?: number;
  props?: Prop[];
  /** Flower colours, or omit for none. */
  flowers?: string[];
  /** Grass tufts per unit. Rooftops want none. */
  grass?: number;
}

export interface SubjectDef {
  name: string;
  set: string;
  kind: "common" | "timed";
  /** Which section of this world it lives in. */
  section: string;
}

export interface WorldDef {
  id: string;
  name: string;
  blurb: string;
  sections: SectionDef[];
  /** Water spans in absolute world units. */
  water: { from: number; to: number }[];
  hills: { far: string; mid: string; haze: string; farH: number; midH: number };
  /** A wash multiplied over the sky band, so day/night still drives it. */
  skyTint?: { hex: string; alpha: number };
  /** x of the massif, if this world has one on its horizon. */
  massif?: number;
  portals: { x: number; to: string }[];
  spawn: number;
  subjects: SubjectDef[];
  /** Ground-band trail colour, and whether the ground gets a trail at all. */
  trail?: string | null;
  /**
   * The ground band's own colours. The rise behind the trail, the shade at the
   * line and the foot of the frame, and what the scatter is made of — all of
   * which were green constants until there was a world with a roof for a floor.
   */
  ground: {
    rise: [string, string];
    lip: string;
    texture: "grass" | "sand" | "tile";
  };
}

const PARK_FLOWERS = ["#e0708a", "#c98060", "#dcb85a", "#a37fc9", "#f2efe4"];

export const WORLDS: Record<string, WorldDef> = {
  // -------------------------------------------------------------- park ----
  park: {
    id: "park",
    ground: { rise: ["#7d966a", "#5f7a4c"], lip: "#43512f", texture: "grass" },
    name: "The Park",
    blurb: "Where the survey began.",
    hills: { far: "#7d8f9e", mid: "#63795e", haze: "#c2ccd2", farH: 300, midH: 235 },
    massif: 226,
    spawn: 26,
    water: [{ from: 214, to: 240 }],
    portals: [{ x: 330, to: "coast" }],
    sections: [
      {
        name: "green", span: 60, ground: "#9dc06a", ground2: "#7fa354",
        trees: [["mixed", 1]], density: 0.32, under: "bush", rocks: 0.16,
        props: ["bench", "lamp"], flowers: ["#f2efe4"], grass: 2,
      },
      {
        name: "grove", span: 70, ground: "#6d8c4c", ground2: "#4a6434",
        trees: [["birch", 5], ["mixed", 4], ["conifer", 2]], density: 1.5,
        under: "fern", rocks: 0.16, props: ["log"], grass: 2,
      },
      {
        name: "wilds", span: 60, ground: "#a89b5e", ground2: "#867a46",
        trees: [["snag", 5], ["conifer", 3], ["mixed", 2]], density: 0.7,
        under: "bush", rocks: 0.7, props: ["cairn"], grass: 2,
      },
      {
        name: "waterside", span: 70, ground: "#94bc84", ground2: "#6f9463",
        trees: [["willow", 5], ["mixed", 3], ["birch", 2]], density: 0.7,
        under: "reed", rocks: 0.16, grass: 2,
      },
      {
        name: "garden", span: 80, ground: "#8fc079", ground2: "#6b9457",
        trees: [["ornamental", 7], ["mixed", 2]], density: 0.7,
        under: "hedge", rocks: 0.16, props: ["bench"], flowers: PARK_FLOWERS, grass: 2,
      },
    ],
    subjects: [
      { name: "Park Cat", set: "Park Life", kind: "common", section: "green" },
      { name: "Bench Sitter", set: "Park Life", kind: "common", section: "garden" },
      { name: "Pigeon Council", set: "Park Life", kind: "common", section: "green" },
      { name: "Kite Runner", set: "Park Life", kind: "common", section: "garden" },
      { name: "Fountain Diver", set: "Park Life", kind: "common", section: "green" },
      { name: "Heron", set: "Waterside", kind: "common", section: "waterside" },
      { name: "Koi Shadow", set: "Waterside", kind: "common", section: "waterside" },
      { name: "Dragonfly", set: "Waterside", kind: "common", section: "waterside" },
      { name: "Frog Chorus", set: "Waterside", kind: "common", section: "waterside" },
      { name: "Comet Sparrow", set: "After Dark", kind: "timed", section: "grove" },
      { name: "Blink Fox", set: "After Dark", kind: "timed", section: "grove" },
    ],
  },

  // ------------------------------------------------------------- coast ----
  coast: {
    id: "coast",
    ground: { rise: ["#cdbf96", "#a89a76"], lip: "#8a7c5c", texture: "sand" },
    name: "The Long Shore",
    blurb: "Wind, salt, and a light that never quite goes out.",
    hills: { far: "#8fa3ae", mid: "#9aa88f", haze: "#cfd9de", farH: 210, midH: 150 },
    skyTint: { hex: "#bcd6e2", alpha: 0.2 },
    spawn: 18,
    water: [{ from: 92, to: 158 }],
    portals: [{ x: 6, to: "park" }, { x: 246, to: "hollow" }],
    trail: "#d9c9a4",
    sections: [
      {
        name: "dunes", span: 92, ground: "#dccfa4", ground2: "#bfae83",
        trees: [["snag", 3], ["conifer", 1]], density: 0.12,
        under: "reed", rocks: 0.1, grass: 1.2,
      },
      {
        name: "strand", span: 66, ground: "#cbbc95", ground2: "#a89a76",
        density: 0, under: "none", rocks: 0.5, props: ["log", "crate"], grass: 0.2,
      },
      {
        name: "cliffs", span: 94, ground: "#b7ae9c", ground2: "#8e8677",
        trees: [["snag", 4], ["conifer", 2]], density: 0.2,
        under: "reed", rocks: 1.1, props: ["cairn", "lighthouse"], grass: 0.8,
      },
    ],
    subjects: [
      { name: "Gull Parliament", set: "Shoreline", kind: "common", section: "strand" },
      { name: "Rockpool Crab", set: "Shoreline", kind: "common", section: "cliffs" },
      { name: "Seal Loaf", set: "Shoreline", kind: "common", section: "strand" },
      { name: "Lighthouse Keeper", set: "Shoreline", kind: "timed", section: "cliffs" },
    ],
  },

  // ------------------------------------------------------------ hollow ----
  hollow: {
    id: "hollow",
    ground: { rise: ["#4a6338", "#2c4224"], lip: "#22331c", texture: "grass" },
    name: "Hollow Wood",
    blurb: "Older than the park, and it knows it.",
    hills: { far: "#5f6d68", mid: "#3f5245", haze: "#9daa9f", farH: 260, midH: 200 },
    skyTint: { hex: "#5d6f60", alpha: 0.34 },
    spawn: 16,
    water: [],
    portals: [{ x: 6, to: "coast" }, { x: 228, to: "rooftops" }],
    trail: "#6b6047",
    sections: [
      {
        name: "thicket", span: 78, ground: "#4c6339", ground2: "#33452a",
        trees: [["mixed", 4], ["birch", 3], ["conifer", 3]], density: 2.1,
        under: "fern", rocks: 0.3, props: ["log", "mushroom"], grass: 2.4,
      },
      {
        name: "deepwood", span: 88, ground: "#3b5231", ground2: "#26381f",
        trees: [["conifer", 6], ["snag", 3], ["mixed", 2]], density: 2.6,
        under: "fern", rocks: 0.4, props: ["mushroom", "log"], grass: 2.6,
      },
      {
        name: "clearing", span: 74, ground: "#5a7340", ground2: "#3d5230",
        trees: [["willow", 4], ["mixed", 3]], density: 0.55,
        under: "fern", rocks: 0.5, props: ["cairn", "mushroom"],
        flowers: ["#e8e2ee", "#c9b6dd"], grass: 2.2,
      },
    ],
    subjects: [
      { name: "Mushroom Ring", set: "Deep Wood", kind: "common", section: "deepwood" },
      { name: "Antlered Shape", set: "Deep Wood", kind: "common", section: "clearing" },
      { name: "Moth Cloud", set: "Deep Wood", kind: "common", section: "thicket" },
      { name: "Wisp", set: "Deep Wood", kind: "timed", section: "deepwood" },
    ],
  },

  // ---------------------------------------------------------- rooftops ----
  rooftops: {
    id: "rooftops",
    ground: { rise: ["#b0705a", "#87503e"], lip: "#5c3126", texture: "tile" },
    name: "The Rooftops",
    blurb: "The town from above, at the hour it turns orange.",
    hills: { far: "#9a8b93", mid: "#6f6069", haze: "#d9c3b6", farH: 240, midH: 190 },
    skyTint: { hex: "#e0a468", alpha: 0.3 },
    spawn: 16,
    water: [],
    portals: [{ x: 6, to: "hollow" }, { x: 206, to: "park" }],
    trail: null,
    sections: [
      {
        name: "eaves", span: 70, ground: "#a8624a", ground2: "#7d4635",
        density: 0, under: "none", rocks: 0,
        props: ["chimney", "aerial", "washing"], grass: 0,
      },
      {
        name: "ridge", span: 72, ground: "#94564a", ground2: "#6d3d34",
        density: 0, under: "none", rocks: 0,
        props: ["chimney", "washing", "crate"], grass: 0,
      },
      {
        name: "gables", span: 70, ground: "#b06e4e", ground2: "#84503a",
        trees: [["ornamental", 1]], density: 0.06, under: "none", rocks: 0,
        props: ["chimney", "aerial", "lamp"], flowers: ["#e0708a", "#dcb85a"], grass: 0,
      },
    ],
    subjects: [
      { name: "Roof Cat", set: "Chimney Pots", kind: "common", section: "ridge" },
      { name: "Laundry Ghost", set: "Chimney Pots", kind: "common", section: "eaves" },
      { name: "Pigeon Loft", set: "Chimney Pots", kind: "common", section: "gables" },
      { name: "Weathervane Hawk", set: "Chimney Pots", kind: "timed", section: "gables" },
    ],
  },
};

export const START_WORLD = "park";

/** Absolute extent of a world, derived from its section spans. */
export function worldWidth(w: WorldDef): number {
  return w.sections.reduce((n, s) => n + s.span, 0);
}

/** Sections with absolute from/to filled in. */
export function sectionRanges(w: WorldDef) {
  let x = 0;
  return w.sections.map((s) => {
    const from = x;
    x += s.span;
    return { ...s, from, to: x };
  });
}
