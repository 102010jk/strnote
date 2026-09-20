# Android a iOS

Cíl: jedna kódová základna → web na GitHub Pages **a** reálná aplikace v launcheru
telefonu. Zvolená cesta je **Capacitor** – nativní projekt, který uvnitř renderuje
přes systémový WebView (WKWebView na iOS, Android WebView na Androidu).

Co to znamená prakticky: appka má vlastní ikonu, splash screen, jde do Google Play
i App Store, nemá adresní řádek a nespouští se přes prohlížeč. Renderuje ale webový
engine – kdyby to jednou nestačilo, alternativa je Flutter nebo React Native
(tam se ale three.js scéna píše znovu).

## Co už je hotové

| | |
|---|---|
| `manifest.webmanifest` | instalace na plochu, název, barvy, orientace |
| `icons/` | 192, 512, 512-maskable, apple-touch 180 – generuje `npm run icons` |
| `sw.js` | offline cache; registruje se jen na ostrém https webu |
| `src/core/pwa.js` | registrace SW + `isStandalone()` |
| `capacitor.config.json` | appId, název, `webDir: "www"`, barvy pozadí |
| `scripts/bundle.mjs` | `npm run bundle` → složka `www/` pro nativní obal |
| CSS | vypnuté označování textu, lupa a menu po přidržení prstu, safe-area odsazení |

## Proč `npm run bundle` a co dělá

Web na Pages tahá three.js z jsDelivr přes importmapu – to je pro web ideální,
ale pro appku ne, ze dvou důvodů:

1. **App Store, pravidlo 2.5.2** – aplikace nesmí stahovat a spouštět kód ze sítě.
   Načítání `three.module.js` z CDN za běhu je přesně to, co review hledá.
2. **Offline** – appka musí jet v letadle.

Skript proto vyrobí `www/`: zkopíruje web, projde importy (včetně těch, které si
addony tahají mezi sebou), stáhne všechny moduly three.js do `www/vendor/` a v kopii
`index.html` přepíše importmapu na lokální cesty. Struktura z CDN se zachová, takže
relativní importy mezi addony sedí samy.

`www/` je generovaná – je v `.gitignore` a nikdy se needituje ručně.

## Přechod na nativní appku

Zatím **není nainstalované nic** – projekt je připravený, ale bez npm závislostí.
Až přijde čas:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npm run bundle
npx cap add android
npx cap add ios
npx cap sync
```

Pak už jen `npm run bundle && npx cap sync` po každé změně webu.
Složky `android/` a `ios/` patří do repa – žijí v nich nativní nastavení.

## Co je potřeba rozhodnout dřív, než půjde první build do obchodu

- **`appId`** – teď je v configu placeholder `com.strnote.app`. Po vydání se už
  nedá změnit, na nové ID je to nová aplikace. Rozhodnout spolu s názvem.
- **Název aplikace** – co bude pod ikonou.
- **Účty** – Google Play Console (jednorázově 25 $), Apple Developer Program (99 $/rok).

## iOS z Windows

Xcode je jen na macOS, takže `.ipa` na téhle mašině nevznikne. Android ano.
Možnosti pro iOS:

- **GitHub Actions s macOS runnerem** – v repu už workflow je, přidá se druhý job.
  Pro veřejné repo zdarma.
- **Codemagic / Ionic Appflow** – hostovaný build pro Capacitor, free tier stačí.
- **Půjčený nebo vlastní Mac.**

Kostra jobu, až na to dojde:

```yaml
  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run bundle && npx cap sync ios
      - run: xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release
```

Podepisování (certifikáty, provisioning profily) se řeší až s Apple účtem.

## Na co si dát pozor v appce

- **Safe areas** – CSS už počítá s `env(safe-area-inset-*)`. Na iOS je nutný
  `viewport-fit=cover` v meta viewportu, ten tam je.
- **Odskakování scrollu** – v `capacitor.config.json` je pro iOS `scrollEnabled: false`,
  protože scéna je celoobrazovkový canvas. Až přibude scrollovatelný obsah, zapnout.
- **Výkon** – mobilní GPU utáhne míň než desktop. `App.js` stropuje `devicePixelRatio`
  na 2; bloom je na mobilu to nejdražší, počítat s tím, že půjde dolů.
- **Service worker** – v Capacitoru se záměrně neregistruje (`src/core/pwa.js`),
  soubory jsou tam lokálně už tak a cache by jen překážela při updatu.
- **Offline až od druhé návštěvy** – při úplně prvním otevření se service worker
  teprve instaluje a stránku ještě neřídí, takže three.js z CDN mu proteče mimo
  cache. Od druhého načtení je uložené všechno (ověřeno: 24 položek, z toho
  12 modulů three.js). Precachovat CDN moduly hned při instalaci by znamenalo
  natvrdo vypsat i tranzitivní závislosti addonů – křehké, nestojí to za to.
  V nativní appce tohle odpadá, tam je `vendor/` součástí balíku.
