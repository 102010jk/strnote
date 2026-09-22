# Kam to směřuje

Zápisník / deník, kde zápisky žijí uvnitř těles galaxie – hvězd, souhvězdí,
planet a měsíců. Galaxie není ozdoba, je to rozhraní.

Tenhle dokument drží směr a otevřené otázky mezi sezeními. Není to plán ani
specifikace, spousta věcí se ještě rozhodne.

## Zadání, jak padlo

- Zápisky jsou uvnitř hvězd, souhvězdí, planet a měsíců.
- **Velmi dobré vyhledávání** – bez něj se v tisících svítících koulí nedá
  vyznat. Hledání je hlavní způsob navigace, ne doplněk.
- **Jednoduchý režim** na rychlou editaci, aby zapsat poznámku nebyla výprava
  vesmírem.
- Web na počítači, nativní aplikace na Androidu a iOS (Capacitor).
- Dlouhodobý projekt, na pokračování.

### Vzor ovládání: Universe Sandbox

Klikneš na těleso, vysune se panel s jeho vlastnostmi a dá se v něm rovnou
editovat. Tady bude v panelu místo hmotnosti a poloměru zápisek a poznatky.

Vedlejší efekt, který se hodí: panel s ovládáním scény už takhle funguje,
inspektor bude jeho sourozenec, ne nová vrstva.

### Vzhled těles

Hvězdy i planety mají mít různé podoby, ne jednu.

Důležité je, odkud ta různost poteče: **ze shaderu, ne z geometrie.** Kdyby
mělo každé těleso vlastní model, rozpadne se kreslení na jedno volání a s ním
celá rezerva. Koule může zůstat jedna pro všechny a lišit se:

- **parametry na instanci** – barva a velikost už existují (`aTint`, `aSize`),
  přibude semínko a typ tělesa
- **procedurálním povrchem** ve fragment shaderu z toho semínka – pásy
  plynného obra, kontinenty, krátery. Žádné textury ke stahování, nekonečně
  variant, pořád jedno kreslení.
- **typem záře** u hvězd – teplota barvy, koróna, síla paprsků, tep

Při tisícovce těles je na tohle rozpočet víc než dost (scéna teď bere 2–4 % času na snímek).

### Souhvězdí

Zatím jen pojmenované: zápisky se sdružují do souhvězdí. Kreslení spojnic je
levné (`LineSegments`, jedno volání).

Háček je jinde a zasahuje do otázky 2: členové souhvězdí musí být **blízko
u sebe**, jinak to nejsou souhvězdí. Poloha se tedy nemůže odvodit jen
z identity zápisku – musí vycházet z „kam patří" a teprve uvnitř toho
z identity. Rozmyslet dřív, než se poloha z identity začne stavět.

## Otevřené otázky

Tohle se musí rozhodnout dřív, než se začne stavět obsah.

### 1. Kam se ukládají data

Statický web na Pages umí jen servírovat soubory, nemá kam zapisovat. Deník
potřebuje perzistenci a nejspíš synchronizaci mezi telefonem a počítačem.
Sahá to až do Capacitoru – lokální úložiště na zařízení versus něco v cloudu.
**Zatím nerozhodnuto, nic se tím směrem nestavělo.**

### 2. Čím je určená poloha tělesa

Teď se dráhy počítají z **indexu** v poli. Pro test to stačí, pro deník ne:
zápisek musí být pořád tatáž hvězda, i když se před ním nějaký smaže.

Poloha se proto bude muset odvozovat z **identity zápisku** (hash ID →
dráha), ne z pořadí. Je to malá změna v `_buildOrbits`, ale čím dřív, tím líp –
jinak se rozsype každému všechno pokaždé, když něco smaže.

### 3. Jak se vybírá těleso kliknutím

> **Hotovo v 1.7.0** přesně tímhle postupem, viz „Kliknutí na těleso"
> v docs/instancing.md. Naměřeno 0,09 ms při 1000 tělesech, 0,69 ms při 100 000.

Tohle je jediné místo, kde se architektura roje bude muset ohnout. Běžný
`raycaster` tady **nefunguje**: scéna nepoužívá `InstancedMesh` (ten umí
raycast sám), ale `InstancedBufferGeometry` s vlastním shaderem, kde polohu
nese atribut `aOffset`. Raycaster o něm neví a testoval by jednu kouli
v počátku.

Řešení je naštěstí levné a už na něj máme data: polohy všech těles držíme
každý snímek i na procesoru (`_px`, `_py`, `_pz`). Výběr je pak průchod polem
a hledání nejbližšího zásahu – při 100 000 tělesech jednotky milisekund,
a jen při kliknutí, ne každý snímek.

Praktický detail: netestovat protnutí paprsku s koulí, ale **vzdálenost
na obrazovce**. Hvězda může mít dva pixely a trefit ji paprskem je nemožné;
promítnout tělesa do obrazovky a vzít to s nejmenší vzdáleností od kurzoru
(při shodě to bližší) se chová tak, jak člověk čeká.

Druhá cesta je GPU picking (vykreslit ID do textury a přečíst pixel), ale ta
je pracnější a zdržuje čtením z GPU. Nemá smysl, dokud první stačí.

### 4. Fyzikální dráhy, až na ně dojde

Do budoucna se dráhy nemají počítat geometricky, ale fyzikálně, s ohraničením.
Stojí za to rozlišit dvě věci, které se pod „fyzikálně" schovávají:

**Plná N-body simulace** (každé těleso přitahuje každé jiné) je při tisícovce
těles výpočetně zvládnutelná, ale pro zápisník je to špatně – a ne kvůli
výkonu. Soustava se vyvíjí, tělesa se rozutečou nebo srazí a **zápisek se
časem přestěhuje jinam**. Prostorová paměť, což je celá výhoda téhle aplikace,
se tím rozbije. Ohraničení, o kterém mluvíš, je přesně ten instinkt.

**Keplerovy dráhy** dávají fyziku bez téhle nevýhody. Každé těleso má skutečné
dráhové prvky – velkou poloosu, výstřednost, sklon, argument pericentra –
a obíhá svého rodiče podle gravitace jen od něj, ne od sourozenců. Dostaneš
opravdové elipsy, správné rychlosti (u pericentra rychleji) i nakloněné roviny,
ale soustava zůstane stabilní napořád.

> **Od 1.7.4 hotové:** dráhy jsou keplerovské elipsy, nová tělesa se
> vypouštějí šipkou (poloha + rychlost → dráhové prvky) a rodič se volí
> podle hmotnosti a Hillovy sféry. Viz docs/tvoreni.md.

Navíc se tím nepřijde o vlastnost, kterou má současné řešení a která se bude
hodit: **poloha je čistá funkce času.** Dá se skočit na libovolný okamžik bez
počítání mezikroků a nic se nikdy nerozjede numerickou chybou. Cena je řešení
Keplerovy rovnice (pár Newtonových iterací na těleso a snímek), což je při
tisícovce nic.

#### Proč se planeta nesmí přestěhovat k jiné hvězdě

To je hlavní důvod pro ohraničení a v N-body simulaci tisíce hvězd by se to
opravdu dělo. Planeta drží u své hvězdy jen uvnitř Hillovy sféry; při těsném
průletu jiné hvězdy se ukradne. Za dost dlouhou dobu to potká skoro každého.

Klíčové ale je, **že to není fyzikální problém, ale problém integrity dat.**
Vazba planety na hvězdu není výsledek simulace – je to struktura zápisníku,
tedy „tenhle zápisek patří pod tohle téma". Kdyby ji směl přepsat výpočet
drah, znamenalo by to, že se poznámka sama přesune pod jiné téma. To se
nesmí stát nikdy, ani omylem, ani po roce běhu.

U Keplerových drah navázaných na rodiče je to **nemožné z principu**, ne
ohlídané kontrolou: poloha tělesa je definovaná vůči jeho rodiči a od jiných
hvězd na něj nepůsobí vůbec nic. Žádný strop se nemusí hlídat, protože není
co překročit. Rodič je datové pole, které vlastní zápisník, ne fyzika.

Kdyby se později přidalo rušení kvůli živějšímu pohybu, platí dvě pravidla:
odchylka zůstane pod zlomkem Hillovy sféry a **nikdy nesmí sáhnout na
ukazatel na rodiče**.

Zbývá jeden případ, kdy to může rušit i tak: když se dvě hvězdy při svém
oběhu dostanou blízko k sobě, jejich soustavy se vizuálně prolnou, i když
vlastnictví zůstane v pořádku. To se ale řeší při rozmisťování – minimálním
odstupem hvězd – ne fyzikou.

### 5. Text ve 3D scéně

Do WebGL se text pořádně kreslit nedá a psát se v něm nedá vůbec. Obvyklé
a správné řešení je nechat galaxii ve WebGL a text i editaci udělat jako
běžný HTML nad plátnem. Prohlížeč tak zůstane od výběru textu přes klávesnici
na mobilu po přístupnost.

Drobnost, na kterou se narazí hned: `styles/main.css` má kvůli chování jako
aplikace vypnutý výběr textu na `body`. Pro text zápisků bude potřeba výjimka,
stejná, jaká už existuje pro `input` a `textarea`.

## Kdyby to mělo být na prodej

Autor to staví hlavně pro sebe, ale počítá s tím, že by to šlo prodávat.
Co z toho plyne pro rozhodování:

- **Odlišnost je prostorová paměť**, ne grafika. Lidé si pamatují, *kde* něco
  je. Galaxie jako paměťový palác je použitelný nápad; efektní vykreslení
  samo o sobě nikdo nekoupí.
- **Rozhodují nudné části.** Zápisníky nepadají na vzhledu, ale na
  synchronizaci, spolehlivosti, exportu, mobilní klávesnici a rychlosti
  hledání. „Jednoduchý režim" z toho zadání je obchodně ta důležitější půlka.
- **Deník je citlivá data.** Když to má mít uživatele, je vlastnictví dat,
  export a případně šifrování argument pro prodej, ne otrava navíc.
  Souvisí to přímo s otázkou 1 – kam se ukládá.

## Co z dosavadní práce zůstává

Roj není prototyp k zahození, nese se dál:

- **Výkon není riziko, a to s velkou rezervou.** Reálný strop je kolem 1000
  zápisků; 100 000 byl schválně přehnaný test, aby bylo vidět, kde je hrana.

  Naměřeno při 1000 tělesech (desktop, 1622×914), každé měření dvakrát:

  | Co | ms/snímek |
  |---|---|
  | prázdná scéna (1 těleso) | 0,22–0,38 |
  | 1000 těles, detail 12×8 | 0,25–0,28 |
  | 1000 těles, detail 48×32 (3 M trojúhelníků) | 0,67–0,72 |

  Celá 3D scéna tedy stojí **zhruba 2–4 % rozpočtu na 60 fps** podle detailu.
  Zbytek je volný na to, co aplikace teprve bude dělat.

  > Oprava: dřív tu stálo „1 %" a že plný detail je zdarma. To bylo změřené
  > v době, kdy se jádra těles kvůli chybě vůbec nekreslila (1.3.0–1.4.1),
  > takže tři miliony trojúhelníků měly nulovou plochu. Viz docs/instancing.md.

  Dva důsledky pro stavbu:

  - **Kulatá tělesa si dovolit jde, jen ne zadarmo.** Plný detail 48×32 je
    asi 2,6× dražší než 12×8, pořád ale jen 0,7 ms z 16,6. Stupně detailu
    v `_setDetail` jsou nastavené pro stotisícový test a při skutečném počtu
    zbytečně ubírají na kvalitě – pro zápisník je lepší je posunout nahoru.
  - **Planety můžou být opravdu osvětlené svou hvězdou** místo ploché šedé.
    Přesně ten vzhled, co má Universe Sandbox: přisvícená strana, terminátor,
    stín. Při tisícovce těles a hrstce světel je to v rozpočtu bez problému.

- **Hierarchie a planety** jsou přesně ta struktura, kterou zápisník potřebuje:
  hvězda jako téma, planety jako zápisky pod ním, měsíce jako poznámky k nim.
- **Odpojená kamera** je základ pro „doleť k tomuhle zápisku" – hledání bude
  muset umět přesunout střed otáčení na nalezené těleso a přiletět k němu.
- **Filtrování při hledání** jde udělat levně: přidat instancím atribut typu
  `aMatch` (float) a v shaderu podle něj ztlumit nenalezená tělesa. Stejný
  princip jako `aTint` a `aSize`, žádné přestavování scény, žádný pokles fps.

## Co se rozhodlo a proč

- **Capacitor, ne Flutter ani React Native** – three.js zůstává, jedna kódová
  základna. Uvnitř běží systémový WebView; že se s ním dá udělat dobrá aplikace,
  dokazují Obsidian a Notion. Rozhodnuto 2026-09-20, dá se to ještě otočit.
- **Desktop zůstává web v prohlížeči**, žádná desktopová aplikace.
- **Web bez build kroku**, appka s vlastní pipeline (`npm run bundle`).
