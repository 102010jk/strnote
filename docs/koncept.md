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

### 3. Text ve 3D scéně

Do WebGL se text pořádně kreslit nedá a psát se v něm nedá vůbec. Obvyklé
a správné řešení je nechat galaxii ve WebGL a text i editaci udělat jako
běžný HTML nad plátnem. Prohlížeč tak zůstane od výběru textu přes klávesnici
na mobilu po přístupnost.

Drobnost, na kterou se narazí hned: `styles/main.css` má kvůli chování jako
aplikace vypnutý výběr textu na `body`. Pro text zápisků bude potřeba výjimka,
stejná, jaká už existuje pro `input` a `textarea`.

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
