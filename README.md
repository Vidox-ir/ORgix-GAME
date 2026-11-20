# IRONVALE — Lords of the Frontier

A browser-based, single-player medieval strategy game inspired by the *genre* of classic castle and settlement builders. It uses original game rules and hand-drawn Canvas artwork; no Stronghold art, maps, sounds, logos, or other commercial game assets are copied.

## Play

The game is a static website. Once GitHub Pages is enabled for this repository, it will be available at:

https://vidox-ir.github.io/ORgix-GAME/

The repository includes a GitHub Actions workflow that checks the JavaScript and then publishes the root folder on pushes to main.

**One-time hosting setup:** open [Repository Pages settings](https://github.com/Vidox-ir/ORgix-GAME/settings/pages), then in **Build and deployment** set **Source** to **GitHub Actions** and save. The connected GitHub app can push code and run checks, but GitHub blocked it from creating the Pages site itself; this one setting must be enabled by the repository owner. After enabling it, open [the latest workflow run](https://github.com/Vidox-ir/ORgix-GAME/actions) and choose **Re-run all jobs**. When the deploy job reports success, the public game URL will be https://vidox-ir.github.io/ORgix-GAME/.

For local testing, serve the repository root with any static web server, for example:

    python -m http.server 8000

Then open http://localhost:8000.

## Current playable slice

- Isometric 28 × 22 frontier map with grassland, forests, rocky deposits, water and a keep.
- Resource economy: wood, stone, food and gold.
- Construction: farms, lumber camps, quarries, market, houses, barracks, walls and archer towers.
- Guest commander name (no email, password or registration form).
- Soldiers, enemy raider waves, tower attacks, building damage, morale, population and a 12-day survival objective.
- Mouse/touch map placement, drag-to-pan, mouse-wheel zoom, WASD/arrow panning, pause and speed controls.
- Local autosave, cloud save, JSON export/import and offline fallback.

## Controls

| Input | Action |
|---|---|
| Click a build card, then a map tile | Place a building |
| Drag on map | Pan camera |
| Mouse wheel | Zoom |
| WASD / arrow keys | Pan camera |
| Space | Pause / resume |
| Esc | Cancel current build or attack order |
| Attack button, then map tile | Move the army to a location |

## Supabase

Cloud saves are backed by the Supabase project GAME-orgix.

- SQL migration: supabase/migrations/20261120120000_ironvale_guest_game_backend.sql
- Edge Function: supabase/functions/ironvale-guest/index.ts
- Function name: ironvale-guest
- The function uses the server-side secret key only inside Edge Functions. The browser contains only the project publishable key.
- Public table access is revoked; game data is accessed by the Edge Function using the service role. Session tokens are randomly generated and stored only as SHA-256 hashes in the database.
- Requests have per-IP rate limits, strict nickname validation and save-size limits.

No conventional account is created. A long random guest token is kept in the browser to reconnect to the same save. **Clearing browser site data, switching browsers or changing devices can make that guest save unrecoverable.** Use Export Save to keep a portable backup. If the Supabase connection is unavailable, the game continues with local storage.

## Structure

    .
    ├── index.html
    ├── styles.css
    ├── backend.js
    ├── game.js
    ├── supabase/
    │   ├── config.toml
    │   ├── migrations/
    │   └── functions/ironvale-guest/index.ts
    └── .github/workflows/pages.yml

## Technical notes

- Runtime: browser-native JavaScript + Canvas 2D; no local install or build step.
- All map terrain and building illustrations are generated in code, so there are no third-party art or sound assets to download.
- This is an early playable vertical slice, not a finished commercial-scale RTS. The first release focuses on settlement building, resource management and a compact PvE siege loop. Advanced pathfinding, diplomacy, multiplayer and a campaign editor are future systems.
