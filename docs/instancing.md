# Roj: jak to utáhne 100 000 těles

Slider „Počet těles" jde na 100 000. Naivní řešení – 100 000× `new THREE.Mesh()` –
by znamenalo 100 000 draw callů na snímek a prohlížeč by se zastavil. Tady je,
co se místo toho dělá.

## Dvě kreslení místo sta tisíc objektů

Celý roj jsou **dva** instancované meshe:

- `cores` – koule, tvrdé jádro tělesa
- `halos` – placka natočená k obrazovce, na ní se počítá záře

Naměřeno (desktop, 1622×914, disk, kamera nad rovinou):

| Počet těles | ms/snímek | fps | draw cally |
|---|---|---|---|
| 10 000 | 0,89 | 1119 | 16 |
| 50 000 | 3,25 | 308 | 16 |
| 100 000 | 5,98 | 167 | 16 |

Draw cally jsou roj (2) + podlaha + průchody bloomu. **S počtem těles nerostou.**
Při 60 fps je rozpočet 16,6 ms na snímek, takže 100 000 těles zabere zhruba třetinu.

Oddálení výkon nemění: 100 000 těles ze vzdálenosti 6 000 jednotek běží na 6,19 ms.

## Instance nesou jen pozici

`THREE.InstancedMesh` posílá na každou instanci celou matici 4×4, tedy 16 floatů.
Tady stačí pozice, protože měřítko je pro všechna tělesa stejné a jde do shaderu
jako uniform. Proto se místo `InstancedMesh` používá `InstancedBufferGeometry`
s vlastním atributem `aOffset` (vec3).

Rozdíl při 100 000 tělesech: **1,2 MB místo 6,4 MB** nahrávaných na GPU každý
snímek. Oba meshe navíc sdílejí tentýž atribut, takže se počítá i nahrává jednou.

Nahrává se jen část, která se opravdu kreslí (`addUpdateRange`), takže při
jednom tělese neputuje na GPU buffer pro sto tisíc.

## Detail geometrie klesá s počtem

| Počet těles | segmenty koule |
|---|---|
| ≤ 32 | 48 × 32 |
| ≤ 256 | 24 × 16 |
| ≤ 2 000 | 12 × 8 |
| ≤ 20 000 | 8 × 6 |
| výš | 6 × 4 |

Při sto tisících je těleso pár pixelů velké, šest segmentů nikdo nepozná.
Mění se jen `attributes` a `index` instancované geometrie; stará se hned potom
uvolní, jinak by její buffery zůstaly viset na GPU.

## Záře se počítá, nekreslí se z obrázku

Dřív to bylo PNG s radiálním přechodem natažené na placku. To má dvě vady:
při přiblížení je vidět rozmazaná textura a spád světla je daný obrázkem,
ne výpočtem. Teď se intenzita počítá ve fragment shaderu pro každý pixel.

Tři režimy:

- **Měkká** – gaussovský spád, `exp(-r²·34)`
- **Fyzikální** – ubývání s druhou mocninou vzdálenosti, `1/(1 + 520·r²)`;
  dlouhý doběh, nejblíž tomu, jak se světlo chová doopravdy
- **Hvězda** – spád plus difrakční paprsky, jaké dělá clona objektivu

Placka se natáčí k obrazovce ve vertex shaderu, ne na procesoru – při sto
tisících tělesech by to jinak bylo sto tisíc quaternionových operací za snímek.

Míchání je nastavené na `CustomBlending` se `OneFactor` na obou stranách, tedy
čistý součet barev nezávislý na alfě. Překrývající se záře se tak sčítají
a nezáleží na pořadí kreslení.

### Pozor: hranatá záře není z tohohle shaderu

Když kolem hvězdy vidíš měkký čtverec, dělá ho `UnrealBloomPass` – jeho rozostření
přes mip mapy je při velkém poloměru hranaté. Vlastní záře je dokonale kulatá
(ověřeno s vypnutým bloomem). Řeší se to nižším „Rozptylem záře" a vyšším
„Prahem záře", aby bloom chytal jen horké jádro; zbytek doběhu dělá shader.
Výchozí hodnoty jsou nastavené takhle.

## Blikání při oddálení

Když se hvězda zmenší pod pixel, rasterizér ji podle pohybu kamery náhodně
trefuje a míjí – roj bliká. Řešením je nenechat ji zmenšit pod určitou velikost
a místo toho jí ubrat jas úměrně ploše, takže celkové množství světla zůstane.

Hranice platí pro celou placku, ne pro jasné jádro, které je zhruba její šestina.
Proto vyšla mnohem výš, než se čekalo. Naměřené kolísání jasu při podpixelových
pohybech kamery, 60 000 těles:

| Minimum placky | Kolísání jasu |
|---|---|
| 2 px | 0,68 % |
| 5 px | 0,05 % |
| 10 px | 0,04 % |
| 16 px | 0,01 % |

Nastaveno na **10 px**. Výš už jen ubírá jas a rozmazává, níž se blikání vrací.
Výkon to nestojí nic měřitelného.

## Typy oběhu

Každé těleso má rovinu oběhu jako dvojici kolmých jednotkových vektorů `u`, `v`,
k tomu poloměr, fázi, úhlovou rychlost a **rodiče**, kolem kterého obíhá
(−1 = střed scény). Poloha pak vyjde z `rodič + u·cos(a) + v·sin(a)`.

- **Koule** – směry rozmístěné Fibonacciho spirálou, poloměr přes třetí odmocninu
  indexu, takže se koule plní rovnoměrně v objemu, ne jen po povrchu.
  Těleso s indexem 0 má poloměr 0, proto při „Počet = 1" sedí přesně uprostřed.
- **Disk** – `u` i `v` leží v rovině y = 0, poloměr přes druhou odmocninu
  (rovnoměrné plnění plochy). Všechno obíhá v jedné rovině.
- **Hierarchie** – první čtyři promile těles jsou „hvězdy" obíhající střed,
  zbytek si vybere jako rodiče nějaké dřívější těleso. Volba je vážená druhou
  mocninou náhody, takže padá spíš na nižší indexy, tedy na tělesa blíž ke středu.
  Poloměr klesá s hloubkou zanoření (0,45× na úroveň) – vznikají soustavy
  planet a měsíců.

Rodič má vždycky nižší index než potomek, takže jeden průchod polem stačí
a nic se nemusí řadit. Rozmístění je deterministické (mulberry32 s pevným
semínkem), roj je po každém načtení stejný.

Úhlová rychlost je `1/√r` s omezením nahoru – bližší tělesa obíhají rychleji,
jako v gravitaci. Odtud ty viditelné slupky.

## Proč tělesa nejsou opravdová světla

Každé těleso vypadá jako zdroj světla, ale svítí jen **jedno** skutečné
`PointLight` uprostřed. WebGL zvládne řádově jednotky až desítky světel, každé
navíc přepisuje shader a zdražuje každý fragment. Sto tisíc jich nepřipadá
v úvahu v žádném enginu.

Záře je proto vizuální efekt. Až bude potřeba, aby roj opravdu osvětloval okolí,
cesta vede přes light probes nebo předpočítanou světelnou texturu, ne přes
víc `PointLight`.

## Nekonečný zoom

`OrbitControls` mají zrušené `minDistance`/`maxDistance`. Protože přibližují
násobením, je chování exponenciální – zoom je stejně rychlý u milimetru
i u kilometru.

Samo o sobě by to nestačilo: s pevnými `near`/`far` by scéna zblízka mizela
a zdálky se ořízla. `App._updateClipping()` proto každý snímek nastavuje roviny
podle odstupu kamery od středu (`near = vzdálenost × 0,002`,
`far = vzdálenost × 4000`) a projekci přepočítá jen při změně nad 10 %.

Ověřeno od vzdálenosti 0,01 po 10 000 000 jednotek.
