# vr-gallery

A light WebGL/WebXR gallery. One YAML file describes a room and the works on its walls; the
viewer turns it into a space you can walk through in a browser, on a phone, or in a VR headset.
**Every work carries its story**: not just title and medium, but the process that made it
(the tool, the source, the seed, the parameters), shown in the same place as the work.

No build step, no dependencies: three.js r160 is vendored, the viewer is plain ES modules, and
Node ≥ 18 is only needed for the dev server, the tests and the vendor script. This is the Unity
gallery without Unity.

```bash
make serve     # → http://localhost:8080/viewer/?project=/examples/demo/gallery.yaml
make test
```

Status: **second slice.** Image works and **live pieces** (running on the wall, seeded from a
hash, catchable by the moment), story panels on screen and in the headset, walk/teleport, deep
links, embedding. See [BRIEF.md](BRIEF.md) for scope and what's deliberately not here yet.

## A gallery file

```yaml
title: Five Recipes
artist: Someone
room:
  size: [9, 7, 3.4]        # width (x), depth (z), height, in metres
  wall: "#efece6"
  floor: "#57524d"
  spawn: { at: [0, 2.3], look: north }   # optional; this is the default

exhibits:
  - id: reaction
    title: Reaction
    year: 2026
    medium: Pigment print
    media: { image: img/reaction.jpg }     # relative to this file
    wall: north            # optional: leave out wall/at and it's auto-hung
    at: 0                  # metres from the wall's centre, + to the right as you face it
    width: 0.8             # metres; height follows the image
    y: 1.4                 # centre height, default 1.5
    story:
      text: >
        Folded prose. A blank line starts a new paragraph.
      process:             # any keys; tool / source / seed lead, params become a table
        tool: cv-draw / reaction.py
        source: https://github.com/…/reaction.py
        seed: 42
        params: { STEPS: 6500, F_RANGE: [0.018, 0.062] }
    links: { buy: https://…, more: https://… }   # "buy" is drawn as the primary button
    provenance: { … }      # reserved: a token / contract reference later. Displayed, never acted on.
```

The walls are named by compass: from the default spawn you face **north** (−z), **east** is on
your right. Works without a `wall` are hung in walking order (north, east, south, west), as many
per wall as fit, each run centred. Mistakes (a work past the end of its wall, an unknown wall,
duplicate ids, no space left) come back as console warnings, never as a blank page.

The YAML is a small built-in subset (from voxeled) plus `|` / `>` block scalars for story text.

## Live pieces, seeds and moments

A live work is a module that runs on the wall instead of an image:

```yaml
media:
  live:
    module: pieces/reaction.mjs   # relative to the gallery file
    seed: 42                      # pin it; leave it out for a fresh hash every iteration
    params: { scale: 0.5 }        # override the piece's defaults
```

It follows the generative-NFT convention (Art Blocks' `tokenData.hash`, fxhash's `fxhash`): a
work's identity is a **32-byte hash**, and every random decision comes from one PRNG seeded by it
(`src/seed.mjs`: sfc32 over all 256 bits). Same hash + same code = the same artwork, anywhere.
Numbers and strings become hashes deterministically (`seedHash(42)` is pinned in the tests, so
a change can't silently re-roll every pinned piece).

```js
export const meta = { name: "reaction", version: "1", steps: 6500, stepsPerFrame: 20, hold: 10 };
export const params = { scale: 0.5 };                     // defaults
export function create({ THREE, renderer, hash, rand, params }) {
  // draw every random choice from rand() — never Math.random()
  return { texture, aspect, traits, step(), render(), dispose() };
}
```

The runner owns time and counts `step()`s; a piece never reads the clock. So every frame is
addressable, and a **moment** is `{ hash, step }`. Clicking (or pulling the trigger on) a live
work **catches** it: it freezes, and its story shows the moment record, which is exactly what a
mint will store:

```json
{ "piece": "drift", "version": "1", "module": "…/drift.mjs", "hash": "0x8f3e…3792",
  "step": 290, "traits": { "palette": "#f6efe4/#c2412d", "night": false }, "params": { … } }
```

The URL gets `&hash=…&step=…`, and opening that link replays the hash to that step. The tests
check that the replayed frame is pixel-identical to the caught one. `traits` is what the hash
decided, and it's where rarity lives: `drift.mjs` has a 1-in-20 inverted "night" variant, a
branch on `rand()` that's rare by construction.

Two kinds of piece are shown: **stateful** (`reaction.mjs` on dnuke.art, a Gray-Scott sim in
ping-pong render targets; seeking means replaying) and **stateless** (`examples/demo/pieces/
drift.mjs`, where each frame is a pure function of hash and step). Only works in view are
stepped. GPU float math is deterministic on a given device, but it isn't guaranteed identical
across GPUs, so a mint should also store the captured image alongside the recipe.

## Minting a moment (the chain broadcast)

If the browser picked iteration hashes, anyone could search millions offline for a rare one and
mint it as if they'd caught it. So for mintable pieces the **chain** picks them.
`contracts/src/Moments.sol` (ERC-721) gives each piece an epoch of E blocks. Epoch e starts at
block e·E, and its iteration hash is `sha256(salt, blockhash(e·E))`. Nobody knows it before that
block exists, nobody can choose it, and every viewer sees the same one. A rare iteration is a
real event.

```yaml
chain: { rpc: https://sepolia.base.org, contract: "0x…", chainId: 84532 }
exhibits:
  - media: { live: { module: pieces/drift.mjs, seed: chain, piece: 1 } }
```

The viewer asks the contract for the current iteration (plain JSON-RPC, no web3 library), runs
it, and when you catch a frame the story panel offers **Mint this moment**. `mint(piece, epoch,
step)` recomputes the hash on-chain and enforces the rules:

- only while the start block's hash is still readable: the last 8191 blocks through the EIP-2935
  history contract (~4.5 h on Base; checked live on Base Sepolia and anvil), else the last 256
  via BLOCKHASH. That's enough time to catch a frame in a headset and mint it later from a phone
- each moment (piece, epoch, step) only once
- at most `maxPerIteration` moments per iteration
- the piece's price, paid to the contract; the owner withdraws

Before sending, the viewer checks that the hash on screen is the chain's hash for that epoch, so
an edited URL can't mint a frame that wasn't broadcast. Token metadata is built on-chain:
`animation_url` is the gallery link with `&hash=…&step=…`, so a marketplace shows the live
replay of the exact moment.

Known limit: a bot can still read recent iterations, compute their traits and snipe rare
ones. It's a live drop, so first come, first served.

```bash
make contracts      # forge test: 12 tests
make chain          # anvil (1 s blocks) + Moments + drift as piece 1   (terminal 1)
make serve          # then open /viewer/?project=/examples/chain/gallery.yaml   (terminal 2)
```

With no wallet installed, the local chain mints from anvil's unlocked dev account. On a real
network it goes through the visitor's wallet (EIP-1193), adding Base / Base Sepolia to the wallet
if it's missing.

**No wallet at hand?** A caught, mintable moment shows a QR code of its link, in the drawer and
on the headset panel. A phone can't scan a headset's screen, so the panel asks you to
**screenshot it** (Meta button + trigger). Quest screenshots sync to the phone app, and a phone
reads QR codes from photos. Opening the link replays the moment and offers the mint. The QR
encoder tops out at 181 bytes; dnuke.art moment links are ~140.

## Deploying (Base Sepolia)

The deploy signs with your key from Foundry's encrypted keystore. Nothing here reads a raw
private key.

```bash
cast wallet import deployer --interactive     # once: paste the key, choose a password
# fund it with Base Sepolia ETH (see Test ETH below), then:
make deploy PIECE_NAME=reaction PIECE_URL="https://dnuke.art/vr-gallery/?work=reaction" \
            EPOCH_BLOCKS=8 STEPS=6500
```

It prints the contract address. Put it in the gallery's `chain:` block (`chainId: 84532`,
`rpc: https://sepolia.base.org`) and set the piece's `seed: chain, piece: 1`.

### Test ETH

We get Base Sepolia ETH from **[faucet.zalalena.com/base](https://faucet.zalalena.com/base)**. It
needs no login and no mainnet balance, only a captcha. Claims repeat with a cooldown. Paste only an
**address** there, never a key. A deploy costs ~0.00004 ETH and a mint far less, so a claim or
two lasts a long time.

Most faucets (QuickNode, Alchemy) want 0.001 *mainnet* ETH on the address as a bot filter, and
Coinbase's needs an account. If ZalalenA is down, the fallback is the
[pk910 Sepolia PoW faucet](https://sepolia-faucet.pk910.de/): mine Ethereum Sepolia ETH in the
browser (address only), then bridge it to Base Sepolia through Base's L1StandardBridge on Sepolia
(verified on-chain, v2.8.0):

```bash
cast send 0xfd0Bf71F60660E2f608ed56e1659C450eB113120 "depositETH(uint32,bytes)" 200000 0x \
  --value 0.04ether --account deployer --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

Check a balance with `cast balance <address> --rpc-url https://sepolia.base.org --ether`.

### Deployments

| network | Moments | pieces |
|---|---|---|
| Base Sepolia (84532) | [`0x7EA0DCcC87830Da0d20e4B1aCAdD7B4D6D1007Dc`](https://sepolia.basescan.org/address/0x7EA0DCcC87830Da0d20e4B1aCAdD7B4D6D1007Dc) | 1 · reaction ([dnuke.art/vr-gallery](https://dnuke.art/vr-gallery/?work=reaction)) |

The deploy record is `contracts/broadcast/Deploy.s.sol/84532/run-latest.json`.

## Viewer URL

| param | |
|---|---|
| `?project=<url>` | the gallery file (resolved against the page) |
| `?work=<id>` | open standing in front of that work with its story showing. Clicking a work updates this, so any view is a link |
| `&hash=0x…&step=<n>` | for a live work: replay that moment and hold it |
| `&epoch=<n>` | for a chain-broadcast work: the iteration's epoch, so the moment can still be minted while live |
| `?chrome=0` | hide the title and hint, for a host page that draws its own |

`window.GALLERY` exposes the scene, camera, rig and room for poking from the console.

## Controls

- **Screen:** drag to look, WASD / arrows to walk (shift is faster), click the floor to glide
  there, click a work to stand in front of it and open its story. Esc closes the story.
- **Phone:** the same, by touch. Portrait screens get a wider field of view.
- **Headset:** *Enter VR* appears only when the browser can actually start immersive-vr. Point
  and pull the trigger: at the floor to teleport, at a work to float its story in front of
  you, at the story to close it. Thumbstick left/right snap-turns 30°.

A headset needs HTTPS (or localhost). For a Quest on USB: `adb reverse tcp:8080 tcp:8080`, then
open `http://localhost:8080/…` in the Quest browser. Otherwise use a tunnel or deploy.

## Embedding in a site

Same pattern as voxeled: vendor the viewer into the site and point an iframe at a gallery file.

```bash
make vendor DEST=../../dnewcome/dnuke.art/vr-gallery/engine   # replaces DEST: keep it its own folder
```

```html
<iframe src="/vr-gallery/engine/viewer/?project=/vr-gallery/parameters/gallery.yaml"
        allow="xr-spatial-tracking; fullscreen"></iframe>
```

`allow="xr-spatial-tracking"` is required, or *Enter VR* can't start a session from inside a
frame. To make WASD work without clicking into the frame first, forward keys:
`frame.contentWindow.postMessage({ vrGallery: "key", code: e.code, type: e.type }, "*")`.
The viewer posts `{ vrGallery: "view", query }` whenever the view changes (a work opened, a moment
caught), so the host page can mirror it in its own URL, and a shared link lands on the host page.

[dnuke.art/vr-gallery](https://dnuke.art/vr-gallery/) is the first instance: a demo room hanging works from the Parameters show.

## Layout

```
src/gallery.mjs       the model: normalize a parsed file, validate, auto-hang, viewpoints (pure, tested)
src/seed.mjs          hashes, seeds and the sfc32 PRNG every live piece draws from (pure, tested)
src/yaml.mjs          YAML subset parser (voxeled's, plus block scalars)
viewer/index.html     page shell + styles
viewer/main.mjs       load, wire up, render loop
viewer/room.mjs       room geometry, light pools, framed works, wall labels
viewer/walk.mjs       screen navigation (drag / keys / tap / glide)
viewer/story.mjs      the story as HTML drawer, wall label and headset panel
viewer/xr.mjs         Enter VR, controller rays, teleport, snap turn
viewer/live.mjs       live-piece runner: seeding, stepping, catch / seek / moment
viewer/chain.mjs      JSON-RPC client for Moments: broadcast iterations, mint (wallet or local dev)
contracts/            Foundry project: Moments.sol (ERC-721 moments) + tests
examples/chain/       a broadcast room for the local chain
scripts/dev-chain.sh  anvil + deploy + register a piece (make chain)
examples/demo/        generated works (make-art.mjs is their recipe) + pieces/drift.mjs, live
scripts/serve.mjs     dev server (ROOT=<dir> to serve a site with the viewer vendored in)
scripts/vendor.mjs    copy viewer + src into a site
```

Lighting is deliberately cheap so a standalone headset holds frame rate: one hemisphere light
and a soft additive "light pool" painted behind each work. The works themselves are unlit, so
the colours you see are the file's.

## Next

- More media types: `video`, `model` (glTF, e.g. a wire piece on a plinth), and `voxeled`, a
  live LED piece running in the room.
- `room.model`: a Blender room with baked lighting in place of the procedural box.
- AR: place a work on your own wall (`immersive-ar` + hit-test on Quest/Android; iOS would need
  a Quick Look/USDZ fallback).
- A passkey wallet for minting straight from the headset; a captured image per token (GPU output
  can differ slightly across devices).
- VRChat: a thin Unity/Udon world that plays the same gallery files (images, stories, live pieces
  as Custom Render Textures seeded the same way), with the QR handoff for minting.
- Sources: `rss:` (fetched at build time, since most feeds block browser CORS) and `chain:`
  (tokens read back into the room), converted to the same exhibit shape.
