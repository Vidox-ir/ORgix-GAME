# POST 09 — The Last Shift

## Playable brief
A single-player story mystery set at a remote snowy border post. The player walks through the station in side view, interacts with a passport window, radio, rule board, generator and evidence locker, then switches to an immersive first-person desk view to compare the passport, entry form, permit and current regulation sheet. Each visitor may be admitted, refused or held for questions. Document accuracy, dialogue choices and discoveries influence trust, suspicion, clues and the ending.

## Engine decision
- Engine: Phaser 4.2.1, browser 2D.
- Rendering: 960×540 fixed design resolution, FIT scaling, pixel-art rendering and a side-scrolling camera.
- UI: semantic HTML/CSS layered over the Phaser scene for document inspection and branching dialogue.
- Runtime: static hosting; Supabase is optional persistence, not required for the local story loop.
- Why: browser-native delivery, immediate keyboard input, predictable 2D scene drawing and no app installation.

## Visual bible
- Camera A: side-on interior view of a compact border outpost, with snowy mountain silhouettes visible through the window.
- Camera B: first-person desk composition; passport, declaration, permit and daily regulations laid out as tactile paper artifacts.
- Palette: midnight navy, cold blue-grey, frost white, aged paper, brass and restrained warning red.
- Pixel density: medium-detail 16/32-bit inspired art, 960×540 target canvas, crisp nearest-neighbour rendering; pixel blocks remain readable rather than excessively chunky.
- Lighting: cold moonlight outside, tungsten desk lamp inside, occasional red radio LED.
- Typography: Oxanium for display, JetBrains Mono for serials and document codes, Noto Sans Arabic for Persian dialogue/UI.
- Accessibility: readable document text, explicit decision labels and color plus text indicators for discrepancy state.

## Core loop
Walk to an interactable station object → read a message, rule or piece of evidence → inspect a visitor’s four documents → mark matching/mismatching fields → optionally ask one question → admit, refuse or hold → see the consequence → progress to the next shift.

## Four-shift narrative
1. Routine arrivals. A courier leaves a cassette and a warning about the radio.
2. Identity and guardianship checks. A shepherd's expired document points to a name in an old missing-person ledger; a mother and child reveal a deleted companion record.
3. Emergency orders. A military pass duplicates the officer's signature; an unregistered passenger has no usable identity.
4. Final entry. A visitor presents a passport with the officer's own name and badge number.

## Variables and ending conditions
- Trust: accumulated through careful, humane and evidence-led decisions.
- Suspicion: increases when records are mishandled or anomalies are ignored.
- Clues: evidence discovered in dialogue, radio and document comparison.
- Endings:
  - White Dawn: hold the final visitor, collect at least four clues and reach trust ≥ 3.
  - Open Gate: admit the final visitor.
  - Endless Border: refuse the final visitor.
  - Unfinished File: hold without enough evidence/trust.

## Current vertical slice acceptance
- Title and name-only guest entry.
- Side-view walk and five interactable props.
- Seven authored visitor files across four shifts.
- First-person passport/form/permit/rule presentation.
- Per-field discrepancy marking, one interview per visitor and three decisions.
- Local save plus optional guest cloud save.
- Four branch endings and restart path.
