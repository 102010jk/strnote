# Replika sluneční soustavy

Od verze 1.7.1 je ve scéně sluneční soustava ve **skutečných velikostech
a vzdálenostech**: Slunce, osm planet a Měsíc. Předchozí testovací roj se
všemi posuvníky je uložený v tagu `v1.7.0`.

Data jsou v `src/scenes/solarSystem.js`, vykreslování v `src/scenes/MainScene.js`.

## Data

Poloměry, doby rotace a sklony os podle NASA Planetary Fact Sheet. Dráhy ze
středních dráhových prvků JPL („Approximate Positions of the Planets") k epoše
J2000: poloměr, oběžná doba, sklon dráhy k ekliptice, délka výstupného uzlu
a střední délka v epoše.

Jednotka délky je **milion km (Gm)**: Slunce má poloměr 0,696, Země 0,00637,
dráha Země 149,6, Neptun je 4 495 od Slunce.

Ověřeno po spuštění: vzdálenosti od Slunce 0,387 / 0,723 / 1,000 / 1,524 /
5,203 / 9,537 / 19,189 / 30,07 AU, Měsíc 384 400 km od Země.

## Čas

Simulace začíná **v aktuálním okamžiku** a počítá dny od J2000. Planety proto
stojí zhruba tam, kde opravdu jsou – 21. 9. 2026 vyšla heliocentrická délka
Země 0° (den před rovnodenností, správně), Saturn 17°, Jupiter 125°.

Mars vyšel na 70°, ze skutečné polohy odhaduji ~81°. Rozdíl je chyba kruhových
drah: Mars má výstřednost 0,093 a ta posouvá polohu až o ±10,6°.

Posuvník „Rychlost" je násobek skutečného času, 1 = realita. Jde logaritmicky
do 10 000, do políčka se dá napsat cokoliv. Pro představu při 10 000×:

| | trvá |
|---|---|
| otočka Země | 8,6 s |
| oběh Měsíce | 3,9 min |
| oběh Merkuru | 12,7 min |
| oběh Země | 53 min |

## Přesnost: proč se počítá relativně ke kameře

GPU počítá ve float32, což je ~7 platných číslic. Ve vzdálenosti Neptunu
(4 495 Gm) je nejmenší krok ~0,0005 Gm – **2 % poloměru Neptunu**. Kdyby se
polohy posílaly na kartu přímo, povrch planety by se při přiblížení třásl.

Proto:

1. polohy se počítají na procesoru ve **float64** (`_px/_py/_pz` jsou
   `Float64Array`),
2. skupina `bodies` se každý snímek přesune na kameru a tělesa mají polohu
   **vůči kameře** (`aOffset = poloha − kamera`) – rozdíl velkých čísel se
   spočítá ve float64 a na kartu jdou malá čísla s plnou přesností,
3. i osvětlení se počítá ve stejné relativní soustavě (`aLight`, `vRel`).
   Odstup kamery od skupiny (`uCameraOffset`) se nastavuje v `onBeforeRender`,
   protože kamera se po update scény ještě posune (sledování tělesa).

Vzdálená rovina ořezu je aspoň 100 000 Gm, aby se vešla celá soustava.

## Viditelnost: značky místo skutečného jasu

Ve skutečném měřítku jsou planety zdálky neviditelné – z pohledu na vnitřní
soustavu má Země desetinu pixelu. Aby šlo planety najít a kliknout na ně:

- **Značka:** když je těleso menší, než se dá vykreslit, halo přejde do měkké
  tečky o pevné velikosti (poloměr 1,6 px). Fyzikální záře má tak ostrý vrchol,
  že by se zdálky vešla pod jeden pixel a tečka by zmizela. Ověřeno měřením
  pixelů: Země (197, 206, 219), Mars (198, 159, 127).
- **Bez ubírání jasu:** v roji tisíců hvězd se jas vzdálených ubíral úměrně
  ploše, jinak by splynuly v bílou skvrnu. Tady je těles pár a jsou to značky,
  takže se neubírá (`MARKER_MIN_DIM = 1`).
- **Dráhy:** tenké kružnice v barvě tělesa. Zmizí, když je kamera blíž než
  2–10 % poloměru dráhy – zblízka by kružnice o 512 bodech byla vedle planety
  jen rovná úsečka mimo ni.

Kliknutí přeletí k tělesu stejně jako dřív; logaritmické prolínání odstupu
zvládne přelet přes čtyři řády (z pohledu na soustavu k Měsíci).

## Vzhled těles

| Těleso | Materiál | Poznámka |
|---|---|---|
| Slunce | hvězda | okrajové ztemnění, tep jen u něj |
| Merkur, Měsíc, Mars | kámen | Mars do červena |
| Venuše | plyn | husté mraky, pásy skoro nevidět |
| Země | země | oceán, pevniny, ledové čepičky, mraky, odlesk Slunce na vodě |
| Jupiter, Saturn, Uran, Neptun | plyn | pásy podle šířky, síla a hustota podle planety |

Povrch se **otáčí** podle skutečné doby rotace a sedí na **skloněné ose**
(Uran leží na boku, Venuše je skoro vzhůru nohama). Úhel otočky se zkracuje
na jednu otáčku ještě ve float64 – ve float32 by se Jupiter za pár let simulace
otáčel po skocích.

**Saturnovy prstence** mají kruhy C, B, Cassiniho dělení a kruh A (1,24–2,27
poloměru Saturnu) a leží v rovině jeho rovníku. Pod 2–6 px zmizí, jinak by
blikaly jako vzdálená jádra.

**Osvětlení** dává každému tělesu nejbližší hvězda nad ním v hierarchii –
Měsíc tedy osvětluje Slunce, ne Země.

## Nastavení

Výchozí hodnoty podle zadání: fyzikální záře, expozice 0,75, tep 0,05,
práh záře 0,8, záře 0,9, bez podlahy.

„Osvětlení planet" je 1,0, ne původních 1,6: při 1,6 bylo naměřeno 87 %
kotouče Venuše a 55 % Jupiteru čistě bílých. Při 1,0 není přepálená žádná
planeta.

## Zjednodušení, o kterých je dobré vědět

- **Kruhové dráhy.** Výstřednost se zanedbává; u Marsu to dělá až ~10°,
  u Merkuru (e = 0,21) ještě víc.
- **Směr sklonu os** není skutečný – všechny osy jsou skloněné kolem stejné
  osy. Velikost sklonu sedí.
- **Z měsíců jen Měsíc.** Jupiterovy, Saturnovy a další chybí.
- **Žádné stíny** – prstence nevrhají stín na Saturn a naopak, zatmění nejsou.
- **Hranatá záře kolem Slunce zblízka.** Práh 0,8 je pod jasem slunečního
  kotouče, takže bloom chytí celý kotouč a `UnrealBloomPass` ho rozmaže do
  čtverce (viz docs/instancing.md). Odstraní ho práh nad ~1,3.
