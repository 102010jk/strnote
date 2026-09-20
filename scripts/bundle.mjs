// Připraví složku `www/` pro nativní obal (Capacitor): zkopíruje web a stáhne
// three.js z CDN k sobě, protože aplikace v obchodě nesmí tahat spustitelný kód
// ze sítě (App Store 2.5.2) a hlavně musí fungovat bez internetu.
//
// Web na GitHub Pages tímhle neprochází – ten zůstává bez buildu.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'www');
const VENDOR = join(OUT, 'vendor');

const COPY = ['index.html', 'manifest.webmanifest', 'styles', 'src', 'icons'];

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const threeUrl = readImportMapEntry(html, 'three');
const addonsUrl = readImportMapEntry(html, 'three/addons/');
const packageBase = threeUrl.slice(0, threeUrl.indexOf('/build/') + 1);

console.log(`three.js: ${packageBase}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });

for (const entry of COPY) {
  cpSync(join(ROOT, entry), join(OUT, entry), { recursive: true });
}

// odkud začít procházet: samotné jádro + každý addon, který si projekt importuje
const queue = [threeUrl];
for (const specifier of await collectAddonSpecifiers(join(ROOT, 'src'))) {
  queue.push(addonsUrl + specifier.slice('three/addons/'.length));
}

const seen = new Set();
let bytes = 0;

while (queue.length > 0) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);

  const code = await response.text();
  bytes += code.length;

  const target = join(VENDOR, url.slice(packageBase.length));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);

  for (const specifier of findSpecifiers(code)) {
    if (specifier === 'three') continue; // vyřeší importmapa
    if (specifier.startsWith('three/addons/')) {
      queue.push(addonsUrl + specifier.slice('three/addons/'.length));
    } else if (specifier.startsWith('.')) {
      queue.push(new URL(specifier, url).href);
    } else {
      console.warn(`  ! neznámý import "${specifier}" v ${url}`);
    }
  }
}

// importmapa v balíku ukazuje na lokální soubory, ne na CDN
const localHtml = html
  .replace(threeUrl, './vendor/' + threeUrl.slice(packageBase.length))
  .replace(addonsUrl, './vendor/' + addonsUrl.slice(packageBase.length))
  .replace('<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>', '');

writeFileSync(join(OUT, 'index.html'), localHtml);

console.log(`www/ hotovo – ${seen.size} modulů three.js (${(bytes / 1024).toFixed(0)} kB)`);

function readImportMapEntry(source, key) {
  const marker = `"${key}": "`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`v index.html chybí importmapa pro "${key}"`);

  const from = start + marker.length;
  return source.slice(from, source.indexOf('"', from));
}

/** Najde textem, co se odkud importuje. Na tenhle projekt to stačí, parser netřeba. */
function findSpecifiers(code) {
  const found = new Set();
  const markers = ["from '", 'from "', "import '", 'import "', "import('", 'import("'];

  for (const marker of markers) {
    const quote = marker[marker.length - 1];
    let at = 0;

    while ((at = code.indexOf(marker, at)) !== -1) {
      const start = at + marker.length;
      const end = code.indexOf(quote, start);
      if (end === -1) break;

      found.add(code.slice(start, end));
      at = end;
    }
  }

  return found;
}

async function collectAddonSpecifiers(directory) {
  const { readdir } = await import('node:fs/promises');
  const found = new Set();

  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const code = await readFile(join(entry.parentPath ?? entry.path, entry.name), 'utf8');
    for (const specifier of findSpecifiers(code)) {
      if (specifier.startsWith('three/addons/')) found.add(specifier);
    }
  }

  return found;
}
