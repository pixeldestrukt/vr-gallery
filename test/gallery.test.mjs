// The gallery model: block-scalar story text survives the YAML subset, works hang where they're
// told (or auto-hang without overlapping or leaving the wall), media resolve against the gallery
// file, and authoring mistakes come back as warnings rather than exceptions.
import { readFileSync } from "node:fs";
import { parseYAML } from "../src/yaml.mjs";
import { normalize, viewpoint, wallLength, WALLS } from "../src/gallery.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓", m)) : (fail++, console.log("  ✗", m)));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const eqArr = (a, b, e = 1e-6) => a.length === b.length && a.every((x, i) => near(x, b[i], e));

// ── yaml: block scalars ────────────────────────────────────────────────────────
const y = parseYAML(`
exhibits:
  - id: a
    story:
      text: >
        First line
        folds on.

        # not a comment, a heading in the text
        Second para.
      code: |
        W, H = 1200, 780
          indented: kept
    after: 3   # a real comment
`);
const st = y.exhibits[0].story;
ok(st.text === "First line folds on.\n\n# not a comment, a heading in the text Second para.", "`>` folds lines, blank line = paragraph, # inside is text");
ok(st.code === "W, H = 1200, 780\n  indented: kept", "`|` keeps newlines and relative indent");
ok(y.exhibits[0].after === 3, "parsing resumes after the block at the right indent");

// ── explicit hang ──────────────────────────────────────────────────────────────
const base = "https://example.org/rooms/demo/gallery.yaml";
const g = normalize({
  room: { size: [8, 6, 3] },
  exhibits: [
    { id: "n", media: { image: "art/n.jpg" }, wall: "north", at: 1, width: 1.2 },
    { id: "e", media: { image: "/abs/e.jpg" }, wall: "east", at: -0.5 },
    { id: "w", media: { image: "art/w.jpg" }, wall: "west", at: 0, y: 1.7 },
  ],
}, base);
const by = Object.fromEntries(g.exhibits.map((e) => [e.id, e]));
ok(eqArr(by.n.position, [1, 1.5, -3]), "north wall: z = -depth/2, at = +x");
ok(eqArr(by.e.position, [4, 1.5, -0.5]), "east wall: x = +width/2, at = +z (right as you face it)");
ok(eqArr(by.w.position, [-4, 1.7, 0]), "west wall with a custom height");
ok(by.n.media.src === "https://example.org/rooms/demo/art/n.jpg" && by.e.media.src === "https://example.org/abs/e.jpg", "media resolve against the gallery file");
ok(g.warnings.length === 0, "a clean gallery has no warnings");

// every wall's rotY turns +z (a plane's face) into that wall's inward normal
for (const [name, W] of Object.entries(WALLS)) {
  ok(eqArr([Math.sin(W.rotY), Math.cos(W.rotY)], [W.normal[0], W.normal[2]]), `${name}: rotY faces the room`);
}

// ── auto-hang ──────────────────────────────────────────────────────────────────
const many = normalize({
  room: { size: [7, 5, 3] },
  exhibits: Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, media: { image: `${i}.png` }, width: 1.1 })),
});
ok(many.exhibits.length === 9 && many.warnings.length === 0, "nine works fit a 7×5 room");
ok(many.exhibits[0].wall === "north", "hanging starts on the wall you face from the spawn");
for (const wall of Object.keys(WALLS)) {
  const run = many.exhibits.filter((e) => e.wall === wall).sort((a, b) => a.at - b.at);
  const half = wallLength(wall, [7, 5]) / 2;
  const inside = run.every((e) => Math.abs(e.at) + e.width / 2 <= half);
  const apart = run.every((e, i) => i === 0 || e.at - run[i - 1].at >= (e.width + run[i - 1].width) / 2 + 0.9 - 1e-9);
  const centred = !run.length || near(run[0].at, -run[run.length - 1].at);
  ok(inside && apart && centred, `${wall}: ${run.length} works inside the wall, gapped, centred`);
}
const tooMany = normalize({ room: { size: [3, 3, 3] }, exhibits: Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, media: { image: "a.png" }, width: 1.2 })) });
ok(tooMany.warnings.some((w) => /no wall space/.test(w)) && tooMany.exhibits.length < 12, "overflow is reported, not overlapped");

// ── warnings, not exceptions ───────────────────────────────────────────────────
const bad = normalize({
  room: { size: [5, 5] },
  exhibits: [
    { id: "dup", media: { image: "a.png" } },
    { id: "dup", media: { image: "b.png" } },
    { id: "nomedia" },
    { id: "far", media: { image: "c.png" }, wall: "north", at: 4, width: 2 }, // the default 9 m room: 4 + 1 > 4.5,
    { id: "odd", media: { image: "d.png" }, wall: "up" },
  ],
});
const warn = bad.warnings.join("\n");
ok(/room.size/.test(warn) && /duplicate exhibit id "dup"/.test(warn) && /nomedia: no supported media/.test(warn), "bad size, duplicate ids and missing media warn");
ok(/far: runs past the end/.test(warn) && /unknown wall "up"/.test(warn), "off-wall and unknown-wall warn");
ok(bad.exhibits.find((e) => e.id === "odd").wall !== "up", "an unknown wall falls back to auto-hang");
ok(normalize(undefined).exhibits.length === 0, "an empty file is an empty room");

// ── live media ─────────────────────────────────────────────────────────────────
const live = normalize({ exhibits: [
  { id: "r", media: { live: { module: "pieces/reaction.mjs", params: { scale: 0.5 } } } },
  { id: "p", media: { live: { module: "pieces/reaction.mjs", seed: 42 } } },
  { id: "s", media: { live: "pieces/drift.mjs" } },
  { id: "bad", media: { live: { seed: 1 } } },
] }, "https://example.org/g/gallery.yaml");
const L = Object.fromEntries(live.exhibits.map((e) => [e.id, e.media]));
ok(L.r.type === "live" && L.r.src === "https://example.org/g/pieces/reaction.mjs" && L.r.params.scale === 0.5, "live: module resolves against the gallery file, params pass through");
ok(L.r.seed === "random" && L.r.loop === true, "live: unseeded means a fresh iteration every run, rolling on");
ok(L.p.seed === 42 && L.p.loop === false, "live: a pinned seed holds its last frame");
ok(L.s.src.endsWith("/g/pieces/drift.mjs"), "live: a bare module path is shorthand");
ok(!L.bad && live.warnings.some((w) => /bad: live media needs a module/.test(w)), "live: missing module warns and skips");
const onChain = normalize({
  chain: { rpc: "http://127.0.0.1:8545", contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3", chainId: 31337 },
  exhibits: [
    { id: "c", media: { live: { module: "p.mjs", seed: "chain", piece: 1 } } },
    { id: "nopiece", media: { live: { module: "p.mjs", seed: "chain" } } },
  ],
});
const C = Object.fromEntries(onChain.exhibits.map((e) => [e.id, e.media]));
ok(onChain.chain.contract === "0x5FbDB2315678afecb367f032d93F642f64180aa3" && C.c.seed === "chain" && C.c.piece === 1 && C.c.loop, "chain: a broadcast piece keeps its piece id and rolls on");
ok(C.nopiece.seed === "random" && onChain.warnings.some((w) => /nopiece: seed: chain needs/.test(w)), "chain: no piece id falls back to random, with a warning");
const noChain = normalize({ exhibits: [{ id: "x", media: { live: { module: "p.mjs", seed: "chain", piece: 1 } } }] });
ok(noChain.exhibits[0].media.seed === "random" && noChain.chain === null, "chain: seed: chain without a chain block falls back to random");
ok(normalize({ chain: { rpc: "x", contract: "nope" } }).warnings.some((w) => /^chain:/.test(w)), "chain: a malformed contract address warns");

// ── viewpoint ──────────────────────────────────────────────────────────────────
const vp = viewpoint(by.n, [8, 6, 3], 0.8);
ok(near(vp[0], 1) && near(vp[1], -3 + 1.92), "stand out along the normal, 1.6× the work's size");
ok(near(viewpoint({ ...by.n, width: 5 }, [8, 6, 3])[1], 0), "never past the middle of the room");

// ── the shipped example parses clean ──────────────────────────────────────────
const demo = normalize(parseYAML(readFileSync(new URL("../examples/demo/gallery.yaml", import.meta.url), "utf8")), "file:///demo/gallery.yaml");
ok(demo.exhibits.length > 0 && demo.warnings.length === 0, `examples/demo: ${demo.exhibits.length} works, no warnings`);
ok(demo.exhibits.every((e) => typeof e.story.text === "string"), "examples/demo: every work carries its story");

console.log(`\n${fail === 0 ? "✓" : "✗"} gallery: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
