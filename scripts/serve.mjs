// A dependency-free static server for developing the viewer: serves the repo root, so
//   http://localhost:8080/viewer/?project=/examples/demo/gallery.yaml
// works as-is. ROOT=<dir> serves a site instead (e.g. a site with the viewer vendored into it).
// CORS is open so a gallery on another origin can be loaded while testing.
// A headset on the LAN needs HTTPS for WebXR — see README (adb reverse, or a tunnel).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.env.ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const PORT = +(process.env.PORT || 8080);
const TYPES = { ".html": "text/html", ".css": "text/css", ".ico": "image/x-icon", ".woff2": "font/woff2", ".gif": "image/gif", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".yaml": "text/yaml", ".yml": "text/yaml",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".mp4": "video/mp4" };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(process.env.ROOT ? `serving ${ROOT} → http://localhost:${PORT}/` : `vr-gallery → http://localhost:${PORT}/viewer/?project=/examples/demo/gallery.yaml`));
