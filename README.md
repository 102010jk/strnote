# strnote

Roj hvězd v three.js, běží přímo z GitHub Pages. **Žádný build krok, žádné závislosti** –
repozitář *je* ten web, takže cokoliv commitneš do `main`, to se nasadí tak, jak to leží.

🔗 https://102010jk.github.io/strnote/

## Jak to běží lokálně

```bash
npm run dev      # http://127.0.0.1:5174
npm run icons    # přegeneruje ikony aplikace
npm run bundle   # vyrobí www/ pro nativní appku (Android/iOS)
```

`scripts/dev-server.mjs` je statický server napsaný jen na node standardní knihovně
(ES moduly se z `file://` načíst nedají, proto server). Žádné `npm install` není potřeba.

## Struktura

```
index.html              importmap s verzí three.js + HTML overlay
styles/main.css          UI vrstva nad canvasem
src/main.js              vstupní bod: složí App + scénu + HUD
src/core/App.js          renderer, kamera, OrbitControls, resize, smyčka, FPS
src/core/environment.js  procedurální env mapa pro odlesky (bez HDR souboru)
CHANGELOG.md             co přibylo v které verzi
CLAUDE.md                pravidla pro práci v tomhle repu
docs/mobile.md           jak z tohohle udělat appku pro Android a iOS
docs/instancing.md       jak scéna utáhne 100 000 těles, záře v shaderu, nekonečný zoom
src/scenes/MainScene.js  ← obsah scény, tohle je soubor, který se přepisuje
src/ui/Hud.js            napojení sliderů a tlačítek na scénu
.github/workflows/       deploy na Pages při každém pushi do main
```

## Kde co měnit

- **Obsah scény** → `src/scenes/MainScene.js`. Třída dostane `update(delta, elapsed)`
  každý snímek a všechno svoje dává do `this.group`.
- **Verze three.js** → jediná importmapa v `index.html`. Import se pak všude píše
  jako `import * as THREE from 'three'` a addony jako `from 'three/addons/...'`.
- **Vzhled rendereru** (tone mapping, stíny, fog, kamera) → `src/core/App.js`.

Nová scéna vedle stávající:

```js
// src/main.js
import { MojeScena } from './scenes/MojeScena.js';

const scene = new MojeScena();
app.scene.add(scene.group);
app.onUpdate((dt, t) => scene.update(dt, t));
```

## Nasazení

Workflow `.github/workflows/deploy.yml` nahraje celý repozitář na Pages při každém
pushi do `main`. Jednorázově je potřeba v repu nastavit
**Settings → Pages → Source: GitHub Actions**.

(Alternativa bez workflow: *Deploy from a branch → main / (root)*. Funguje taky,
protože v repu není nic ke kompilaci; proto je tu i prázdný soubor `.nojekyll`.)

## Poznámky

- three.js se tahá z jsDelivr CDN. Pokud to má být offline/self-hosted, stáhni
  `three.module.js` a složku `examples/jsm` do `vendor/` a přepiš cesty v importmapě.
- Renderer si sám hlídá ztrátu WebGL kontextu, resize a `devicePixelRatio` stropuje na 2.
- V konzoli je scéna dostupná jako `window.strnote` (`strnote.app`, `strnote.scene`).
