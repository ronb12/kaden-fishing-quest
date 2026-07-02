# Kaden VR Fishing Quest

A full-featured WebXR VR fishing game built with Three.js. Cast from the dock, fight fish with a tension-based reel minigame, explore three lake zones, fill your fish codex, upgrade gear, and complete quests.

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
- Progress saved to localStorage
- WebXR VR + desktop fallback controls

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

Static site — no build step. Serve locally:

```bash
npx serve .
```

Requires HTTPS for WebXR in production (Vercel provides this automatically).

## Stack

- Three.js r170 (CDN import map)
- WebXR Device API
- Web Audio API (procedural SFX)
- Vanilla ES modules
