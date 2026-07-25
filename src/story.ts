// A light epistolary frame: you are a new field photographer for the Survey,
// and an archivist writes to you as your record grows.
//
// The story is deliberately thin. Its real job is to make the economy feel
// inevitable rather than bolted on later — so the letters establish, in
// order: that a photograph is the only clear record of a subject anywhere,
// that your older takes survive as spares, that some subjects only surface at
// certain hours, that other photographers are out there filling their own
// ledgers, and finally that an exchange exists for trading between them.
//
// Nothing here dictates plot. It's framing that trading, spares, and
// day-locked scarcity can hang off when those systems arrive.

export interface Letter {
  id: string;
  from: string;
  title: string;
  body: string[];
}

export const LETTERS: Record<string, Letter> = {
  welcome: {
    id: "welcome",
    from: "M. Ardley, Keeper of the Survey",
    title: "Your commission",
    body: [
      "You will have noticed by now that the world does not hold still. Look directly at one of the dark ones and it slides out of focus, every time, for everyone. We have stopped treating this as a fault of the eye.",
      "A photograph is the exception. Whatever the plate catches, it keeps.",
      "So: the camera is yours. Fill the record. What you bring back will be the only clear likeness of these creatures anywhere — including here, in the archive.",
    ],
  },

  firstCapture: {
    id: "firstCapture",
    from: "M. Ardley",
    title: "The first plate",
    body: [
      "It developed. I have it in front of me and I can tell you plainly: before this morning, no one alive knew what that looked like.",
      "The world outside your library is still smudged and will stay that way. That is rather the point. Your plate is not a copy of something — it is the thing itself, held.",
      "Keep going. And do mind your focus.",
    ],
  },

  spares: {
    id: "spares",
    from: "M. Ardley",
    title: "On second takes",
    body: [
      "You went back and did better. Good — the ledger keeps your clearest plate and always will.",
      "Your earlier one is not discarded. We file it as a spare. A murky plate is still a true plate, and there are photographers who would rather hold a poor likeness of something than none at all.",
      "Mine your spares carefully. They are worth more than you think they are.",
    ],
  },

  nightfall: {
    id: "nightfall",
    from: "M. Ardley",
    title: "The nocturnal record",
    body: [
      "You were out late, and it shows in the plate. Some of them will not surface for you in daylight at any price.",
      "This is the hard part of the work. Miss a night and you miss it — the hour does not come back around on your account.",
      "When that happens, remember that someone else was standing in a field somewhere with a camera at the right moment. Their spare is your gap.",
    ],
  },

  firstSet: {
    id: "firstSet",
    from: "M. Ardley",
    title: "A complete run",
    body: [
      "A full set, and the Survey has released your coin against it. Spend it on glass — better optics pay for themselves in clarity, and clarity is the whole of your trade.",
      "You are not the only one filling a ledger, incidentally. There are others in the field, with their own runs half-finished and their own drawers of spares.",
      "I mention it only so you are not surprised later.",
    ],
  },

  exchange: {
    id: "exchange",
    from: "M. Ardley",
    title: "The exchange",
    body: [
      "Your record is broad enough now that I can tell you what happens next.",
      "The Survey keeps an exchange. Photographers post spares against coin; a missed hour can be bought from someone who was there for it. We take a small cut of every transaction, which keeps the coin honest and keeps the archive lit.",
      "It is not open to you yet. But it will be, and you would do well to stop discarding anything.",
    ],
  },

  complete: {
    id: "complete",
    from: "M. Ardley",
    title: "The park is done",
    body: [
      "Every run in this district, complete. I have had the plates bound.",
      "There is more country than this, and deeper — places the standard lens will not reach and things that surface on a calendar rather than a clock.",
      "Rest first. Then come and see me about the exchange.",
    ],
  },
};

const SEEN_KEY = "smudgeworld-letters-v1";
const seen = new Set<string>();
const unread = new Set<string>();

export function restoreLetters(ids: string[] | undefined) {
  for (const id of ids ?? []) seen.add(id);
}
export function seenLetters(): string[] {
  return Array.from(seen);
}
export function hasUnread() { return unread.size > 0; }

function persist() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch { /* storage blocked — letters just re-fire next session */ }
}

let onDeliver: ((l: Letter) => void) | null = null;
export function onLetterDelivered(fn: (l: Letter) => void) { onDeliver = fn; }

/**
 * Deliver a letter once, ever. Returns true if it actually fired, so callers
 * can avoid stacking a letter on top of a toast in the same beat.
 */
export function deliver(id: keyof typeof LETTERS): boolean {
  if (seen.has(id)) return false;
  const letter = LETTERS[id];
  if (!letter) return false;
  seen.add(id);
  unread.add(id);
  persist();
  onDeliver?.(letter);
  return true;
}

// --- UI ---

export function showLetter(letter: Letter) {
  const modal = document.getElementById("letter-modal");
  const fromEl = document.getElementById("letter-from");
  const titleEl = document.getElementById("letter-title");
  const bodyEl = document.getElementById("letter-body");
  if (!modal || !bodyEl) return;
  if (titleEl) titleEl.textContent = letter.title;
  if (fromEl) fromEl.textContent = letter.from;
  bodyEl.innerHTML = letter.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  modal.classList.add("open");
  unread.delete(letter.id);
}

export function closeLetter() {
  document.getElementById("letter-modal")?.classList.remove("open");
}

/** The archive list — every letter received so far, re-readable. */
export function renderLetterList() {
  const body = document.getElementById("letters-body");
  if (!body) return;
  body.innerHTML = "";

  const received = Object.values(LETTERS).filter((l) => seen.has(l.id));
  if (received.length === 0) {
    body.innerHTML = `<p class="letters-empty">No correspondence yet.</p>`;
    return;
  }
  for (const l of received) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "letter-row" + (unread.has(l.id) ? " unread" : "");
    row.innerHTML = `
      <span class="letter-row-title">${escapeHtml(l.title)}</span>
      <span class="letter-row-from">${escapeHtml(l.from)}</span>
    `;
    row.addEventListener("click", () => {
      showLetter(l);
      renderLetterList();
    });
    body.appendChild(row);
  }
}

export function openLetters() {
  renderLetterList();
  document.getElementById("letters-modal")?.classList.add("open");
}
export function closeLetters() {
  document.getElementById("letters-modal")?.classList.remove("open");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
