# Tvoření těles

Tělesa se tvoří přímo ve scéně. V panelu se vybere, co vznikne (planeta,
měsíc nebo hvězda), a nastaví se hmotnost, velikost a materiál nebo teplota.
Pak se ve scéně **stiskne, táhne a pustí**: stisk určí místo, šipka směr
a rychlost vypuštění a z toho vyjde skutečná dráha. Tvoří se po kouscích
směrem k plnému tvoření v 1.8.

- 1.7.2 – tvoření kliknutím, kruhové dráhy
- 1.7.3 – mazání
- 1.7.4 – vypouštění šipkou, eliptické dráhy, rodič podle hmotnosti

Kód: `beginLaunch()`, `aimLaunch()`, `updateLaunch()`, `commitLaunch()`,
`_chooseParent()`, `_checkLaunch()` a `conicFromState()`
v `src/scenes/MainScene.js`; ovládání myší a kreslení šipky
v `src/ui/launcher.js`.

## Ovládání

| Tvořím | Nastavuje se |
|---|---|
| planetu | materiál, hmotnost (× Země), poloměr (× Země) |
| měsíc | materiál, hmotnost (× Země), poloměr (× Země) |
| hvězdu | hmotnost (× Slunce), poloměr (× Slunce), teplota (K) |

V režimu tvoření:

- **kliknutí** (bez tažení) = kruhová dráha kolem toho, co místo drží,
- **stisk – tažení – puštění** = vypuštění po šipce: směr šipky je směr
  letu, délka rychlost. Šipka dlouhá **120 px = rychlost na kruhovou dráhu**
  v tom místě; kratší spadne blíž, delší odletí dál, od √2 × (≈ 170 px)
  uletí úplně,
- během tažení je vidět **náhled dráhy** a u kurzoru popisek: kolem čeho
  bude obíhat, za jak dlouho, rychlost v km/s a výstřednost,
- **červená šipka** = takhle nepůjde vypustit (proč, píše popisek) a po
  puštění nic nevznikne,
- **pravé tlačítko otáčí kamerou** – levé patří šipce,
- `Esc` zruší rozdělanou šipku, další `Esc` vypne tvoření.

Rychlost oběhu se už nenastavuje posuvníkem (1.7.2 měla „násobek Keplera"):
rychlost dává šipka a je fyzikálně poctivá – jiná rychlost než kruhová dá
elipsu, ne zrychlený kruh.

## Kolem čeho těleso obíhá – podle hmotnosti

O rodiči nerozhoduje, jestli je těleso v panelu „planeta" nebo „měsíc",
ale **hmotnost**. Rodič musí být **těžší** a místo musí ležet v jeho
**dosahu**:

- obíhající těleso drží okolí do své **Hillovy sféry**
  `r_H = a(1 − e) · ∛(m / 3M)` – dál by si oběžnici přetáhl jeho rodič
  (u Země 1,5 mil. km, u Měsíce 61 000 km),
- volná hvězda drží všechno do **půli cesty k nejbližší jiné volné hvězdě**.

Když místo leží v dosahu víc těles, vyhraje to **nejhlouběji v hierarchii**
(Země před Sluncem, Měsíc před Zemí), mezi rovnocennými to, co **táhne
nejvíc** (M / d²).

Ověřeno u Země: „měsíc" 0,0123 Země → obíhá Zemi; „planeta" 0,5 Země → obíhá
Zemi; „planeta" 1 Země → obíhá **Slunce** (Země není těžší). Drobný měsíc
u Měsíce obíhá Měsíc, stejně těžký „měsíc" obíhá Zemi.

Místo vzniku je průsečík paprsku z kamery s rovinou rovnoběžnou s ekliptikou,
vedenou středem rodiče. Pamatuje se **vůči rodiči**, takže při tažení jede
s ním – planeta se mezitím pohne dál.

### Hvězdy

- **kliknutí** = hvězda **stojí na místě** (volná hvězda, jako v 1.7.2),
- **tažení** = hvězda se vypustí kolem těžšího tělesa, třeba lehčí hvězda
  kolem Slunce (ověřeno: 0,3 Slunce, oběh 3,8 roku, výstřednost 0,31).
  Když nic těžšího v dosahu není, šipka je červená.

Barva hvězdy se počítá z **teploty** podle přibližné křivky černého tělesa
(Tanner Helland): 3 500 K vyjde oranžová, 5 778 K skoro bílá jako Slunce,
nad 10 000 K modrobílá. Tělesa kolem hvězdy **osvětluje ona** – světlo
hledá nejbližší hvězdu nahoru po rodičích, i když ta sama obíhá jinou.

## Z polohy a rychlosti dráha

Poloha r (vůči rodiči) a rychlost v jednoznačně určují keplerovskou
dráhu (`conicFromState`), μ = G(M + m):

```
h = r × v                         moment hybnosti, kolmý k rovině dráhy
e = (v × h) / μ − r / |r|         vektor výstřednosti, míří do pericentra
p = |h|² / μ                      parametr kuželosečky
a = p / (1 − e²)                  velká poloosa (jen elipsa, e < 1)
T = 2π · √(a³ / μ)                oběžná doba
```

P = e / |e| (do pericentra), Q = h × P / |h| (směr pohybu v pericentru).
Pravá anomálie místa vzniku z r, z ní excentrická a střední anomálie
a z té `M0` = střední anomálie v J2000. Těleso se tak uloží **stejně jako
planety soustavy** (a, e, P, Q, M0, T) a dál se počítá stejným kódem.

`G` je v jednotkách scény (Gm³ / kg / den²) = 6,6743·10⁻¹¹ · 10⁻²⁷ · 86 400².
Z hmotností a vzdáleností v datech vyjdou skutečné oběžné doby planet
i Měsíce s chybou nejvýš 0,13 %.

Ověřeno: kliknutí 137 Gm od Slunce → kruh, oběh 320 dní (0,916³ᐟ² roku);
šipka 1,3× kruhové rychlosti → výstřednost 0,69 (= 1,3² − 1), po půl oběhu
je těleso přesně v odsluní 843,6 Gm a po celém zpátky v místě vypuštění.

Poloha v čase se počítá z **Keplerovy rovnice** M = E − e·sin E
(Newtonova metoda, u e > 0,8 start od π). Proto teď mají skutečné výstřednosti
i planety – viz docs/slunecni-soustava.md.

## Kdy je šipka červená

Kontroly v tomhle pořadí (co člověk uvidí jako první):

1. **Míří přímo na těleso** – šipka na obrazovce vede přes nějaké těleso
   (počítá se aspoň kolečko 3 px). Těleso, na kterém šipka začíná, se
   nepočítá – měsíc zdálky splyne s planetou a šipka by byla červená pořád.
2. **Narazí / shoří** – pericentrum je blíž než poloměr rodiče + poloměr
   tělesa, u hvězdy 2 poloměry. U otevřené dráhy jen když k pericentru letí
   (ne když se od něj už vzdaluje).
3. **Uletí** – výstřednost ≥ 1, dráha není uzavřená. Popisek řekne únikovou
   rychlost.
4. **Odletí moc daleko** – odsluní je za dosahem rodiče. To je to
   **ohraničení**: těleso nesmí doletět tam, kde by ho přetáhl někdo jiný,
   takže nikdy nepřeskočí od hvězdy k hvězdě.
5. **Srazí se** s tělesem, které obíhá stejného rodiče – během prvního
   oběhu.

### Srážky dopředu v čase

Všechny dráhy jsou známé dopředu, takže se nemusí nic simulovat: nová dráha
se projde přes jeden oběh a v každém kroku se porovná se sourozenci. Mezi
kroky se bere **nejmenší vzdálenost úsečky**, ne jen body – planety jsou
vůči drahám drobné (Země 0,006 Gm na dráze 150 Gm) a body by srážku
přeskočily. Kroků je 256–4 096 podle počtu sourozenců (rozpočet 40 000
poloh), pro Zemi to je krok 2 hodiny.

Test: dráha Země zrcadlená na opačný směr → srážka se Zemí nalezena;
stejná dráha o 1 mil. km dál → žádná.

Kontrola stojí pár ms, takže se počítá znovu jen při pohybu šipky, jinak
nejvýš 7× za sekundu.

Srážky ve skutečném měřítku jsou vzácné – planety jsou proti vzdálenostem
maličké. To je realita, ne chyba; nejčastěji zčervená šipka kvůli bodům 1–4.

## Přidávání za běhu

`addBody()` přidá popis tělesa (stejný tvar jako v `solarSystem.js`) a postaví
znovu všechna pole a instanční atributy. Stará geometrie se uvolní až po
přepojení meshů, jinak by buffery zůstaly na GPU. Ověřeno: po každém tělese
přibude na GPU právě jedna geometrie – jeho kružnice dráhy (geometrií bez čar
drah je pořád 3).

Stávající tělesa si nechají indexy, takže sledování kamerou nepřeskočí.

## Mazání (1.7.3)

- **Kliknutí → „smaže těleso"**: klik na těleso ho smaže. Klik do prázdna
  řekne, že tu nic není.
- **`Delete`** smaže těleso, které se právě sleduje.
- **„Smazat všechno"** smaže celou scénu včetně Slunce – dá se pak stavět
  vlastní soustava od nuly. Potvrzuje se druhým kliknutím do 3 s; bez něj
  se tlačítko samo vrátí. Obnovení stránky vrátí sluneční soustavu.

Smazání tělesa **smaže i všechno, co kolem něj obíhá** – měsíc bez planety
nemá kolem čeho obíhat, planeta bez hvězdy taky ne. Smazání Země smaže
i Měsíc a zpráva řekne kolik: *„Smazáno: Země a 1 těleso, které kolem
obíhalo."* Potomek má v seznamu vždycky vyšší index než rodič, takže stačí
jeden průchod.

> **Pro zápisník takhle mazání zůstat nemůže.** Smazání tématu (hvězdy)
> nesmí potichu smazat všechny zápisky pod ním. Až budou tělesa nést obsah,
> potřebuje mazání rodiče potvrzení s výčtem, co zmizí, a krok zpět –
> nebo potomky přesunout, ne smazat.

### Indexy se po smazání posunou

Tělesa jsou v polích za sebou, takže po smazání se posunou indexy všech
za ním. Kvůli tomu:

- **sledování kamerou jde podle `id`**, ne podle indexu (`bodyTracker`).
  Ověřeno: při sledování Jupiteru a smazání Země zůstal Jupiter přesně
  uprostřed obrazovky (0 px); se sledováním podle indexu by kamera
  přeskočila na Saturn.
- **kružnice drah a prstence se staví znovu** (`_rebuildGuides`) – odkazují
  na indexy rodičů. Je jich pár, takže je to okamžité.
- Klávesa `Delete` si pamatuje `id` sledovaného tělesa, ne index.

Ověřeno, že se nic nehromadí na GPU: v přehledu (kde se kreslí všechny
dráhy) je po každém smazání geometrií přesně 2 + dráhy + prstence
(10 → 9 → 8 → 7). Prázdná scéna se vykreslí bez chyby WebGL.

## Na co se narazilo

- **Šipka nebyla vidět.** `svg.hidden = false` nic neudělá – vlastnost
  `hidden` mají jen HTML prvky, u SVG se jen vytvořila obyčejná proměnná
  a atribut zůstal. U SVG se přepíná atribut (`toggleAttribute`).
- **Kamera se otáčela spolu s šipkou.** OrbitControls poslouchají stisk na
  plátně; launcher se proto zaregistruje ve fázi capture na `window` (běží
  dřív) a ovládání kamery na dobu tažení vypne.

- **Schované ovladače byly vidět.** Atribut `hidden` má ve výchozím stylu
  prohlížeče nižší prioritu než `display: grid` u polí panelu. Test, který
  kontroloval jen atribut, prošel – chybu ukázal až snímek. Opraveno pravidlem
  `[hidden] { display: none !important; }`; ověřuje se podle vypočteného
  stylu, ne podle atributu.

## Co zatím chybí

- **Nic se neukládá** – po obnovení stránky vytvořená tělesa zmizí.
  Souvisí s otevřenou otázkou, kam ukládat data (docs/koncept.md).
- **Krok zpět** – smazané se nedá vrátit (kromě obnovení celé stránky).
- **Sklon dráhy** – všechno vzniká rovnoběžně s ekliptikou; šipka jde jen
  v rovině (obráceně = obíhá pozpátku).
- **Srážky jen se sourozenci a jen při vypuštění.** Po vzniku se nic
  nehlídá a dráhy se nemění – žádné vzájemné rušení (záměrně, viz
  docs/koncept.md).
- **Volné hvězdy se nehýbou.**
- **Dotyk:** jedním prstem se vypouští, otáčení kamery dotykem v tvoření
  zatím nejde.
