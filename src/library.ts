import type { Snapshot } from "./types.ts";

interface SetDef {
  name: string;
  subjects: string[];
  reward: number; // coin bonus on completion
}

// Keep in sync with the `subjects` lists in worlds.ts.
const SETS: SetDef[] = [
  {
    name: "Park Life",
    subjects: ["Park Cat", "Bench Sitter", "Pigeon Council", "Kite Runner", "Fountain Diver"],
    reward: 250,
  },
  {
    name: "Waterside",
    subjects: ["Heron", "Koi Shadow", "Dragonfly", "Frog Chorus"],
    reward: 320,
  },
  {
    name: "After Dark",
    subjects: ["Comet Sparrow", "Blink Fox"],
    reward: 400,
  },
  {
    name: "Shoreline",
    subjects: ["Gull Parliament", "Rockpool Crab", "Seal Loaf", "Lighthouse Keeper"],
    reward: 380,
  },
  {
    name: "Deep Wood",
    subjects: ["Mushroom Ring", "Antlered Shape", "Moth Cloud", "Wisp"],
    reward: 440,
  },
  {
    name: "Chimney Pots",
    subjects: ["Roof Cat", "Laundry Ghost", "Pigeon Loft", "Weathervane Hawk"],
    reward: 500,
  },
];

const snapshots: Snapshot[] = [];
const bestBySubject = new Map<string, Snapshot>();
const completedSets = new Set<string>();

interface AddResult {
  newSubject: boolean;
  improvedBest: boolean;
  completedSet: SetDef | null;
  reward: number;
}

export function addSnapshot(shot: Snapshot): AddResult {
  snapshots.push(shot);
  const prev = bestBySubject.get(shot.subjectName);
  const newSubject = !prev;
  const improvedBest = !prev || shot.clarity > prev.clarity;
  if (!prev || shot.clarity > prev.clarity) bestBySubject.set(shot.subjectName, shot);

  let completed: SetDef | null = null;
  let reward = 0;
  if (newSubject) {
    for (const set of SETS) {
      if (completedSets.has(set.name)) continue;
      if (set.subjects.every((s) => bestBySubject.has(s))) {
        completedSets.add(set.name);
        completed = set;
        reward = set.reward;
        break;
      }
    }
  }
  renderLibrary();
  return { newSubject, improvedBest, completedSet: completed, reward };
}

// Small strip at the bottom (or in the corner) showing recent captures.
export function renderLibrary() {
  const root = document.getElementById("library");
  if (!root) return;
  root.innerHTML = "";
  const best = Array.from(bestBySubject.values()).sort((a, b) => b.clarity - a.clarity);
  for (const s of best) {
    const card = document.createElement("div");
    card.className = "snapshot";
    const blur = Math.max(0, (1 - s.clarity) * 6).toFixed(1);
    card.innerHTML = `
      <div style="width:100%;height:44px;background:#2b2b2b;filter:blur(${blur}px);opacity:${0.4 + s.clarity * 0.6};"></div>
      <div style="margin-top:2px;">${escapeHtml(s.subjectName)}</div>
      <div class="clarity">${Math.round(s.clarity * 100)}%</div>
    `;
    root.appendChild(card);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function getSetSummary(): { name: string; captured: number; total: number; complete: boolean }[] {
  return SETS.map((set) => ({
    name: set.name,
    captured: set.subjects.filter((s) => bestBySubject.has(s)).length,
    total: set.subjects.length,
    complete: completedSets.has(set.name),
  }));
}

// Render the full inventory modal — grouped by set, one card per subject.
export function renderInventory() {
  const body = document.getElementById("inventory-body");
  if (!body) return;
  body.innerHTML = "";

  const totalCaptured = bestBySubject.size;
  const totalSubjects = SETS.reduce((n, s) => n + s.subjects.length, 0);

  const header = document.createElement("div");
  header.className = "inv-summary";
  header.innerHTML = `
    <div>Total captured: <strong>${totalCaptured}</strong> / ${totalSubjects}</div>
    <div>Sets completed: <strong>${completedSets.size}</strong> / ${SETS.length}</div>
  `;
  body.appendChild(header);

  for (const set of SETS) {
    const captured = set.subjects.filter((s) => bestBySubject.has(s)).length;
    const total = set.subjects.length;
    const done = completedSets.has(set.name);

    const section = document.createElement("section");
    section.className = "inv-set" + (done ? " complete" : "");
    section.innerHTML = `
      <header>
        <h3>${escapeHtml(set.name)}</h3>
        <span class="count">${captured} / ${total}${done ? " · complete" : ""}</span>
      </header>
    `;
    const grid = document.createElement("div");
    grid.className = "inv-grid";
    for (const subject of set.subjects) {
      const shot = bestBySubject.get(subject);
      const card = document.createElement("div");
      card.className = "inv-card" + (shot ? "" : " empty");
      if (shot) {
        const blur = Math.max(0, (1 - shot.clarity) * 8).toFixed(1);
        const taken = new Date(shot.takenAt).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
        card.innerHTML = `
          <div class="thumb" style="filter:blur(${blur}px);opacity:${0.35 + shot.clarity * 0.65};"></div>
          <div class="meta">
            <div class="name">${escapeHtml(subject)}</div>
            <div class="stamp">${escapeHtml(taken)} · <strong>${Math.round(shot.clarity * 100)}%</strong></div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="thumb placeholder"></div>
          <div class="meta">
            <div class="name">?</div>
            <div class="stamp">not yet captured</div>
          </div>
        `;
      }
      grid.appendChild(card);
    }
    section.appendChild(grid);
    body.appendChild(section);
  }
}

// ---------------- Persistence ----------------

export function serializeLibrary(): { snapshots: Snapshot[]; completed: string[] } {
  return {
    snapshots: Array.from(bestBySubject.values()),
    completed: Array.from(completedSets),
  };
}

export function restoreLibrary(data: { snapshots?: Snapshot[]; completed?: string[] } | null) {
  if (!data) return;
  for (const s of data.snapshots ?? []) {
    const prev = bestBySubject.get(s.subjectName);
    if (!prev || s.clarity > prev.clarity) bestBySubject.set(s.subjectName, s);
  }
  for (const name of data.completed ?? []) completedSets.add(name);
  renderLibrary();
}

export function getCapturedSubjects(): Set<string> {
  return new Set(bestBySubject.keys());
}

/** The best clarity on record for a subject, or null if never photographed. */
export function bestClarityOf(name: string): number | null {
  return bestBySubject.get(name)?.clarity ?? null;
}

export function openInventory() {
  const modal = document.getElementById("inventory-modal");
  if (!modal) return;
  renderInventory();
  modal.classList.add("open");
}

export function closeInventory() {
  const modal = document.getElementById("inventory-modal");
  if (!modal) return;
  modal.classList.remove("open");
}
