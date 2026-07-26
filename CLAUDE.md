# Claude workflow notes

## Merging

Auto-merge your own pull requests once pushed. Don't wait for the user to click
merge, and don't ask. Use `merge_pull_request` right after
`create_pull_request`, default merge method (merge commit is fine — it matches
the existing history).

Only pause for the user when:
- CI is red on the PR (fix first, then merge)
- The change is genuinely risky (irreversible data change, secrets, prod
  migration) — not just "large refactor"

Rationale: this is a solo project on a design branch; the user grants blanket
merge authority to keep the loop tight.

## Verifying visual work

This is a game. `tsc` passing proves nothing about whether a change looks
right, and several bugs here have survived a clean build and a careful read —
a waterfall hidden behind its own boulders, an entire cloud layer eaten by
fog, a ground texture that was correct in the canvas and wrong on screen.

Look at the thing before saying it works:

```bash
npm run build
npx vite preview --port 5173 --host 127.0.0.1 &
node <script>.mjs          # Playwright, executablePath /opt/pw-browsers/chromium
pkill -f "vite preview"
```

Notes on the loop:

- The container has no GPU, so Chromium falls back to software WebGL. World
  build plus first render takes ~20s — scripts need `waitForTimeout(14000)`
  after clicking `#menu-start` and a generous `click` timeout, and `dt` is
  clamped, so the game runs in slow motion. Distances travelled in a test will
  be a fraction of real ones; directions are still exact.
- Dismiss `#letter-modal` before screenshotting; it soft-pauses the game, and
  a survey script that ignores it produces N identical images.
- `window.__sw` exposes debug hooks — `warp(x, z, yaw)`, `teleportToSmudge`,
  `setTime`, `pose`, `setCamYaw`, `subjectPos`, `scene`, `addCoins`. Add to it
  rather than reaching into module internals from tests.

**Measure, don't squint.** Where a claim can be checked numerically, check it:
walk a fixed heading and assert the axis you moved along; read
`getBoundingClientRect()` against the viewport for layout rather than eyeballing
a screenshot; dump a generated texture to PNG and look at the texture itself
when the render is wrong. Every one of those turned up a cause that reading the
code had missed.

## Scratch files

Playwright scripts, probes and screenshots go in the session scratchpad, not
the repo. Nothing in `src/` or the repo root should exist only to support a
test run.
