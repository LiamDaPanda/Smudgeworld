import type { Snapshot } from "./types.ts";

const snapshots: Snapshot[] = [];
const bestBySubject = new Map<string, Snapshot>();

export function addSnapshot(shot: Snapshot) {
  snapshots.push(shot);
  const prev = bestBySubject.get(shot.subjectName);
  if (!prev || shot.clarity > prev.clarity) bestBySubject.set(shot.subjectName, shot);
  renderLibrary();
}

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
