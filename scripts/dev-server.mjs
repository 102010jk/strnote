// Statický dev server bez jediné závislosti: `npm run dev`
// Slouží soubory z kořene projektu se správnými MIME typy a bez cache.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 5174);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.ktx2': 'image/ktx2',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://localhost');
  const decoded = decodeURIComponent(pathname);
  const target = resolve(ROOT, '.' + decoded);

  // ven z kořene projektu se nikdo nedostane
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;

  return decoded.endsWith('/') ? join(target, 'index.html') : target;
}

const server = createServer(async (req, res) => {
  let filePath = resolvePath(req.url ?? '/');

  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }

    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 – ' + req.url);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`strnote → http://${HOST}:${PORT}`);
});
