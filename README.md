# Kaden VR Fishing Quest

A full-featured WebXR VR fishing game built with Three.js. Cast from the dock, fight fish with a tension-based reel minigame, explore three lake zones, fill your fish codex, upgrade gear, and complete quests.

**Live:** https://kaden-fishing-quest-ronell-bradleys-projects.vercel.app

## Play

- **VR**: Open in a WebXR-capable browser (Meta Quest Browser, etc.) and tap **Enter VR**
- **Desktop**: Click the canvas to look around, use WASD to move, **Space** to cast/hook, **R** to reel, **M** for menu

## Features

- Immersive 3D lake with animated water shader, dock, camp, trees, and ambient fish
- Full fishing loop: cast → wait for bite → hook → reel with tension management
- 8 fish species across common, uncommon, rare, and legendary tiers
- 3 zones: Lake Dock, North Cove, Deep Water (boat upgrade required)
- Fish codex with per-species stats
- Gear upgrades: rod, boat, bait
- Quest system with coin rewards
- **Neon Postgres** cloud saves and leaderboard
- **Vercel** serverless API for progress sync
- WebXR VR + desktop fallback controls

## Deploy to existing Vercel project

**Production URL:** https://kaden-fishing-quest-ronell-bradleys-projects.vercel.app  
**Vercel project:** `kaden-fishing-quest`

### Option A — Reconnect Git (fastest, no secrets)

1. [Vercel Dashboard](https://vercel.com) → **kaden-fishing-quest** → **Settings** → **Git**
2. Connect repository `ronb12/kaden-fishing-quest`, production branch `main`
3. Click **Redeploy** on the latest commit

### Option B — GitHub Actions (CI deploy)

Add these secrets in GitHub → Settings → Secrets:

| Secret | Where to find it |
|--------|------------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link` |

Push to `main` triggers automatic production deploy.

### Option C — Deploy hook

1. Vercel → **kaden-fishing-quest** → **Settings** → **Git** → **Deploy Hooks** → create hook for `main`
2. Add URL as GitHub secret `VERCEL_DEPLOY_HOOK`
3. Run **Deploy Hook** workflow in GitHub Actions

### Option D — CLI

```bash
npx vercel login
npx vercel link --project kaden-fishing-quest
npx vercel --prod
```

## Deploy to Vercel + Neon

### 1. Neon database

Project: [blue-hall-85263365](https://console.neon.tech/app/projects/blue-hall-85263365)  
Database: `kaden_fishing_quest`

```bash
cp .env.example .env
# Paste your Neon connection string into DATABASE_URL
npm install
npm run db:setup
```

### 2. Vercel project

Project: `kaden-fishing-quest`  
Repo: `ronb12/kaden-fishing-quest`

1. Import the GitHub repo in [Vercel Dashboard](https://vercel.com)
2. Add the **Neon** integration (or set `DATABASE_URL` manually in Environment Variables)
3. Deploy — API routes at `/api/progress` and `/api/leaderboard` activate automatically

```bash
npm install
npx vercel link
npx vercel env pull .env.local
npm run db:setup
npx vercel --prod
```

### API endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/progress?playerId=` | GET | Load cloud save |
| `/api/progress` | POST | Save progress `{ playerId, state }` |
| `/api/leaderboard` | GET | Top 20 anglers |

## Controls

| Action | VR (right controller) | Desktop |
|--------|----------------------|---------|
| Cast | Trigger | Space |
| Hook bite | Trigger | Space |
| Reel | Hold trigger | Hold R |
| Menu | Grip (left) / ☰ button | M |
| Move | Walk in playspace | WASD |
| Zone switch | Menu or keys 1–3 | 1–3 |

## Development

```bash
npm install
npx vercel dev
```

Requires HTTPS for WebXR in production (Vercel provides this automatically).

## Stack

- Three.js r170 (CDN import map)
- WebXR Device API
- Vercel Serverless Functions
- Neon Postgres (`@neondatabase/serverless`)
- Vanilla ES modules
