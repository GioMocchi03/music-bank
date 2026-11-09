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

## Altre piattaforme e controlli

L'export iOS verifica il bundle, non Xcode o una IPA. La cartella iOS non è mantenuta:
occorre predisporre e testare un progetto dedicato su macOS. Web non supporta download
nativi/Android Auto e richiede CORS corretto sul server.

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
