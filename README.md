# POST 09 — The Last Shift

**Persian title:** پست ۰۹: آخرین شیفت

A browser-based, single-player pixel-art border mystery. Walk through a remote snowbound checkpoint in side view, inspect passports at a first-person desk, compare official documents and decide who may cross. The story deepens across four night shifts as the radio, old entry ledger and strange visitors reveal that something is collecting the names left behind.

## Play

The game is a static website. Once GitHub Pages is enabled for this repository, it will be available at:

https://vidox-ir.github.io/ORgix-GAME/

The GitHub Actions workflow checks JavaScript syntax, DOM references, story content and document/decision coverage before publishing.

**One-time hosting setup:** open [Repository Pages settings](https://github.com/Vidox-ir/ORgix-GAME/settings/pages), then in **Build and deployment** set **Source** to **GitHub Actions** and save. The connected GitHub app can push code and run checks, but it cannot create the Pages site itself. After enabling it, open [GitHub Actions](https://github.com/Vidox-ir/ORgix-GAME/actions) and re-run the latest workflow. The first successful Pages deployment creates the public game URL above.

For local testing, serve the repository root:

    python -m http.server 8000

Then open http://localhost:8000. Phaser 4.2.1 and Google Fonts are loaded from pinned/standard CDNs; an internet connection is needed for those libraries on first launch. The story, UI, art and saves run in the browser.

## Controls

| Input | Action |
|---|---|
| A / D or ← / → | Walk left and right |
| E | Interact with the nearby station object |
| J or Space | Jump |
| Escape | Pause |
| Mouse / touch | Select fields and decisions in the document desk UI |

## Core gameplay

- Side-view exploration of the interior of a remote snowy border station.
- Five interactable areas: visitor window, radio, regulation board, generator and evidence locker.
- First-person document desk: passport, entry declaration, permit/visa and daily rules.
- Compare names, passport numbers, dates of birth, nationality, expiry, destination, permit number, portrait and guardian details.
- Mark discrepancies, question the visitor, then choose admit, refuse or hold.
- Seven authored visitor files over four shifts, each with dialogue, document data and a result for all three decisions.
- Trust, suspicion and clue variables influence the final story.
- Four endings, including an evidence-led ending for careful investigation.
- Local browser save plus an optional Supabase guest save.

## Supabase guest saves

Cloud saves use the connected Supabase project GAME-orgix and the borderwatch-guest Edge Function.

- Schema migration: supabase/migrations/20261120135000_borderwatch_guest_save.sql
- Edge Function: supabase/functions/borderwatch-guest/index.ts
- Browser uses only the project's publishable API key.
- Service-role access stays inside the Edge Function. Guest tokens are random and stored only as SHA-256 hashes.
- Player and session tables have RLS enabled; public roles cannot read or write player data.
- Rate limits, nickname validation, token expiry and save-size limits are applied.

No email or password is required. The guest token is kept in the browser to reconnect to the same save. Clearing browser site data or switching browsers can make that guest save unrecoverable; use a browser backup before clearing storage.

## Project structure

    index.html
    styles.css
    borderwatch.js
    story.js
    backend.js
    supabase/
      config.toml
      migrations/
      functions/borderwatch-guest/index.ts
    docs/
      game-design.md
      story-branches.md
    assets/asset-register.csv
    tests/smoke.mjs
    .github/workflows/pages.yml

## Engine and art

- Phaser 4.2.1 for the side-view world and pixel rendering.
- Original station environment and character silhouettes drawn in code; no commercial game sprites, maps, story text or soundtrack are copied.
- Display: Oxanium; document serials: JetBrains Mono; Persian UI: Noto Sans Arabic.
- The game is an early playable narrative slice, not yet a fully human-playtested commercial release. See docs/game-design.md for scope and docs/story-branches.md for decisions/endings.
