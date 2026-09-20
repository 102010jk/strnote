# Changelog

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
