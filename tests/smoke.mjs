import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const html = read("index.html");
const game = read("borderwatch.js");
const storySource = read("story.js");
const backend = read("backend.js");

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const used = new Set([...game.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
const missing = [...used].filter((id) => !ids.has(id));
assert.deepEqual(missing, [], "All Borderwatch DOM references must exist in index.html");

for (const path of [
  "styles.css", "backend.js", "story.js", "borderwatch.js",
  "supabase/config.toml",
  "supabase/migrations/20261120135000_borderwatch_guest_save.sql",
  "supabase/functions/borderwatch-guest/index.ts",
  "docs/game-design.md", "docs/story-branches.md", "assets/asset-register.csv"
]) assert.ok(existsSync(path), "Missing project file: " + path);

assert.ok(html.includes('src="./borderwatch.js"'), "The story game entry point is not loaded");
assert.ok(html.includes("phaser@4.2.1"), "Pinned Phaser runtime is missing");
assert.ok(backend.includes("/functions/v1/borderwatch-guest"), "Guest-save endpoint is not configured");
assert.ok(backend.includes("sb_publishable_"), "Supabase publishable key is missing");
assert.ok(!backend.includes("service_role"), "A server secret must never be in browser code");
assert.ok(game.includes("function openInspection"), "First-person document inspection is missing");
assert.ok(game.includes("function decide"), "Admit / deny / hold decision system is missing");
assert.ok(game.includes("function finish"), "Branching ending system is missing");

const scope = { window: {} };
runInNewContext(storySource, scope);
const story = scope.window.BORDER_STORY;
assert.equal(story.cases.length, 7, "Seven visitor files should be present");
assert.equal(story.shifts.length, 4, "Four shifts should be present");

const allowed = new Set(["admit", "deny", "hold"]);
for (const c of story.cases) {
  assert.ok(c.id && c.name && c.passport && c.form && c.visa, "A visitor document set is incomplete");
  assert.ok(c.interview?.choices?.length, "Every visitor should have an interview branch");
  assert.ok(c.result?.admit && c.result?.deny && c.result?.hold, "Every decision must have a consequence");
  assert.ok(allowed.has(c.correct), "Every visitor needs a valid intended decision");
}
assert.ok(game.includes('s.finalDecision==="hold"'), "The evidence-led ending condition is missing");
console.log("POST 09 static integration checks passed: DOM, story graph, document files, decisions, saves and function wiring.");
