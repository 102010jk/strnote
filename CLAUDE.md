# CLAUDE.md

Statický three.js web pro GitHub Pages. **Repozitář je ten web** – žádný build krok,
žádné npm závislosti. Struktura a spouštění: [README.md](README.md).

## Pravidla

### Changelog po každém commitu
Po každém commitu přidej záznam do `CHANGELOG.md`. Krátce a lidsky – co je nového
z pohledu toho, kdo se na web dívá. Žádný výpis souborů, žádné technické detaily.

### Verzování
SemVer, začínáme na `1.0.0`. Číslo drž stejné v `CHANGELOG.md` i `package.json`.

- **patch** – oprava, drobnost
- **minor** – nová funkce nebo nová scéna
- **major** – změna toho, co ten web vlastně je

### Technický dokument u velkých věcí
Když přibude něco velkého (nový systém, postprocessing, načítání modelů, fyzika),
napiš k tomu `docs/<téma>.md` – tam už klidně technicky: jak to funguje, proč takhle,
na co si dát pozor. V changelogu na to stačí jednořádkový odkaz.

### Co nedělat bez vyžádání
- Nepřidávat bundler ani npm balíčky – musí platit „commitni a je to nasazené".
- Verze three.js se mění jen na jednom místě: v importmapě v `index.html`.
- Nesahat na `.github/workflows/deploy.yml`, pokud nasazení funguje.
