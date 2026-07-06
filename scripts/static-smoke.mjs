import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), "utf8");
const html = read("index.html");
const app = read("app.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const id of [
  "manualAddButton",
  "sampleCollectionButton",
  "clearFiltersButton",
  "emptyTitle",
  "emptyCopy",
  "collectionBoard",
  "recordDialog"
]) {
  assert(html.includes(`id="${id}"`), `missing #${id} in index.html`);
}

for (const token of ["SAMPLE_RECORDS", "loadSampleCollection", "renderEmptyState", "clearFilters"]) {
  assert(app.includes(token), `missing ${token} in app.js`);
}

const assetPattern = /(?:href|src)="([^"#]+)"/g;
for (const [, raw] of html.matchAll(assetPattern)) {
  if (/^(https?:|mailto:|data:)/.test(raw)) continue;
  const assetPath = raw.replace(/^\.\//, "").split("?", 1)[0];
  if (!assetPath || assetPath.startsWith("/")) continue;
  assert(existsSync(join(root, assetPath)), `missing referenced asset: ${raw}`);
}

for (const icon of manifest.icons || []) {
  const iconPath = String(icon.src || "").replace(/^\.\//, "");
  assert(iconPath && existsSync(join(root, iconPath)), `missing manifest icon: ${icon.src}`);
}

assert(manifest.name === "LP Crate", "manifest name must be LP Crate");
assert(html.includes('rel="icon"'), "index.html should declare a favicon");
assert(html.includes('name="description"'), "index.html should include a meta description");

if (failures.length) {
  console.error(`Static smoke failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Static smoke passed: HTML assets, manifest, and sample-onboarding hooks are present.");
