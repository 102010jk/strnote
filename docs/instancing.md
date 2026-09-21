# Roj: jak to utáhne 100 000 těles

Slider „Počet těles" jde na 100 000. Naivní řešení – 100 000× `new THREE.Mesh()` –
by znamenalo 100 000 draw callů na snímek a prohlížeč by se zastavil. Tady je,
co se místo toho dělá.

## Dvě kreslení místo sta tisíc objektů

Celý roj jsou **dva** instancované meshe:

- `cores` – koule, tvrdé jádro tělesa
- `halos` – placka natočená k obrazovce, na ní se počítá záře

Naměřeno (desktop, 1622×914, celý roj v záběru), 100 000 těles ve všech režimech:

| Typ oběhu | ms/snímek | fps | draw cally |
|---|---|---|---|
| Koule | 7,33 | 136 | 16 |
| Disk | 7,46 | 134 | 16 |
| Hierarchie | 8,06 | 124 | 16 |
| Planety | 8,14 | 123 | 16 |

Hierarchie a planety jsou o něco pomalejší kvůli čtení pozice rodiče – skáče se
po paměti a procesoru to kazí cache.

Draw cally jsou roj (2) + podlaha + průchody bloomu. **S počtem těles nerostou.**
Při 60 fps je rozpočet 16,6 ms na snímek, takže 100 000 těles zabere zhruba půlku.

Oddálení výkon nemění – ze vzdálenosti 6 000 jednotek je to stejné.

## Instance nesou jen to, co potřebují

`THREE.InstancedMesh` posílá na každou instanci celou matici 4×4, tedy 16 floatů.
Tady stačí tři atributy, proto se místo něj používá `InstancedBufferGeometry`:

| Atribut | Co nese | Kdy se přepisuje |
|---|---|---|
| `aOffset` (vec3) | poloha | každý snímek |
| `aTint` (vec3) | barva | při změně nastavení |
| `aSize` (float) | měřítko vůči hvězdě | při změně typu oběhu |

Každý snímek tak putuje na GPU jen `aOffset`: při 100 000 tělesech **1,2 MB
místo 6,4 MB**. Oba meshe sdílejí tytéž atributy, takže se počítají i nahrávají
jednou. Nahrává se navíc jen část, která se opravdu kreslí (`addUpdateRange`),
takže při jednom tělese neputuje na GPU buffer pro sto tisíc.

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
- **Disk** – `u` i `v` leží v rovině y = 0, poloměr přes druhou odmocninu
  (rovnoměrné plnění plochy). Všechno obíhá v jedné rovině.
- **Planety** – hvězda dostane 0 až 9 planet, které obíhají ji. Hvězdy jsou
  barevné a plné velikosti, planety šedé a zmenšené na 0,22–0,55 (`aSize`).
  Planet vychází zhruba 82 % všech těles, takže při 100 000 je hvězd asi 18 000.
  Planeta samozřejmě sama nesvítí – že je tmavá, zařídí její šedá barva,
  protože záře se počítá z téhož odstínu.
- **Hierarchie** – první čtyři promile těles jsou „hvězdy" obíhající střed,
  zbytek si vybere jako rodiče nějaké dřívější těleso. Volba je vážená druhou
  mocninou náhody, takže padá spíš na nižší indexy, tedy na tělesa blíž ke středu.
  Poloměr klesá s hloubkou zanoření (0,45× na úroveň) – vznikají soustavy
  planet a měsíců.

**Uprostřed scény nestojí nic.** Dřív tam bylo těleso s nulovým poloměrem;
teď má nejmenší poloměr 0,0171 (koule), takže střed zůstává prázdný.

Rodič má vždycky nižší index než potomek, takže jeden průchod polem stačí
a nic se nemusí řadit. Rozmístění je deterministické (mulberry32 s pevným
semínkem), roj je po každém načtení stejný.

Úhlová rychlost je `1/√r` s omezením nahoru – bližší tělesa obíhají rychleji,
jako v gravitaci. Odtud ty viditelné slupky.

## Barvy

Barva se nebere jedna, ale jako **úsečka mezi dvěma odstíny**. Každé těleso si
na ní vylosuje bod a k němu dostane ještě malé náhodné okolí – nezávisle
v každém kanálu, podle posuvníku „Rozptyl barev". Roj tak není jednobarevný
a zároveň drží zvolenou paletu.

Losování je deterministické (mulberry32 s pevným semínkem), takže posunutí
rozptylu nepřemíchá celý roj, jen rozšíří okolí kolem stejných bodů.

Barvy se přepočítávají při změně obou odstínů, rozptylu i typu oběhu – planety
musí zůstat šedé. Je to průchod přes celou kapacitu, tedy pár milisekund,
ale děje se jen při sáhnutí na ovladač, ne každý snímek.

## Kamera

Dva režimy:

- **Na střed** – `OrbitControls` krouží kolem pevného bodu, posouvat nejde.
- **Odpojená** – zapne se `enablePan`, střed otáčení se dá odtáhnout myší
  a kamera se pohybuje volně. Přepnutím zpět na střed se vrátí do výchozího bodu.

  **Kolečko v odpojeném režimu letí, nepřibližuje.** Zoom v `OrbitControls`
  přibližuje k bodu otáčení násobením, takže se u něj zpomaluje a nikdy jím
  neproletí. Tady se proto zoom vypne (`enableZoom = false`) a kolečko posune
  kameru **i s bodem otáčení** po směru pohledu – vzdálenost mezi nimi zůstává,
  takže se let nezmění v zoom.

  Jedno cvaknutí uletí 15 % vzdálenosti od bodu otáčení, s doběhem jako
  otáčení. Rychlost odvozená od vzdálenosti drží let použitelný v každém
  měřítku, od planety po celou galaxii.

  Doběh se integruje přesně (`v·(1 − e^(−k·dt))/k` na snímek), ne prostým
  `rychlost × delta`. To by při nízkých fps uletělo víc – ověřeno: se
  zjednodušeným krokem vyšlo při 60 fps 3,15 místo 3,0. Teď je to 3,0 při
  30, 60 i 144 fps, takže jedno cvaknutí doletí stejně na telefonu i na počítači.

  Myš posílá ~100 na cvaknutí, touchpad spoustu malých hodnot; obojí se
  převede na „cvaknutí" a omezí na ±3 na událost, aby rychlé točení nevystřelilo
  kameru pryč.

  **Chybí dotykové ovládání letu.** Na telefonu je v odpojeném režimu
  zablokované i sevření prstů (patří k zoomu), takže se nedá letět dopředu.
  Až dojde na mobilní verzi, sevření musí dostat stejný let jako kolečko.

Výpočet `near`/`far` pro nekonečný zoom bere odstup od středu otáčení, takže
funguje v obou režimech stejně.

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
