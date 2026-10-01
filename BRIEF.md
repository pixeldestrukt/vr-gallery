## vr-gallery — kickoff brief
- **Problem:** Unity is too heavy for showing digital art; I want a light web engine
  where every piece carries its story (params, seed, source, process), viewable in a
  browser and in a headset.
- **Done looks like:** dnuke.art/<room>/ loads one room from a YAML file with ~5 Parameters
  pieces on the walls; walk it on desktop, press "Enter VR" on a Quest; clicking a piece
  shows its story panel.
- **Not now:** NFT/minting and wallets, AR placement, multi-user, upload/CMS, Curiate
  integration (at most a "buy" link to the existing listing). The data format should
  leave room for a provenance/token field later.
- **First slice:** the engine's YAML schema (room + exhibit + story) and a viewer that
  renders one baked room with image exhibits, vendored into dnuke.art the same way as voxeled.
- **Open question:** what the Parameters pieces actually are (stills, video, live
  generative, LED/voxel), because that decides the exhibit types and the Quest
  performance budget.

### Shape (mirrors voxeled)
- **Engine:** `pixeldestrukt/vr-gallery` — generic, MIT, knows nothing about any one artist.
- **Instance:** a folder on dnuke.art (public `gallery.yaml` + assets), embedded via the
  vendored viewer: `<iframe src="/vr-gallery/viewer/?project=/parameters/gallery.yaml">`.
