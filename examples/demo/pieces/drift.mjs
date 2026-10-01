// Drift, live — the demo's simplest live piece: a stateless shader. Each frame is a pure
// function of (hash, step), so seeking is instant and any step can be rendered directly.
// Everything the hash decides is chosen once, up front, from rand(): four phases, a palette
// from a small set, and — 1 time in 20 — an inverted "night" variant. That last one is how
// rarity works in generative art: a branch on rand() that's rare by construction.
export const meta = { name: "drift", version: "1", steps: 1800, stepsPerFrame: 1, hold: 4 };
export const params = { lines: 70, amp: 0.045, width: 1500, height: 900 };

const PALETTES = [["#f3f1ec", "#2f5d8a"], ["#f6efe4", "#c2412d"], ["#e9e4d8", "#1b1b1f"], ["#eef2ea", "#3d6b4f"]];

export function create({ THREE, renderer, rand, params: p }) {
  const phases = [rand(), rand(), rand(), rand()].map((v) => v * 6.283);
  let [paper, ink] = PALETTES[Math.floor(rand() * PALETTES.length)];
  const night = rand() < 0.05;
  if (night) [paper, ink] = [ink, paper];

  const W = 1024, H = Math.round((1024 * p.height) / p.width);
  const out = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      t: { value: 0 }, lines: { value: p.lines }, amp: { value: p.amp }, H: { value: 0 },
      ph: { value: new THREE.Vector4(...phases) },
      paper: { value: new THREE.Color(paper) }, ink: { value: new THREE.Color(ink) },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float t, lines, amp, H; uniform vec4 ph; uniform vec3 paper, ink;
      void main() {
        float u = vUv.x, v = 1.0 - vUv.y, m = 1.0;
        // lines swing up to ~3 spacings, so test the neighbours and keep the nearest
        for (int i = -4; i <= 4; i++) {
          float k = floor(v * lines) + float(i), kk = k / lines;
          float d = amp * sin(u * 7.0 + ph.x + kk * 3.0 + t * 0.6) * sin(kk * 3.1 + ph.y + t * 0.25)
                  + amp * 0.5 * sin(u * 17.0 + ph.z * kk - t * 0.9);
          m = min(m, abs(v - ((k + 0.5) / lines + d)));
        }
        gl_FragColor = vec4(mix(ink, paper, smoothstep(0.7, 1.5, m * H)), 1.0);
      }`,
  });
  mat.uniforms.H.value = H;
  const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let step = 0;
  return {
    texture: out.texture,
    aspect: H / W,
    traits: { palette: `${paper}/${ink}`, night },
    step() { step++; },
    render() {
      mat.uniforms.t.value = step / 60;
      renderer.setRenderTarget(out);
      renderer.render(scene, cam);
    },
    dispose() { out.dispose(); mat.dispose(); },
  };
}
