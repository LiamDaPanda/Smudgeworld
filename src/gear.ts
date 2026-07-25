// Camera gear is the coin sink. Every item changes how photography actually
// plays rather than just being a number, so buying one is felt immediately.

export interface GearItem {
  id: string;
  name: string;
  cost: number;
  blurb: string;
  /** What it does, in the player's words — shown under the name. */
  effect: string;
}

export const GEAR: GearItem[] = [
  {
    id: "steady-grip",
    name: "Steady Grip",
    cost: 120,
    blurb: "A padded strap that stops the shake.",
    effect: "Focus ring pulses slower — easier to time",
  },
  {
    id: "wide-lens",
    name: "Wide Lens",
    cost: 220,
    blurb: "More of the world through the glass.",
    effect: "Spot smudges from half again as far",
  },
  {
    id: "fast-shutter",
    name: "Fast Shutter",
    cost: 340,
    blurb: "Closes the instant you ask it to.",
    effect: "The sharp part of the focus ring is wider",
  },
  {
    id: "night-film",
    name: "Night Film",
    cost: 480,
    blurb: "Coarse grain that drinks the dark.",
    effect: "+12% clarity on every shot taken at night",
  },
  {
    id: "fine-optics",
    name: "Fine Optics",
    cost: 700,
    blurb: "Ground glass, and it shows.",
    effect: "+8% clarity on everything",
  },
];

const owned = new Set<string>();

export function ownsGear(id: string) { return owned.has(id); }
export function ownedGear(): string[] { return Array.from(owned); }
export function restoreGear(ids: string[] | undefined) {
  for (const id of ids ?? []) owned.add(id);
}
export function grantGear(id: string) { owned.add(id); }

// --- Derived modifiers, read by photo mode and proximity ---

/** Seconds for one full focus-ring pulse. Steady Grip slows it down. */
export function focusCycleSeconds() {
  return ownsGear("steady-grip") ? 2.3 : 1.6;
}

/** How forgiving the "tight ring" band is. Fast Shutter widens it. */
export function focusTolerance() {
  return ownsGear("fast-shutter") ? 1.45 : 1.0;
}

/** Proximity radius for the photograph prompt. Wide Lens extends it. */
export function spotRadius() {
  return ownsGear("wide-lens") ? 5.25 : 3.5;
}

/** Flat clarity bonuses from gear, as labelled entries for the result card. */
export function gearBonuses(night: number): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = [];
  if (ownsGear("fine-optics")) out.push({ label: "Fine optics", amount: 0.08 });
  if (ownsGear("night-film") && night > 0.5) out.push({ label: "Night film", amount: 0.12 });
  return out;
}

// --- Shop UI ---

let onBuy: ((item: GearItem) => void) | null = null;
let getCoins: (() => number) | null = null;

export function initShop(coinsFn: () => number, buyFn: (item: GearItem) => void) {
  getCoins = coinsFn;
  onBuy = buyFn;
}

export function renderShop() {
  const body = document.getElementById("shop-body");
  if (!body || !getCoins) return;
  const coins = getCoins();
  body.innerHTML = "";

  const header = document.createElement("div");
  header.className = "shop-summary";
  header.innerHTML = `Coins in hand: <strong>${coins}</strong>`;
  body.appendChild(header);

  for (const item of GEAR) {
    const has = owned.has(item.id);
    const afford = coins >= item.cost;
    const row = document.createElement("div");
    row.className = "shop-item" + (has ? " owned" : "");
    row.innerHTML = `
      <div class="shop-item-main">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-effect">${item.effect}</div>
        <div class="shop-item-blurb">${item.blurb}</div>
      </div>
      <div class="shop-item-buy"></div>
    `;
    const buyWrap = row.querySelector(".shop-item-buy")!;
    if (has) {
      buyWrap.innerHTML = `<span class="shop-owned">Owned</span>`;
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${item.cost}`;
      btn.disabled = !afford;
      btn.addEventListener("click", () => onBuy?.(item));
      buyWrap.appendChild(btn);
    }
    body.appendChild(row);
  }
}

export function openShop() {
  renderShop();
  document.getElementById("shop-modal")?.classList.add("open");
}

export function closeShop() {
  document.getElementById("shop-modal")?.classList.remove("open");
}
