# Roj: jak to utáhne 100 000 těles

> **Roj ve scéně už není.** Od verze 1.7.1 je tam replika sluneční soustavy
> (docs/slunecni-soustava.md); stav s rojem je uložený v tagu `v1.7.0`.
> Principy popsané níž – instancing, záře počítaná v shaderu, ochrana proti
> blikání, výběr kliknutím, nekonečný zoom – ale platí dál a soustava na nich
> stojí.

Slider „Počet těles" jde na 100 000. Naivní řešení – 100 000× `new THREE.Mesh()` –
by znamenalo 100 000 draw callů na snímek a prohlížeč by se zastavil. Tady je,
co se místo toho dělá.

## Dvě kreslení místo sta tisíc objektů

Celý roj jsou **dva** instancované meshe:

- `cores` – koule, tvrdé jádro tělesa
- `halos` – placka natočená k obrazovce, na ní se počítá záře

> **Pozor na čísla z verzí 1.3.0 až 1.4.1:** v té době se jádra těles vůbec
> nekreslila (viz „Chyba, která schovala jádra" níž), takže měření jim
> nepřičítala nic. Při 100 000 tělesech to skoro nevadí – tam převažuje halo
> a jádra mají 6×4 segmentů; přeměřeno s opravou vychází planety na 7,55 ms.
> Při malých počtech s vysokým detailem to ale zkreslovalo hodně, viz níž.

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
| `aKind` (float) | hvězda, nebo materiál planety | při změně typu oběhu |
| `aLight` (vec3) | poloha hvězdy, která planetu osvětluje | každý snímek, jen v režimu planet |
| `aLightColor` (vec3) | barva té hvězdy | při změně barev |

Planety a jejich osvětlení podrobně: [planety.md](planety.md).

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

Každá úroveň má **vlastní předem postavenou instancovanou geometrii** a přepnutí
je jen výměna `cores.geometry`. Nic se při tom nealokuje ani neuvolňuje.

Detail stojí, i když méně, než by se čekalo. Při 1000 tělesech:

| Detail | trojúhelníků | ms/snímek |
|---|---|---|
| 12 × 8 | 170 000 | 0,25–0,28 |
| 48 × 32 | 2 980 000 | 0,67–0,72 |

Plný detail je tedy asi 2,6× dražší, ale pořád jen ~4 % rozpočtu na 60 fps.

## Chyba, která schovala jádra (1.3.0 – 1.4.1)

Tohle stojí za zapamatování, protože se to dá snadno udělat znovu.

`_instanced()` původně dělal `geometry.attributes = source.attributes`. To
**nekopíruje** – obě geometrie pak sdílejí tentýž objekt a `setAttribute`
zapíše instanční atributy i do zdroje. Při startu pak `_setDetail()` přiřadil
jádrům atributy čerstvé koule, které `aOffset`, `aTint` ani `aSize` neměly.

Shader dostal pro chybějící atributy výchozí nuly: všechna jádra se sesypala
do počátku s nulovou velikostí a černou barvou. Nebylo to poznat, protože halo
má vlastní vypočtené jádro a to vypadalo jako celá hvězda. Ověřeno schováním
hala – střed obrazovky byl `(0, 0, 1)`, po opravě `(222, 227, 234)`.

Vedlejší škody, teď opravené:

- **Měření lhala.** Degenerované trojúhelníky s nulovou plochou GPU zahodí
  skoro bez práce, takže „3 miliony trojúhelníků stojí stejně jako 170 tisíc"
  byl artefakt chyby, ne vlastnost scény.
- **„Oprava" úniku bufferů nic nedělala.** Uvolňovala se zdrojová geometrie,
  jenže ta se nikdy nekreslila, takže na GPU nic neměla. Skutečně pustit buffer
  jde v three.js jen přes `dispose()` geometrie, která se kreslila.

Oprava: `_instanced()` přidává atributy jednotlivě přes `setAttribute`
a detail se přepíná výměnou celé geometrie, ne jejích atributů.

## Počet těles bez horní hranice

Posuvník jde do 100 000, ale do políčka se dá napsat cokoliv. Když číslo
přesáhne kapacitu, `_setCapacity()` ji zvětší:

1. naalokuje nová pole **bokem** a přiřadí je, až když se povedou všechna,
2. přepočítá dráhy a barvy pro novou kapacitu,
3. vytvoří nové instanční atributy a nové geometrie,
4. staré geometrie uvolní přes `dispose()` – to smaže i jejich buffery na GPU.

Roste se po skocích aspoň 1,5×, ať se při psaní čísla nealokuje pořád dokola.
Kapacita jen roste, nikdy neklesá.

Když na to prohlížeči nestačí paměť, `Float32Array` hodí `RangeError`; ten se
chytí, stará kapacita zůstane a scéna jede dál s tolika tělesy, kolik se vešlo.
Políčko pak ukáže skutečný počet. Ověřeno: `1e10` těles se nevejde
(„Invalid typed array length"), scéna zůstala na 250 000 bez pádu.

Ověřeno taky, že se staré buffery opravdu uvolňují: počet geometrií na GPU
zůstal na 4 přes tři zvětšení kapacity až na 900 000.

Při velkých číslech počítej s tím, že se to začne vléct – každé zvětšení
znamená jednorázový přepočet (250 000 těles ~80 ms) a sto tisíc těles už
bere půlku rozpočtu na snímek. Horní hranice tam záměrně není; je to test.

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

Práh je výchozí **1,3**, tedy nad 1. Dává to smysl, protože scéna se kreslí
v HDR a plná jádra jdou až na jas 1,8. Dokud se jádra kvůli chybě nekreslila,
stačilo 0,55; s viditelnými jádry dělal takový práh z každé jasné hvězdy
hranatou skvrnu. Při 0,9 byly čtverce pořád vidět, při 1,3 zmizely.

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

### Jádra blikají jinak než halo

Tohle se objevilo až v 1.5.0, kdy se jádra zase začala kreslit (předtím je
schovávala chyba popsaná níž). Jádro pod pixel bliká stejně jako halo, jen hůř:
je nad prahem bloomu a ten každé problesknutí rozmaže do velké skvrny.

Postup z hala – zvětšit a ztlumit – tady **nefunguje**, a to je poučné. Jádro
je neprůhledné a zapisuje hloubku, takže ztlumené tmavé kolečko zakryje záři
své hvězdy i sousedních. Naměřeno na 60 000 tělesech zdálky: blikání sice
kleslo, ale jas scény spadl z 92 na 28 (minimum 1,5 px) a na 3 (minimum 3 px).
Galaxie prostě zhasla pod tmavými kolečky.

Správné řešení je jádro, které se na obrazovce nedá spolehlivě vykreslit,
**nekreslit vůbec** (nulová velikost ve vertex shaderu = žádné pixely). Hvězdu
pak zastoupí halo, které má vlastní jasný střed a je proti blikání ošetřené.
Jádro se ukáže až tam, kde je opravdu rozlišitelné.

Změna jednoho pixelu mezi snímky při podpixelových posunech kamery,
60 000 těles, pohled zdálky:

| Stav | Změna na pixel | Jas scény |
|---|---|---|
| bez jader (ideál) | 0,051 | 92 |
| 1.5.0 – jádra vždy | 0,501 | 100 |
| jádra ztlumená, min 1,5 px | 0,180 | 28 |
| **jádra od 1,5 px, jinak žádná** | **0,051** | **92** |

Hranice je poloměr 1,5 px; mezi 0,75 a 3 px nebyl měřitelný rozdíl. Zblízka
se jádra kreslí normálně.

Metrika je tady jiná než u hala a je lepší: kolísání *součtu* jasu přes výřez
dokáže problesknutí jedné hvězdy a zhasnutí jiné navzájem vyrušit, oko ale
vidí obojí. Průměrná změna jednoho pixelu mezi snímky to nezamaskuje.

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

### Kliknutí na těleso

Kliknutí (stisk a puštění do 6 px a 400 ms – delší pohyb je otáčení kamerou)
vybere těleso pod kurzorem, kamera k němu za 1,2 s přeletí a pak ho sleduje.
`Esc`, „Reset" nebo přepnutí kamery na střed sledování ukončí.

**Výběr** nejde přes `Raycaster` – o poloze těles ví jen shader (`aOffset`).
`MainScene.pick()` proto promítne polohy z `_px/_py/_pz` na obrazovku: když je
kurzor na kouli tělesa, vyhraje z takových to nejbližší kameře, jinak nejbližší
těleso do 12 px (dvoupixelovou hvězdu by jinak nikdo netrefil). Stojí to
0,09 ms při 1000 tělesech a 0,69 ms při 100 000 – jen při kliknutí.

**Přelet** prolíná střed otáčení lineárně a odstup kamery **logaritmicky**:
přelet z celé galaxie k planetě jde přes několik řádů a lineárně by se kamera
přiblížila až na samém konci. Odstup na konci je 7 poloměrů u planety
(zabere asi třetinu obrazovky) a 30 poloměrů u hvězdy (je vidět soustava).

**Sledování** je čistý posun kamery i středu o tolik, o kolik se těleso
pohnulo, takže natočení a odstup, které si člověk nastaví, zůstávají.
Musí běžet **až po aktualizaci scény** – polohy se počítají v ní, a dřív by
kamera sledovala polohu z minulého snímku. Ověřeno: po přeletu je planeta
přesně uprostřed obrazovky (0 px) a drží tam i po 7 s, kdy urazila přes
20 jednotek.

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
