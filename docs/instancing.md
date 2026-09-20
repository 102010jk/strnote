# Roj koulí: jak to utáhne 10 000 objektů

Slider „Počet koulí" jde na 10 000. Naivní řešení – 10 000× `new THREE.Mesh()` –
by znamenalo 10 000 draw callů na snímek a prohlížeč by se zastavil. Tady je,
co se místo toho dělá.

## Dva InstancedMeshe místo deseti tisíc objektů

Celý roj jsou **dva** objekty:

- `cores` – `InstancedMesh` s koulí, jádra
- `halos` – `InstancedMesh` s placičkou a radiálním přechodem, záře

Draw cally tím zůstávají konstantní, ať je koulí jedna nebo deset tisíc.
Naměřeno (desktop, 1029×914):

| Počet | ms/snímek | draw cally | trojúhelníky |
|---|---|---|---|
| 1 | 0,59 | 17 | 3 120 |
| 1 000 | 0,42 | 17 | 170 142 |
| 5 000 | 0,75 | 17 | 410 142 |
| 10 000 | 1,29 | 17 | 820 142 |

Těch 17 draw callů je roj (2) + podlaha + průchody bloomu. Číslo neroste s počtem.

## Kapacita se alokuje jednou

Buffery se naalokují na `MAX_ORBS` hned v konstruktoru a slider mění pouze
`InstancedMesh.count`. Při tažení posuvníku se tedy nic nestaví znovu a nealokuje –
jen se kreslí míň instancí. Stojí to ~1,3 MB paměti navíc, i když je koule jedna.

## Detail geometrie klesá s počtem

820 tisíc trojúhelníků při 10 000 koulích vychází z toho, že se koule zjednodušuje:

| Počet koulí | segmenty |
|---|---|
| ≤ 32 | 48 × 32 |
| ≤ 256 | 24 × 16 |
| ≤ 2 000 | 12 × 8 |
| výš | 8 × 6 |

Při deseti tisících je koule pár pixelů velká, osm segmentů nikdo nepozná.
Přepíná se v `_setDetail()` a mění jen `geometry` – instance zůstávají.

## Dráhy se počítají dopředu

Pro každou kouli je jednou spočítaná rovina oběhu jako dvojice kolmých
jednotkových vektorů `u`, `v`, k tomu poloměr, fáze a úhlová rychlost.
Za běhu pak poloha vyjde z `u·cos(a) + v·sin(a)` – dva siny na kouli a nic dalšího.

Směry jsou rozmístěné Fibonacciho spirálou a poloměr jde přes třetí odmocninu
indexu, takže se koule plní rovnoměrně v objemu, ne jen po povrchu. Úhlová
rychlost je `1/√r`, tedy bližší koule obíhají rychleji – vizuálně to vytváří
ty viditelné slupky.

Koule s indexem 0 má poloměr 0. Proto při „Počet = 1" sedí přesně uprostřed
a scéna vypadá jako před rojem.

## Proč nejsou koule opravdová světla

Každá koule vypadá jako zdroj světla, ale svítí jen **jedno** skutečné
`PointLight` uprostřed. WebGL zvládne řádově jednotky až desítky světel, každé
navíc přepisuje shader a zdražuje každý fragment. Deset tisíc jich nepřipadá
v úvahu v žádném enginu.

Záře je proto čistě vizuální: jasné jádro nad prahem bloomu plus additivní halo.
Když bude jednou potřeba, aby roj opravdu osvětloval okolí, cesta je
*light probes* nebo předpočítaná světelná textura, ne víc `PointLight`.

## Nekonečný zoom

`OrbitControls` mají zrušené `minDistance`/`maxDistance`. Protože přibližují
násobením, chování je exponenciální – zoom je stejně rychlý u milimetru
i u kilometru.

Samo o sobě by to nestačilo: s pevnými `near`/`far` by scéna zblízka mizela
a zdálky se ořízla. `App._updateClipping()` proto každý snímek nastavuje
roviny podle odstupu kamery od středu (`near = vzdálenost × 0,002`,
`far = vzdálenost × 4000`) a projekci přepočítá jen při změně nad 10 %,
aby se matice nepřepisovala zbytečně.

Ověřeno od vzdálenosti 0,01 po 10 000 000 jednotek – scéna se vykresluje
stejně, nikde nic neproblikává.
