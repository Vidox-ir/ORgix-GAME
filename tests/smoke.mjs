import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("index.html", "utf8");
const game = readFileSync("game.js", "utf8");
const backend = readFileSync("backend.js", "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const used = new Set([...game.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
const missing = [...used].filter((id) => !ids.has(id));
assert.deepEqual(missing, [], "Every game.js DOM id must exist in index.html");

for (const path of ["styles.css", "supabase/config.toml", "supabase/functions/ironvale-guest/index.ts"]) {
  assert.ok(existsSync(path), "Missing project file: " + path);
}
assert.ok(html.includes('id="worldCanvas"'), "Canvas mount is missing");
assert.ok(html.includes('id="joinForm"'), "Guest-entry form is missing");
assert.ok(backend.includes("/functions/v1/ironvale-guest"), "Cloud API endpoint is not configured");
assert.ok(backend.includes("sb_publishable_"), "Publishable Supabase key is not configured");
assert.ok(!backend.includes("service_role"), "A server secret must never be placed in browser code");
assert.ok(game.includes("function spawnWave"), "Raider wave system is missing");
assert.ok(game.includes("function build("), "Building placement system is missing");
console.log("IRONVALE static smoke checks passed.");
