# Sviluppo

## Ambiente

Expo SDK 58, React Native 0.88.1, React 19.3.0, TypeScript 6, Hermes su Android.
Usare Node.js 24 LTS (`.nvmrc`) e `npm ci` per rispettare il lockfile.

```bash
npm ci
npm run check
npm run web
```

`check` verifica versioni, tipi e test; `doctor` è la diagnostica Expo e può richiedere
rete; `export:check` esporta Android/iOS/web in `.codex-export-check`, non versionata.
`node tools/mock-subsonic-server.mjs` avvia un mock locale, non un backend di produzione.
Usare dati fittizi nelle fixture e non esporre il mock in rete pubblica.

## Android

JDK 17, SDK Platform 36, Build Tools 36.0.0 e 35.0.0, NDK 27.1.12297006,
CMake 3.22.1. Gradle 9.3.1 è incluso tramite wrapper. Accettare le licenze SDK.

```bash
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "build-tools;35.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
npm run android
```

Configurare `JAVA_HOME`, `ANDROID_HOME` e Node sul PATH. `android/local.properties`
può contenere `sdk.dir` locale ma non deve essere commesso.

```bash
npm run build:android
```

Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`, **non firmato
e non destinato agli utenti**. Distribuzione: [RELEASING.md](RELEASING.md).

`android/` è sorgente mantenuto: non eseguire `expo prebuild --clean`. Riportare le
modifiche Android di `app.json` anche nel progetto nativo e controllare entrambi.

### Windows

Usare un SDK/NDK senza spazi nel percorso, ad esempio `C:\Android\Sdk`: CMake può
abbreviare `clang++.exe` e compromettere il collegamento C++. Non mischiare unità
reali e alias `subst` per i sorgenti React Native (errore "different roots").
Il build locale iniziale usa sorgenti sul percorso reale e alias senza spazi solo
per l'SDK; non richiede patch alle dipendenze.

## App desktop Windows (Tauri)

La versione desktop esegue il frontend web condiviso in WebView2: non emula
l'APK e non usa i moduli nativi Android. Le correzioni alla Home, alla ricerca e
alla libreria condivisa sono incluse anche qui; Media3 e Android Auto restano Android.
La cache della libreria desktop usa IndexedDB, con migrazione dalla vecchia cache
AsyncStorage. L'equalizzatore desktop usa Web Audio; il server deve consentire CORS
anche per gli stream audio. I download nativi offline non sono disponibili su desktop.

Su Windows servono Node.js 24 LTS, Rust stable MSVC, Visual Studio Build Tools con
il carico di lavoro C++ e WebView2. Vedi i [prerequisiti Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run desktop
```

`desktop` avvia automaticamente Expo web su localhost:8081 e la finestra Tauri.
Per creare l'installer Windows:

```bash
npm run build:windows
```

Tauri rigenera prima `dist` con `export:desktop`, poi compila usando `Cargo.lock`.
L'installer NSIS si trova in `src-tauri/target/release/bundle/nsis/`.
La versione mostrata dall'app desktop viene letta da `package.json`.
Il workflow **Music Bank Windows** verifica l'app e costruisce l'installer su Windows;
l'artefatto **Music-Bank-Windows** si scarica dalla pagina del run in Actions.
L'installer non è firmato con un certificato Windows: SmartScreen può avvisare.
La build automatica non sostituisce una prova di installazione, login e ascolto su Windows.

## App desktop macOS (Tauri)

Usa lo stesso progetto `src-tauri` e lo stesso frontend web di Windows, eseguito
in WKWebView: valgono cache IndexedDB, equalizzatore Web Audio, CORS e assenza dei
download nativi descritti sopra. Il pacchetto è universale (Apple Silicon e Intel)
e richiede macOS 11 o superiore.

Su macOS servono Node.js 24 LTS, Rust stable con i target `aarch64-apple-darwin` e
`x86_64-apple-darwin` e gli strumenti da riga di comando di Xcode
(`xcode-select --install`).

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
npm run desktop
npm run build:macos
```

Il `.dmg` si trova in `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`.
Il workflow **Music Bank macOS** verifica l'app e costruisce il `.dmg` su un runner
macOS; l'artefatto **Music-Bank-macOS** si scarica dalla pagina del run in Actions.

Senza un account Apple Developer a pagamento l'app ha solo una firma ad hoc e non è
notarizzata. Dopo averla trascinata in **Applicazioni**, il primo avvio viene
bloccato: aprire **Impostazioni di Sistema → Privacy e sicurezza** e scegliere
**Apri comunque**. Se macOS indica che l'app è danneggiata, rimuovere la quarantena
del download (solo per un file scaricato dalle Actions ufficiali del repository):

```bash
xattr -dr com.apple.quarantine "/Applications/Music Bank.app"
```

La build automatica non sostituisce una prova di installazione, login e ascolto su macOS.

## App iOS

iOS usa la stessa app Expo di Android (`app.json`, bundle `io.servergio.giomusic`),
non il frontend desktop: streaming, coda, riproduzione in background con controlli
sulla schermata di blocco (expo-audio), download offline (expo-file-system), password
nel Keychain (SecureStore) e aggiornamenti OTA sul canale `production`. Android Auto,
il player Media3 e l'equalizzatore sono moduli nativi Android e non esistono su iOS.

`ios/` non è versionato: viene rigenerato da `app.json` con `expo prebuild --platform ios`
(senza `--clean`, che toccherebbe anche `android/`). Su un Mac con Xcode e CocoaPods:

```bash
npm ci
npx expo prebuild --platform ios
npm run ios
```

Il workflow **Music Bank iOS** genera il progetto su un runner macOS, imposta il canale
OTA in `Expo.plist`, compila in Release senza firma e carica l'artefatto
**Music-Bank-iOS** (`MusicBank-vX.Y.Z-ios-unsigned.ipa`).

Senza un account Apple Developer a pagamento la `.ipa` si firma sul proprio Mac con un
Apple ID gratuito, tramite [Sideloadly](https://sideloadly.io/) o
[AltStore](https://altstore.io/):

1. collegare l'iPhone al Mac e aprire la `.ipa` con Sideloadly/AltStore, accedendo
   con il proprio Apple ID;
2. sull'iPhone attivare **Impostazioni → Privacy e sicurezza → Modalità sviluppatore**
   e riavviare;
3. autorizzare il proprio Apple ID in **Impostazioni → Generali → VPN e gestione
   dispositivi**.

La firma gratuita scade dopo 7 giorni: reinstallare la stessa `.ipa` (AltStore può
rinnovarla automaticamente con AltServer attivo sulla stessa rete). Reinstallare sopra
l'app esistente conserva dati e download; eliminarla dall'iPhone li cancella.
Gli aggiornamenti OTA arrivano anche su iOS finché non cambia il codice nativo; una
nuova versione nativa richiede una nuova `.ipa`.
La build automatica non sostituisce una prova su iPhone reale.

## Altre piattaforme e controlli

Web non supporta download nativi/Android Auto e richiede CORS corretto sul server.

- CI push/PR: versioni, TypeScript, test ed export multipiattaforma.
- Build Android manuale in Actions: release non firmata, senza chiavi private.
- Gitleaks: controllo automatico della cronologia per individuare segreti.
- CodeQL: workflow predisposto ma disabilitato per impostazione predefinita. La
  repository pubblica può abilitarlo separatamente dopo averne verificato la configurazione.
  Nessun piano a pagamento viene attivato da questi workflow.
- Dependabot: aggiornamenti da rivedere, senza auto-merge. Expo/React Native devono
  essere aggiornati in modo coordinato.

I test Node usano adapter simulati: non sostituiscono prove Android di file system,
rete, background audio e Auto. Nelle PR dichiarare esattamente cosa è stato testato.

Riferimenti: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[Android SDK](https://developer.android.com/studio),
[OpenSubsonic](https://opensubsonic.netlify.app/docs/).
