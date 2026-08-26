# Sviluppo

## Ambiente

Expo SDK 57, React Native 0.86.2, React 19.2.3, TypeScript 6, Hermes su Android.
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

## Altre piattaforme e controlli

L'export iOS verifica il bundle, non Xcode o una IPA. La cartella iOS non è mantenuta:
occorre predisporre e testare un progetto dedicato su macOS. Web non supporta download
nativi/Android Auto e richiede CORS corretto sul server.

- CI push/PR: versioni, TypeScript, test ed export multipiattaforma.
- Build Android manuale in Actions: release non firmata, senza chiavi private.
- CodeQL: analisi JavaScript/TypeScript e workflow.
- Dependabot: aggiornamenti da rivedere, senza auto-merge. Expo/React Native devono
  essere aggiornati in modo coordinato.

I test Node usano adapter simulati: non sostituiscono prove Android di file system,
rete, background audio e Auto. Nelle PR dichiarare esattamente cosa è stato testato.

Riferimenti: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[Android SDK](https://developer.android.com/studio),
[OpenSubsonic](https://opensubsonic.netlify.app/docs/).
