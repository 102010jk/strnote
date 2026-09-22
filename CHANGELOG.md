# Changelog

## 1.7.41 – 2026-09-22

Měsíc se přichytí k planetě. Stačí stisknout kousek vedle ní – i v přehledu
celé soustavy, kde je Země jen tečka – a měsíc bude obíhat ji, v rozumné
vzdálenosti.

Když najedeš myší na planetu, měsíc nebo hvězdu, ukáže se, co je zač: jméno,
hmotnost, poloměr, rychlost teď, nejvyšší a nejnižší rychlost na dráze,
vzdálenost, oběh, otočka a další. Zatím jako obyčejný text.

## 1.7.4 – 2026-09-22

Tělesa se teď vypouštějí. Stiskni myš tam, kde má těleso vzniknout, táhni
a pusť: šipka ukazuje směr a rychlost a rovnou je vidět dráha, po které
poletí – kruh, protáhlá elipsa, nebo pryč. Když by těleso narazilo, shořelo
ve hvězdě, uletělo nebo se s něčím srazilo, šipka zčervená, popisek řekne
proč a nic nevznikne. Obyčejné kliknutí dál udělá kruhovou dráhu.

Kolem čeho těleso obíhá, rozhoduje jeho hmotnost, ne jestli je to planeta
nebo měsíc: lehká planeta u Země bude obíhat Zemi, těžký měsíc Slunce.
Hvězda se dá vypustit kolem těžší hvězdy. V tvoření se kamerou otáčí pravým
tlačítkem.

Planety naší soustavy mají teď skutečné eliptické dráhy, takže stojí
přesněji tam, kde doopravdy jsou (Mars se posunul o 10°).
Jak to funguje: [docs/tvoreni.md](docs/tvoreni.md).

## 1.7.3 – 2026-09-22

Tělesa jde mazat. Přepni kliknutí na „smaže těleso" a klikni na to, co má
zmizet – nebo stiskni `Delete` u tělesa, které sleduješ. Spolu s tělesem
zmizí i to, co kolem něj obíhalo: smazání Země smaže i Měsíc.

Tlačítko „Smazat všechno" vyčistí celou scénu, i Slunce, a dá se stavět
vlastní soustava od nuly. Chce potvrzení druhým kliknutím. Obnovení stránky
vrátí sluneční soustavu.

## 1.7.2 – 2026-09-21

Dají se tvořit tělesa. V panelu vyber, co má kliknutí vytvořit – planetu,
měsíc nebo hvězdu –, nastav hmotnost, velikost a materiál nebo teplotu,
a klikni do scény. Těleso se objeví přesně tam, kam klikneš.

Oběh se počítá z hmotnosti jako ve skutečnosti: planeta obíhá nejbližší
hvězdu, měsíc planetu vedle kurzoru, a jak rychle, záleží na tom, jak je
to, kolem čeho obíhají, těžké. Měsíc jde vytvořit jen tak blízko planety,
kde ho doopravdy udrží – jinak se ukáže proč ne. Hvězda zůstane stát
a svítí na planety, které kolem ní vytvoříš.

Vytvořená tělesa se zatím neukládají. Jak to funguje:
[docs/tvoreni.md](docs/tvoreni.md).

## 1.7.1 – 2026-09-21

Místo testovacího roje je uprostřed replika naší sluneční soustavy – Slunce,
osm planet a Měsíc ve skutečných velikostech a vzdálenostech. Planety stojí
zhruba tam, kde dnes opravdu jsou, otáčejí se kolem svých os a mají svůj
vzhled: Země oceány, pevniny a mraky, Jupiter a Saturn pásy, Saturn prstence.

Zbyl jeden posuvník na rychlost: 1 je skutečný čas, dá se zrychlit až
10 000×. Dál jde nastavit kamera a světlo. Planety jsou zdálky vidět jako
tečky na svých dráhách a kliknutím se k nim dá doletět.

Předchozí stav s rojem je uložený jako verze 1.7.0. Jak to funguje:
[docs/slunecni-soustava.md](docs/slunecni-soustava.md).

## 1.7.0 – 2026-09-21

Na hvězdu nebo planetu jde kliknout: kamera k ní přeletí, dá ji doprostřed
a pak ji sleduje, jak obíhá. Nahoře je vidět, co se sleduje; `Esc` nebo
„Reset" ji pustí.

Planety obíhají pomaleji a jako ve skutečnosti – čím dál od hvězdy, tím
mnohem pomaleji. Nejbližší oběhne za půl minuty, nejvzdálenější za šest.
Mají vlastní posuvník „Rychlost planet", nezávislý na oběhu galaxie.

## 1.6.0 – 2026-09-21

Planety už nejsou šedé kuličky. Každá má materiál – kámen, trávu, železo
nebo vodu – a podle něj barvu i povrch: zelené pevniny, rezavý kov, modrý
oceán s odleskem. Osvětluje je jejich hvězda, takže mají denní a noční stranu
a světlo má barvu té hvězdy. Nový posuvník „Osvětlení planet" řídí jejich jas.

Planety teď obíhají v bezpečné vzdálenosti od své hvězdy, seřazené od ní;
dřív se při velké hvězdě dostaly až pod její povrch.

Jak to funguje: [docs/planety.md](docs/planety.md).

## 1.5.3 – 2026-09-21

Opraveno: po nasazení se nová verze mohla ukazovat až za deset minut,
protože prohlížeč držel staré soubory ve své cache. Teď se pokaždé zeptá,
jestli se něco změnilo.

## 1.5.2 – 2026-09-21

Vedle názvu vlevo nahoře je teď malé číslo verze, takže je hned vidět,
co zrovna běží.

## 1.5.1 – 2026-09-21

Opraveno silné blikání roje při oddálení, které přišlo s 1.5.0. Vzdálené
hvězdy teď kreslí jen svou záři a pevné jádro se ukáže až zblízka, kde je
opravdu vidět. Blikání kleslo zhruba desetkrát a galaxie přitom nepotemněla.

## 1.5.0 – 2026-09-21

Do políček u posuvníků jde napsat jakékoliv číslo – i víc, než kam dosáhne
posuvník, i záporné (například záporná rychlost oběhu točí roj opačně).
Počet těles nemá horní hranici; když se nevejde do paměti, zůstane tolik,
kolik se vešlo, a políčko to ukáže.

Opraveno: od verze 1.3.0 se tělesům nekreslilo pevné jádro, viditelná byla
jen záře kolem. Hvězdy teď mají zase jasný střed a planety jsou konečně
vidět jako šedé kuličky. Záře kolem jasných hvězd už nemá hranaté okraje.

## 1.4.1 – 2026-09-21

V odpojené kameře kolečko myši letí, místo aby přibližovalo. Kamera se posune
dopředu nebo dozadu i s bodem, kolem kterého se otáčí, takže se dá proletět
skrz roj. S kamerou na střed kolečko přibližuje jako dřív.

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
