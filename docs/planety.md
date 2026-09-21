# Planety: materiály a osvětlení od hvězd

> **Režim „Planety" s náhodnými soustavami zmizel s rojem ve verzi 1.7.1**
> (stav je v tagu `v1.7.0`). Materiály a osvětlení odsud používá replika
> sluneční soustavy, rozšířené o plynné obry a Zemi – viz
> docs/slunecni-soustava.md.

V režimu „Planety" má každá hvězda 0 až 9 planet. Planeta sama nesvítí,
osvětluje ji její hvězda, a má materiál, podle kterého vypadá.

## Materiály

| Materiál | Barva | Povrch | Lesk | Četnost |
|---|---|---|---|---|
| kámen | šedá | tmavší a světlejší plochy | skoro žádný | 30 % |
| tráva | zelená | zelené pevniny, mezi nimi hnědá půda | skoro žádný | 25 % |
| železo | ocelová | kov, místy rez | ostrý, v rzi slábne | 20 % |
| voda | tmavě modrá | jemné vlnění odstínu | ostrý odlesk hvězdy, okraj proti světlu | 25 % |

Naměřené rozdělení na 818 planetách: kámen 28 %, voda 27 %, tráva 25 %,
železo 20 %.

Povrch se počítá ve fragment shaderu ze šumu (value noise, 4 oktávy) nad polohou
na kouli a semínkem z `gl_InstanceID`. Žádné textury: každá planeta vypadá
trochu jinak a nic se nestahuje. Barvy a váhy jsou v `PLANET_MATERIALS`
v `src/scenes/MainScene.js`; přidat materiál znamená přidat řádek tam a větev
do `CORE_FRAGMENT`.

## Osvětlení

Každou planetu osvětluje **jen její hvězda**, tedy její rodič. Planety tedy
nepotřebují žádné skutečné světlo ve scéně – shader dostane polohu a barvu
hvězdy jako instanční atributy a spočítá osvětlení sám:

| Atribut | Co nese | Kdy se přepisuje |
|---|---|---|
| `aKind` (float) | 0 = hvězda, 1–4 = materiál planety | při změně typu oběhu |
| `aLight` (vec3) | poloha hvězdy, která planetu osvětluje | každý snímek, jen v režimu planet |
| `aLightColor` (vec3) | barva té hvězdy | při změně barev |

Model je jednoduchý a stačí: difúzní složka (osvětlená strana, noční strana
skoro černá – ambient 0,03), Blinn-Phongův lesk podle materiálu a u vody
fresnelův okraj. Barva světla je barva hvězdy, takže **pod modrou hvězdou
vypadá hnědá půda šedozeleně** a pod teplou hnědě. To není chyba, tak se
světlo chová.

Celkový jas planet řídí posuvník „Osvětlení planet".

Z rozhodnutí plyne omezení: planety se navzájem nezastiňují a planetu
neosvětlí jiná hvězda než její vlastní. Pro zápisník to nevadí, je to
naopak totéž, co drží planetu u její hvězdy (viz docs/koncept.md).

## Dráhy planet se měří v poloměrech hvězdy

Původně se vzdálenost planety počítala z poloměru galaxie (0,012–0,062 ×
„Poloměr oběhu"). Při velké hvězdě pak planety obíhaly **pod jejím povrchem** –
na prvním snímku byly dvě planety uvnitř hvězdy.

Teď je první planeta 2,2 poloměru hvězdy od jejího středu a každá další
o 1,1 dál (plus trochu náhody). 1,1 je víc než průměr největší planety
(0,55 × 2), takže se dráhy nepřekrývají. Naměřeno u hvězdy s devíti planetami:
2,29 / 3,39 / 4,61 / 5,70 / 6,71 / 8,09 / 9,20 / 10,00 / 11,44 poloměru.

### Rychlost podle Keplera

Oběžné doby jdou podle 3. Keplerova zákona, T² ∝ a³: úhlová rychlost klesá
s mocninou **1,5** vzdálenosti. Do verze 1.6.0 tu byla odmocnina (mocnina 0,5)
a všechno bylo moc rychlé – nejbližší planeta oběhla za ~5 s a vnější byly
skoro stejně rychlé jako vnitřní.

Konstanta je nastavená tak, aby nejbližší planeta oběhla za 30 s při
„Rychlosti planet" 1. Naměřeno u hvězdy s devíti planetami:

| Vzdálenost (poloměry hvězdy) | Oběh |
|---|---|
| 2,29 | 32 s |
| 4,61 | 91 s |
| 8,09 | 211 s |
| 11,44 | 356 s (~6 min) |

Poměr doby vnější a vnitřní planety vyšel 11,1; Kepler dává 11,2 (rozdíl je
zaokrouhlení).

Planety mají **vlastní čas a vlastní posuvník** („Rychlost planet"), nezávislý
na oběhu hvězd kolem středu galaxie („Rychlost oběhu"). Oběh galaxie je pořád
rychlý – hvězda urazí jednotky délky za sekundu – takže když je potřeba klid,
je potřeba stáhnout i ten.

## Zdálky tečka, zblízka koule

Planeta menší než 1,5 px poloměru se jako koule nekreslí (stejně jako jádra
hvězd, viz docs/instancing.md – jinak bliká). Zdálky proto z planety zbude
jen slabé halo v barvě materiálu (35 % jasu hvězdného hala). Jakmile je koule
rozlišitelná, halo planety plynule zmizí (mezi 1,5 a 3 px) a převezme ho
osvětlená koule – planeta zblízka nemá kolem sebe žádnou záři.

## Co to stojí

| | ms/snímek |
|---|---|
| 1000 těles, planety s osvětlením | 0,38 |
| 100 000 těles, planety s osvětlením | 6,85 |

Proti hvězdám bez osvětlení (0,25–0,28 ms při tisícovce) je to o ~0,1 ms víc.

Blikání zdálky se nezhoršilo: halo planet přidá jas, ale ne kolísání –
změna pixelu mezi snímky 0,164 s planetami proti 0,151 bez nich, v poměru
jasu 31 : 27.

## Na co si dát pozor

- **Noční strana u blízké hvězdy není úplně černá** – přes ni se rozlije bloom
  hvězdy za ní. Bloom je efekt přes celý obraz a o hloubce neví.
- **Planeta před hvězdou je černá silueta.** Díváme se na její noční stranu
  proti světlu, jako při přechodu planety přes Slunce. Je to správně.
