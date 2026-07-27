# Smudgeworld — design

A photography collection game. Third-person, in a hand-drawn 3D park. Web and
mobile from the same build, installable to a home screen.

> This is the design doc: the shape of the thing and where it's going. For
> what's actually built and how to run it, see [README.md](README.md).
>
> Sections are marked **[built]**, **[partial]** or **[planned]** so the two
> don't drift apart.

You play a stickman wandering a hand-drawn, line-art world with a camera around your neck. The world is smudged: scattered through it are dark, blurry figures called **smudges** that the eye can't resolve. Only a photograph can un-smudge one.

## Core loop — [built]

- Explore the world on foot.
- Spot smudges — dark, blurry figures the eye can't resolve.
- Snap a photo. The picture develops into a **snapshot**, the game's collectible card.
- Shots of anything else land in your personal **photo library** as keepsakes, outside the collection.

The world itself stays smudged forever. The only clear images of these creatures anywhere are the ones inside players' libraries.

## Snapshots and grading — [partial]

A snapshot's **grade** is how sharp it develops:

- Shutter timing against a pulsing focus ring, plus gear and condition bonuses,
  set a **clarity percentage**.
- A sloppy shot stays murky. A perfect one comes out razor sharp.
- You can reshoot any smudge when it reappears.
- Your library keeps the clearest take. Older takes become tradeable **spares**.
- Every snapshot is stamped with the exact moment it was caught — provenance is part of the card.

Spares are **[planned]** — the library keeps your best take today, but older
ones aren't yet retained as separate tradeable objects. They need to be before
the exchange can exist.

## Smudge types

- **Common** — easy, always around. **[built]**
- **Timed** — demand split-second timing inside a one-second window. **[built]**,
  as the After Dark subjects: they only exist at night and blink through a
  one-second window on a six-second cycle.
- **Day-locked** — appear only on certain real-world days (a Saturday street
  market, a monthly comet). **[planned]** — this is the scarcity the marketplace
  is built to trade, so it wants to land alongside accounts rather than before.

## Sets and progression — [built]

Three sets across eleven subjects:

| Set | Subjects |
|---|---|
| Park Life | Park Cat, Bench Sitter, Pigeon Council, Kite Runner, Fountain Diver |
| Waterside | Heron, Koi Shadow, Dragonfly, Frog Chorus |
| After Dark | Comet Sparrow, Blink Fox — night only |

Completing a set pays coins. Coins buy camera gear:

| Gear | Cost | Effect |
|---|---|---|
| Steady Grip | 120 | Focus ring pulses slower — easier to time |
| Wide Lens | 220 | Spot smudges from half again as far |
| Fast Shutter | 340 | The sharp part of the focus ring is wider |
| Night Film | 480 | +12% clarity on every shot taken at night |
| Fine Optics | 700 | +8% clarity on everything |

Gear unlocking **deeper zones** with rarer smudges is **[planned]** — today it
buys clarity and reach within the one park.

## The park — [built]

One continuous 120x90 map, laid out as five places rather than an even
scatter of trees:

- **The green** — the central lawn you spawn on. Bright turf, long drifts of
  daisies, a gravel circle where four walks meet.
- **The grove** — mature closed canopy on a dark floor. Birch stems and
  conifers, ferns, fallen mossy logs, toadstools. You lose the horizon here.
- **The garden** — ornamental. Pruned little trees, some in blossom, clipped
  box hedges, tight beds of colour, benches, rose arches over the walk.
- **The wilds** — dry olive ground, dead snags, boulders, cairns, heather.
- **The waterside** — the pond with a reed fringe and a sandy shore, willows
  leaning over it, driftwood, and the massif behind with the falls coming
  down a notch in the cliff.

Each region is a different plant list, not the same plants at a different
spacing — silhouette is what tells you where you are from across the park.
Ground colour shifts with it, so a border reads even with nothing on it.

Walks spoke out from the green to each of the others, bending around the
water and petering out where they arrive rather than stopping dead. Nothing
plants on a walk, in the water, or on the sight line from the pond's south
shore to the falls.

## No story — [built]

There was an epistolary frame here: letters from an archivist that arrived on
progress and seeded the economy as fiction before it existed as software. It's
been cut. Progression is the whole of the game — capture, clarity, sets, coins,
gear — and the letters were popups between the player and that loop.

The ideas the letters were carrying still hold, and the economy below still
needs them to be true; they just don't need to be *told*:

- A photograph is the only clear likeness of a subject anywhere. The world
  staying smudged says this by itself.
- Older takes survive as spares worth trading.
- Miss an hour and it doesn't come back around on your account.
- Other photographers are out there with their own half-finished runs.

If any of this ever needs stating, it should be stated by the marketplace UI
when the marketplace exists, not by a letter before it does.

## Economy — [partial]

- Single currency: **coins**. **[built]** — earned from clarity and set payouts,
  spent in the gear shop, saved to `localStorage`.
- Topped up with real money. **[planned]**, and last on purpose.
- Spent on a **player marketplace**: **[planned]**
  - Spares get listed.
  - Missed day-locked moments can be bought from someone who was there.
- A small **transaction fee** fights inflation and doubles as revenue. **[planned]**
- Scarcity comes from skill and the calendar — never loot odds. **[built]**, in
  that nothing in the game is random-rolled: clarity is your timing and your
  gear, and the only gate is the clock.

## Build order

1. **Single-player core.** — [built]
2. **Accounts and direct trading.** — [planned]
3. **Marketplace** on earned coins. — [planned]
4. **Purchasable coins** — only once the economy has proven itself. — [planned]

### What step 2 actually needs

Recorded here so the jump from 1 to 2 isn't a surprise:

- **Save state moves off the device.** Everything lives in `localStorage` under
  one key today. Trading needs a server that owns the ledger, because a client
  that can edit its own library can mint plates.
- **Spares become real objects.** The library keeps a best-take per subject;
  it has to keep every take, each with its own clarity and timestamp, before
  there's anything to list.
- **Provenance has to be trustworthy.** A snapshot is already stamped with the
  moment it was caught. Once that stamp sets a price, it has to be issued by
  the server rather than read off the player's clock.
