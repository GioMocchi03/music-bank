# Pubblicare un aggiornamento

La strada normale è automatica: un tag `vX.Y.Z` avvia
`.github/workflows/release.yml`, che compila l'APK sul runner Linux di GitHub con
`eas build --local` (profilo `release`), controlla che il certificato coincida con `certificateSha256` di
`release.config.json` e pubblica la release con le note di `docs/releases/X.Y.Z.md`.
Non usa la coda né la quota di build cloud Expo. I runner standard di GitHub sono
gratuiti per questa repository pubblica; lo storage di artifact e cache ha limiti
separati. Non sono necessari runner a pagamento o un nuovo abbonamento.

Serve ancora `EXPO_TOKEN` nei repository secrets: EAS lo usa per verificare il
progetto e recuperare il keystore già configurato, non per compilare nel cloud.
La build locale congela le credenziali (`--freeze-credentials`): non deve creare
o sostituire chiavi. La verifica del certificato resta obbligatoria prima di
salvare o pubblicare l'APK. Nessuna chiave viene passata ai workflow di PR.

In *Run workflow* indicare un tag esistente e scegliere `builder: github` (default).
Disabilitare `publish` per una prova: APK firmato e checksum vengono conservati
come artifact per tre giorni senza modificare la release pubblica. Il builder
`eas` resta selezionabile manualmente, ma consuma la quota Expo.

Le PR continuano a compilare Kotlin, eseguire i test JVM e generare un APK debug
su GitHub senza credenziali Expo. L'APK debug richiede Metro e non aggiorna una
release ufficiale. La preview EAS cloud è opzionale: si avvia solo manualmente
dal workflow Android Auto selezionando `eas_preview`, mai a ogni push o PR.

Riferimenti: [build EAS locali](https://docs.expo.dev/build-reference/local-builds/)
e [limiti GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Ogni push su `main` pubblica anche un aggiornamento OTA (`eas-update.yml`), tranne
quando `runtimeVersion` non ha ancora un APK pubblicato o quando `android/`, `modules/`
o `package-lock.json` sono cambiati rispetto all'ultima release GitHub con APK: quel codice richiede un
nuovo APK. In quel caso aumentare versione, `versionCode` e `runtimeVersion` e creare il tag.

Il procedimento manuale qui sotto resta valido come alternativa.

La repository e le release sono **pubbliche**. Gli APK ufficiali sono scaricabili
senza login dalla pagina delle release; non includere credenziali o dati privati.

## 1. Preparare il sorgente

Aggiornare `package.json`, le due versioni root in `package-lock.json`, `app.json`,
`android/app/build.gradle` e il testo della versione in `App.tsx`. Incrementare
sempre `versionCode` rispetto alla precedente release. Aggiungere changelog e
`docs/releases/<versione>.md`, con prove e limitazioni realmente verificate.

```bash
npm ci
npm run check
npm run export:check
npm run build:android
```

Eseguire test su telefono: aggiornamento sopra la precedente release, login/logout,
download brano/album/playlist, rete disattivata, cambio account e Android Auto se
coinvolto. Indicare esplicitamente le prove mancanti, senza dichiararle superate.

## 2. Firma locale

Usare lo stesso keystore ufficiale delle versioni precedenti. Conservare chiave e
password fuori dalla repository, con permessi limitati e backup sicuro separato.
Non usare la chiave debug e non generare una nuova chiave per aggiornare l'app.

Con Android Build Tools, allineare prima di firmare:

```bash
zipalign -P 16 -f 4 app-release-unsigned.apk app-release-aligned.apk
apksigner sign --ks /percorso/privato/keystore.jks --ks-key-alias ALIAS --out app-release-signed.apk app-release-aligned.apk
```

Inserire le password ai prompt oppure tramite variabili d'ambiente temporanee:
mai in argomenti, file versionati o log. Non passare chiavi ai workflow di PR.

## 3. Preparare gli allegati verificati

Su PowerShell (con Java e Node sul PATH):

```powershell
./tools/prepare-release.ps1 -Apk /percorso/app-release-signed.apk -BuildTools /percorso/android-sdk/build-tools/36.0.0
```

Il comando controlla firma ufficiale, versione/package, assenza di debug e allineamento.
Copia APK, checksum e `release.json` in `release-output/<versione>/` (ignorata da Git).
L'impronta pubblica del certificato è in `release.config.json`; non contiene segreti.
Il checksum identifica il binario pubblicato, non promette build identiche bit per bit.

## 4. Tag e release

Commettere e inviare il sorgente su `main`; attendere CI e Gitleaks verdi. Rivedere
anche CodeQL se è stato abilitato su una repository con licenza idonea.
Controllare che il commit corrisponda esattamente al sorgente usato per l'APK.
Non spostare tag già pubblicati e non sostituire silenziosamente un APK esistente.

Esempio per questa versione (aggiornare numeri e nomi per la successiva):

```bash
git tag -a v1.3.7 -m "Music Bank 1.3.7 (21)"
git push origin v1.3.7
gh release create v1.3.7 --verify-tag --draft --title "Music Bank 1.3.7 (build 21)" --notes-file docs/releases/1.3.7.md release-output/1.3.7/MusicBank-1.3.7-build21.apk release-output/1.3.7/MusicBank-1.3.7-build21.apk.sha256 release-output/1.3.7/release.json
```

Rivedere la bozza, verificare tutti gli allegati e scaricare una copia per confrontarne
il checksum. Pubblicare solo dopo il controllo:

```bash
gh release edit v1.3.7 --draft=false --latest
```

Per una versione sperimentale usare una prerelease, senza renderla latest.
Il collegamento stabile per gli utenti è `/releases/latest`; gli Assets contengono
APK e checksum. Il controllo integrato usa l'API GitHub con un token personale
fornito dall'utente e non deve mai includere credenziali nell'APK.

## Checklist

- [ ] Versioni coerenti, commit e tag corretti; nessun segreto nei sorgenti.
- [ ] Test ed export superati; prova Android reale o limite dichiarato.
- [ ] Firma e checksum verificati; file installabile con nome corretto.
- [ ] Note complete e senza dati privati; nessuna funzione non verificata spacciata per pronta.
- [ ] Download dalla release verificato, non solo upload riuscito.
- [ ] Nessuna chiave privata negli Assets o in GitHub Secrets.
