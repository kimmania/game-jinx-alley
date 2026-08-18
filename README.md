# 🎡 Jinx Alley

A neon-noir press-your-luck PWA. Spin the sliding light around an 18-tile ring,
build a run total, and BANK before the 3rd Jinx wipes it all.

**Play: https://kimmania.github.io/game-jinx-alley/**

## Game modes

- **Campaign** — 4 zones (Neon Strip → Jinx's Lair) with rising stakes, banked-cash
  targets, star ratings, persistent board upgrades (Gild Tiles, Spin Wells, Prize Row),
  and one-run protection consumables (Jinx Insurance, Peek Lens, Spin Anchor).
- **Daily Board** — one seeded board per calendar day, identical for every player.
  Fixed 5 spins, no shop or protections. Score = banked amount, one attempt per day,
  with a copy-to-clipboard share text for comparing with friends.

## Rules in brief

- SPIN moves the light; where it stops resolves: cash adds to the run total,
  +Spin refills spins (some +Spin tiles also pay a cash bonus), 👁 Jinx **wipes the run total to $0**.
- After the first spin, the ring shuffles and landed tiles flip back down
  before each new spin, so you can't time the same tile twice.
- 3 Jinxes = bust ($0 banked). BANK anytime to lock in the run total.
- Clean run (0 Jinxes): +10%. Banking above the zone target multiplies the excess ×1.5.

## Develop

```bash
npm install
npm run dev      # vite dev server
```

## Build / test / smoke

```bash
npm run build    # tsc + vite build → dist/ (PWA, precached)
npm test         # vitest — engine unit tests
npm run smoke    # Playwright WebKit smoke test: serves dist, screenshots
                 # key screens to docs/smoke/ (uses ?test=1 deterministic hook)
```

## Deploy

Static PWA deployed to GitHub Pages from `dist/` at
https://kimmania.github.io/game-jinx-alley/ (vite `base: /game-jinx-alley/`).

## Stack

TypeScript · Vite · vite-plugin-pwa (Workbox) · Vitest · Playwright (WebKit).
Engine (`src/engine/`) is UI-free: seeded mulberry32 RNG, Monte Carlo board
validation, campaign/run state machines. Persistence via `localStorage`.
