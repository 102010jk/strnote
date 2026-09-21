# CLAUDE.md

Statický three.js web pro GitHub Pages **a zároveň základ mobilní aplikace**
(Android + iOS přes Capacitor). Struktura a spouštění: [README.md](README.md),
mobil: [docs/mobile.md](docs/mobile.md).

## Pravidla

### Changelog po každém commitu
Po každém commitu přidej záznam do `CHANGELOG.md`. Krátce a lidsky – co je nového
z pohledu toho, kdo se na web dívá. Žádný výpis souborů, žádné technické detaily.

### Verzování
SemVer. Číslo drž stejné na třech místech: `CHANGELOG.md`, `package.json`
a `src/version.js`. To poslední se ukazuje na webu vedle názvu a service
worker podle něj čistí offline cache – bez změny tam uživatelé nové soubory
dostanou, ale stará cache se nesmaže.

- **patch** – oprava, drobnost; i malá nová věc, jako štítek s číslem verze
- **minor** – nová funkce nebo nová scéna
- **major** – změna toho, co ten web vlastně je

### Technický dokument u velkých věcí
Když přibude něco velkého (nový systém, postprocessing, načítání modelů, fyzika),
napiš k tomu `docs/<téma>.md` – tam už klidně technicky: jak to funguje, proč takhle,
na co si dát pozor. V changelogu na to stačí jednořádkový odkaz.

### Web bez buildu, aplikace s buildem
Web na Pages musí zůstat bez build kroku – platí „commitni a je to nasazené",
takže do něj nepřidávat bundler ani runtime závislosti.

Nativní appka má vlastní pipeline: `npm run bundle` vyrobí `www/` se staženým
three.js. Tam build krok patří a je to v pořádku. `www/` se needituje ručně.

### Co nedělat bez vyžádání
- Verze three.js se mění jen na jednom místě: v importmapě v `index.html`.
  `npm run bundle` si ji odtamtud přečte sám.
- Nesahat na `.github/workflows/deploy.yml`, pokud nasazení funguje.
- Neměnit `appId` v `capacitor.config.json` po prvním vydání do obchodu.
