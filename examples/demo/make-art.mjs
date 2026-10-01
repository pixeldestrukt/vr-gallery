// Generates the demo room's art — deterministic SVGs from a seed and a few parameters, so every
// work's `story.process` in gallery.yaml is the literal recipe. Re-run after changing a PIECES
// entry: `node examples/demo/make-art.mjs`
import { writeFileSync } from "node:fs";

export const PIECES = {
  truchet: { seed: 11, cells: 14, w: 900, h: 1200, ink: "#1b1b1f", paper: "#e9e4d8" },
  lissajous: { seed: 3, a: 5, b: 4, phase: 0.6, strands: 40, w: 1200, h: 1200, ink: "#f2c14e", paper: "#14161c" },
  drift: { seed: 29, lines: 70, amp: 38, w: 1500, h: 900, ink: "#2f5d8a", paper: "#f3f1ec" },
  decay: { seed: 5, grid: 18, keep: 0.62, w: 1000, h: 1000, ink: "#c2412d", paper: "#f6efe4" },
  moire: { seed: 8, rings: 60, offset: 70, w: 1100, h: 1400, ink: "#101010", paper: "#dcdad4" },
};

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => +n.toFixed(1);
const svg = ({ w, h, paper }, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${paper}"/>${body}</svg>\n`;

const DRAW = {
  truchet(p, rnd) {
    const s = p.w / p.cells, rows = Math.ceil(p.h / s);
    let d = "";
    for (let j = 0; j < rows; j++) for (let i = 0; i < p.cells; i++) {
      const x = i * s, y = j * s, r = s / 2;
      d += rnd() < 0.5
        ? `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + r)}M${f(x + s)} ${f(y + r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + r)} ${f(y + s)}`
        : `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 0 0 ${f(x + s)} ${f(y + r)}M${f(x)} ${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y + s)}`;
    }
    return `<path d="${d}" fill="none" stroke="${p.ink}" stroke-width="${f(s / 7)}" stroke-linecap="round"/>`;
  },
  lissajous(p, rnd) {
    let out = "";
    for (let k = 0; k < p.strands; k++) {
      const ph = p.phase + k * 0.018, sc = 0.42 - k * 0.004 + rnd() * 0.004;
      let d = "";
      for (let t = 0; t <= 2 * Math.PI + 1e-9; t += Math.PI / 360) {
        const x = p.w / 2 + p.w * sc * Math.sin(p.a * t + ph), y = p.h / 2 + p.h * sc * Math.sin(p.b * t);
        d += (d ? "L" : "M") + f(x) + " " + f(y);
      }
      out += `<path d="${d}" fill="none" stroke="${p.ink}" stroke-opacity="${f(0.15 + 0.6 * (1 - k / p.strands) * 10) / 10}" stroke-width="1.2"/>`;
    }
    return out;
  },
  drift(p, rnd) {
    let out = "";
    const phases = Array.from({ length: 4 }, () => rnd() * 6.28);
    for (let k = 0; k < p.lines; k++) {
      const y0 = (p.h * (k + 0.5)) / p.lines;
      let d = "";
      for (let x = 0; x <= p.w; x += 10) {
        const u = x / p.w, v = k / p.lines;
        const y = y0 + p.amp * Math.sin(u * 7 + phases[0] + v * 3) * Math.sin(v * 3.1 + phases[1]) + (p.amp / 2) * Math.sin(u * 17 + phases[2] * v);
        d += (d ? "L" : "M") + x + " " + f(y);
      }
      out += `<path d="${d}" fill="none" stroke="${p.ink}" stroke-width="1.6"/>`;
    }
    return out;
  },
  decay(p, rnd) {
    const s = p.w / p.grid;
    let out = "";
    for (let j = 0; j < p.grid; j++) for (let i = 0; i < p.grid; i++) {
      const fall = j / (p.grid - 1); // survival drops down the sheet
      if (rnd() > p.keep * (1 - fall) + (1 - p.keep) * (1 - fall) ** 3) continue;
      const jit = fall * s * 0.35, rot = (rnd() - 0.5) * 90 * fall;
      const x = i * s + s / 2 + (rnd() - 0.5) * jit, y = j * s + s / 2 + (rnd() - 0.5) * jit;
      out += `<rect x="${f(x - s * 0.36)}" y="${f(y - s * 0.36)}" width="${f(s * 0.72)}" height="${f(s * 0.72)}" fill="${p.ink}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`;
    }
    return out;
  },
  moire(p, rnd) {
    const rings = (cx, cy) => Array.from({ length: p.rings }, (_, k) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(8 + k * 11)}"/>`).join("");
    const cx = p.w / 2, cy = p.h / 2, a = rnd() * 6.28;
    return `<g fill="none" stroke="${p.ink}" stroke-width="3.2">${rings(cx, cy)}${rings(cx + p.offset * Math.cos(a), cy + p.offset * Math.sin(a))}</g>`;
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, p] of Object.entries(PIECES)) {
    writeFileSync(new URL(`art/${name}.svg`, import.meta.url), svg(p, DRAW[name](p, mulberry32(p.seed))));
    console.log(`✓ art/${name}.svg`);
  }
}
