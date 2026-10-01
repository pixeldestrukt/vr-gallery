// Vendor the viewer into another site: copies viewer/ + src/ (what the page imports, nothing
// else) to <dest>/, so a page on that site can embed it —
//   <iframe src="/vr-gallery/viewer/?project=/parameters/gallery.yaml">
// Re-run to update. `node scripts/vendor.mjs ../dnuke.art/vr-gallery`
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("usage: node scripts/vendor.mjs <dest>"); process.exit(2); }
rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
for (const d of ["viewer", "src"]) cpSync(path.join(ROOT, d), path.join(dest, d), { recursive: true, filter: (f) => !/node_modules|\.test\.mjs$/.test(f) });
const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
let commit = ""; try { const head = readFileSync(path.join(ROOT, ".git/HEAD"), "utf8").trim(); commit = head.startsWith("ref:") ? readFileSync(path.join(ROOT, ".git", head.slice(5)), "utf8").trim() : head; } catch {} // unborn branch → ""
writeFileSync(path.join(dest, "vr-gallery.json"), JSON.stringify({ "vr-gallery": version, commit, vendored: new Date().toISOString(), from: "https://github.com/pixeldestrukt/vr-gallery" }, null, 2) + "\n");
console.log(`✓ vendored viewer + src → ${dest} (vr-gallery ${version}${commit ? " @ " + commit.slice(0, 7) : ""})`);
