# Tvoření těles

První kousek tvoření (1.7.2): v panelu se vybere, co kliknutí vytvoří –
planetu, měsíc nebo hvězdu –, nastaví se jeho vlastnosti a kliknutím do scény
těleso vznikne. Směr je k plnému tvoření v 1.8; tohle je základ, na kterém
se bude stavět po kouscích.

Kód: `spawn()`, `_spawnPlanet()`, `_spawnMoon()`, `_spawnStar()`, `_orbit()`
a `addBody()` v `src/scenes/MainScene.js`.

## Ovládání

| Tvořím | Nastavuje se |
|---|---|
| planetu | materiál, hmotnost (× Země), poloměr (× Země), rychlost oběhu |
| měsíc | materiál, hmotnost (× Země), poloměr (× Země), rychlost oběhu |
| hvězdu | hmotnost (× Slunce), poloměr (× Slunce), teplota (K) |

Ovladače ostatních typů jsou schované (`visible` u popisu ovladače). Když je
tvoření zapnuté, kurzor je zaměřovač a kliknutí vytvoří těleso místo sledování.
`Esc` tvoření vypne. Pod horní lištou se ukáže, co vzniklo a jak dlouho obíhá,
nebo proč nevzniklo nic.

## Kam těleso vznikne a kolem čeho obíhá

Kliknutí je paprsek z kamery. Těleso vznikne tam, kde paprsek protne:

- **planeta a hvězda** – rovinu ekliptiky (y = 0),
- **měsíc** – rovinu rovnoběžnou s ekliptikou vedenou středem jeho planety.

Rodič se volí takhle:

- **planeta** obíhá **nejbližší hvězdu** (vzdálenost v prostoru),
- **měsíc** obíhá **planetu, které je paprsek nejblíž** – stačí kliknout vedle
  planety, není potřeba trefit přesnou vzdálenost,
- **hvězda** nemá rodiče a **stojí na místě**, kde vznikla.

Dráha je kruhová a prochází bodem kliknutí; fáze je nastavená tak, že se
těleso objeví přesně pod kurzorem (ověřeno: odchylka 0 px).

## Oběh z hmotnosti

Oběžná doba se počítá z 3. Keplerova zákona:

```
T = 2π · √( a³ / G(M + m) ) / násobek rychlosti
```

`G` je v jednotkách scény (Gm³ / kg / den²) = 6,6743·10⁻¹¹ · 10⁻²⁷ · 86 400².
Ověřeno na datech soustavy: z hmotností a vzdáleností vyjdou skutečné oběžné
doby všech planet i Měsíce s chybou nejvýš 0,13 %. Nová planeta v 0,769 AU
od Slunce oběhla za 246,3 dne, což přesně odpovídá výpočtu.

Hmotnost tedy **opravdu něco dělá**: hmotnost hvězdy určuje, jak rychle kolem
ní obíhají planety, a hmotnost planety, jak rychle kolem ní obíhají měsíce
a jak daleko je udrží.

**Rychlost oběhu** je násobek fyzikálně správné rychlosti (1 = Kepler).
Poctivě: jiná rychlost než 1 už fyzikálně neodpovídá kruhové dráze – skutečné
těleso by se rozletělo nebo spadlo po elipse. Dokud jsou dráhy kruhové, je
to jen zrychlený nebo zpomalený kruh.

## Měsíc se udrží jen blízko

Planeta udrží měsíc jen uvnitř své **Hillovy sféry**, dál by si ho přetáhla
hvězda:

```
r_H = a · ∛( m / 3M )
```

(a je vzdálenost planety od hvězdy, m hmotnost planety, M hmotnost hvězdy).
Pro Zemi to je 1,5 milionu km. Kliknutí dál měsíc nevytvoří a řekne proč:
*„Tak daleko se u tělesa Země měsíc neudrží – musí být do 1,5 mil. km
(teď 4,36 mil. km)."*

Další pojistky: planeta nevznikne blíž než 2 poloměry hvězdy, měsíc blíž než
1,5 poloměru planety.

Měsíc se kolem své osy otáčí stejně dlouho, jako obíhá, takže je k planetě
natočený pořád stejnou stranou – jako náš Měsíc.

## Hvězdy

Barva hvězdy se počítá z **teploty** podle přibližné křivky černého tělesa
(Tanner Helland): 3 500 K vyjde oranžová (1; 0,76; 0,55), 5 778 K skoro bílá
jako Slunce, nad 10 000 K modrobílá.

Planeta vytvořená u nové hvězdy ji obíhá a **osvětluje ji ona** – světlo
tělesa hledá nejbližší hvězdu nahoru po rodičích.

## Přidávání za běhu

`addBody()` přidá popis tělesa (stejný tvar jako v `solarSystem.js`) a postaví
znovu všechna pole a instanční atributy. Stará geometrie se uvolní až po
přepojení meshů, jinak by buffery zůstaly na GPU. Ověřeno: po každém tělese
přibude na GPU právě jedna geometrie – jeho kružnice dráhy (geometrií bez čar
drah je pořád 3).

Stávající tělesa si nechají indexy, takže sledování kamerou nepřeskočí.

## Na co se narazilo

- **Schované ovladače byly vidět.** Atribut `hidden` má ve výchozím stylu
  prohlížeče nižší prioritu než `display: grid` u polí panelu. Test, který
  kontroloval jen atribut, prošel – chybu ukázal až snímek. Opraveno pravidlem
  `[hidden] { display: none !important; }`; ověřuje se podle vypočteného
  stylu, ne podle atributu.

## Co zatím chybí

- **Nic se neukládá** – po obnovení stránky vytvořená tělesa zmizí.
  Souvisí s otevřenou otázkou, kam ukládat data (docs/koncept.md).
- **Mazání a krok zpět.**
- **Sklon dráhy** – všechno vzniká rovnoběžně s ekliptikou.
- **Hvězdy se nehýbou** a tělesa se můžou překrývat, nic nekontroluje srážky.
