// Seeds are the artwork's identity, so they have to be boringly reliable: the same seed gives
// the same hash and the same random stream on every run and machine, different seeds diverge,
// and the stream is uniform enough that a piece's "rare" branches are actually rare.
import { isHash, prng, seedHash, randomHash, shortHash, sfc32 } from "../src/seed.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓", m)) : (fail++, console.log("  ✗", m)));
const take = (r, n) => Array.from({ length: n }, r);

// ── hashes ─────────────────────────────────────────────────────────────────────
ok(isHash(seedHash(42)) && isHash(seedHash("spring-show")), "numbers and strings become 32-byte hashes");
ok(seedHash(42) === seedHash(42) && seedHash(42) === seedHash("42"), "the same seed always gives the same hash");
ok(seedHash(42) !== seedHash(43), "neighbouring seeds give unrelated hashes");
// pinned, so a change to the derivation can't silently re-roll every pinned piece in every gallery
ok(seedHash(42) === "0xa7bcccffa21730bc9f0e126a9aa5ee2947b9305769aac5cc2d8430730397c5e8", "seedHash(42) is pinned");
ok(prng(seedHash(42))().toFixed(12) === "0.733841987327", "…and so is the first value of its stream");
const H = "0x" + "ab".repeat(32);
ok(seedHash(H) === H && seedHash(H.toUpperCase().replace("0X", "0x")) === H, "a 0x hash passes through (lower-cased)");
ok(isHash(randomHash()) && randomHash() !== randomHash(), "randomHash is fresh every time");
ok(shortHash(H) === "0xabab…abab", "short form for labels");
ok(!isHash("0x1234") && !isHash(42) && !isHash("ab".repeat(32)), "isHash rejects short, numeric and unprefixed values");

// ── the stream ─────────────────────────────────────────────────────────────────
const a = take(prng(seedHash(42)), 1000), b = take(prng(seedHash(42)), 1000), c = take(prng(seedHash(43)), 1000);
ok(a.every((v, i) => v === b[i]), "same hash → identical stream");
ok(a.filter((v, i) => v === c[i]).length < 3, "different hash → different stream");
ok(a.every((v) => v >= 0 && v < 1), "values in [0, 1)");
const big = take(prng(randomHash()), 200000);
const mean = big.reduce((s, v) => s + v, 0) / big.length;
const bins = new Array(10).fill(0);
for (const v of big) bins[Math.floor(v * 10)]++;
ok(Math.abs(mean - 0.5) < 0.005, `mean ≈ 0.5 (${mean.toFixed(4)})`);
ok(bins.every((n) => Math.abs(n - 20000) < 800), "deciles within 4% of flat");
ok(Math.abs(big.filter((v) => v < 0.01).length / big.length - 0.01) < 0.002, "a 1% branch fires ~1% of the time");
// the half the hash XOR folds in matters: flipping a byte in the second half changes the stream
const H2 = H.slice(0, 40) + "cd" + H.slice(42);
ok(take(prng(H), 5).join() !== take(prng(H2), 5).join(), "all 256 bits of the hash count");
ok(typeof sfc32(1, 2, 3, 4)() === "number", "sfc32 is exported for pieces that want their own streams");
let threw = false; try { prng("nope"); } catch { threw = true; }
ok(threw, "prng refuses a non-hash rather than seeding from garbage");

console.log(`\n${fail === 0 ? "✓" : "✗"} seed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
