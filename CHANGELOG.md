# Changelog

## 1.4.0 – 2026-09-20

Roj už není jednobarevný. Místo jedné barvy se volí dvě a každé těleso dostane
odstín někde mezi nimi plus malé náhodné okolí, jak široké se řídí posuvníkem.

Nový typ oběhu **Planety**: každá hvězda dostane 0 až 9 planet, které obíhají
ji. Planety jsou šedé a menší, hvězdy si drží barvu – vypadá to jako hvězdné
pole s vlastními soustavami.

Kamera má dva režimy. Na střed krouží kolem pevného bodu jako dosud, odpojená
se dá odtáhnout myší kamkoliv. Uprostřed scény už taky nestojí žádné těleso.

Sto tisíc těles běží 7,3–8,1 ms na snímek podle typu oběhu.

## 1.3.0 – 2026-09-20

Světlo se teď počítá, ne kreslí z obrázku. Záře kolem každého tělesa vzniká
výpočtem pro každý pixel, takže se ani při maximálním přiblížení nerozmaže
a nemá okraje. Na výběr jsou tři podoby: měkká, fyzikální (ubývá s druhou
mocninou vzdálenosti) a hvězda s difrakčními paprsky.

Přibyly typy oběhu. Kromě dosavadní koule jde vybrat disk, kde všechno obíhá
v jedné rovině jako galaxie, a hierarchie, kde tělesa obíhají jedno druhé –
vznikají z toho soustavy planet a měsíců.

Test jde na 100 000 těles a poloměr oběhu na 20 000. U každého posuvníku
je políčko na přesné číslo, takže se hodnota dá napsat, ne jen natrefit myší.

Opraveno: ovládací panel byl uříznutý, expozice a podlaha nešly dosáhnout.
Roj při velkém oddálení blikal – kolísání jasu kleslo ze 0,68 % na 0,04 %.

100 000 těles běží na 6 ms na snímek. Jak: [docs/instancing.md](docs/instancing.md).

## 1.2.1 – 2026-09-20

Oprava: po nasazení nové verze se napoprvé pořád ukazovala ta stará a nová
naskočila až při druhém otevření. Offline režim funguje dál stejně.

## 1.2.0 – 2026-09-20

Koule už není jedna. Slider „Počet koulí" jde od 1 do 10 000 a všechny obíhají
společný střed – bližší rychleji, takže se z nich skládají viditelné slupky.
Přibyly k tomu posuvníky na poloměr a rychlost oběhu.

Zoom je bez hranic: dá se dojet až k jedné kouli nebo odjet tak daleko, že je
z celého roje tečka. Nahoře vedle fps přibyl počet draw callů a trojúhelníků,
ať je při zkoušení vidět, co to stojí.

Deset tisíc koulí běží na 1,3 ms na snímek. Jak je to udělané:
[docs/instancing.md](docs/instancing.md).

## 1.1.0 – 2026-09-20

Web se dá nainstalovat na plochu jako aplikace – má vlastní ikonu, spouští se
na celou obrazovku bez adresního řádku a po prvním načtení funguje i offline.
Na dotykovém displeji se chová jako appka, ne jako stránka: nic se neoznačuje
a nevyskakuje menu po přidržení prstu. Offline režim naskočí od druhého otevření –
napoprvé se stihne uložit jen část.

Pod povrchem je připravená cesta do Google Play a App Store přes Capacitor.
Zatím se nic neinstaluje, jen je všechno nachystané – podrobnosti
v [docs/mobile.md](docs/mobile.md).

## 1.0.0 – 2026-09-20

Uprostřed scény svítí koule světla. V panelu vpravo dole se dá přenastavit úplně
všechno, co na ní jde: barva, jas jádra, velikost, síla a dosah svícení, záře kolem
koule i její rozptyl, tep a celková expozice. Podlaha, na kterou světlo dopadá,
se dá vypnout, pak zůstane jen koule ve tmě.

Myší se scéna otáčí, kolečkem přibližuje. `H` schová ovládání, mezerník zastaví tep,
`Reset` vrátí kameru.

Web běží na <https://102010jk.github.io/strnote/> a nasazuje se sám při každém pushi.
