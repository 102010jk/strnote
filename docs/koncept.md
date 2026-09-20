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

### 4. Text ve 3D scéně

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

- **Výkon není riziko.** 100 000 těles běží na 7–8 ms na snímek. Deník bude mít
  řádově stovky až tisíce zápisků, takže vizuální stránka má obrovskou rezervu.
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
