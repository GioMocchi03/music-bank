# Debug Android via USB su Windows

Configurazione verificata su Nothing A142P con Android 16: Music Bank 1.3.17 (31), Node 24.11.0, JDK 21 e Gradle 9.3.1.

## Preparazione

Usare Node 24 e installare le dipendenze dalla radice del repository con `npm ci`, incluse le dipendenze di sviluppo. Eseguire `npm run check`: verifica versioni, documentazione, TypeScript e test.

Selezionare un JDK 21 installato nelle impostazioni Gradle di Android Studio. Non committare percorsi personali come `org.gradle.java.home=C:\\...`. Conservare checksum e validazione URL nel wrapper Gradle già versionato.

## Avviare Metro

Da PowerShell nella radice del progetto:

```powershell
$env:NODE_OPTIONS='--dns-result-order=ipv4first'
npm start -- --localhost
```

Lasciare aperto il processo. La preferenza IPv4 evita che localhost sia risolto soltanto come `::1`, mentre il collegamento USB cerca il server su IPv4. Metro resta limitato al PC.

In un secondo PowerShell verificare:

```powershell
curl.exe --noproxy "*" http://127.0.0.1:8081/status
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
```

La risposta HTTP attesa è `packager-status:running`. Se manca, risolvere il server prima di rilanciare l'app. Non avviare più processi Metro sulla stessa porta.

## Collegare il dispositivo

Sostituire `SERIALE` con il dispositivo fisico elencato da ADB:

```powershell
& $adb -s SERIALE reverse tcp:8081 tcp:8081
& $adb -s SERIALE reverse --list
```

Con più dispositivi usare sempre `-s`. Selezionare lo stesso telefono nella barra Run di Android Studio e avviare `app`. Per vedere lo schermo aprire Running Devices, premere `+` e scegliere il telefono fisico.

## Diagnostica

Un errore di accesso ai socket da un ambiente isolato non dimostra un guasto ADB del PC: verificare da un terminale locale autorizzato. Non richiedere privilegi amministrativi come primo tentativo.

In Logcat usare `package:io.servergio.giomusic`. Raccogliere il messaggio iniziale e le righe `Caused by`, non soltanto la coda dello stack. Non cancellare i log prima di aver conservato l'errore.

## Verifica del 3 novembre 2026

- `npm run check`: superato, 67 test superati, zero falliti.
- Sul Nothing: bundle caricato, home, riproduzione con avanzamento, cambio brano e pausa verificati.
- Il proprietario ha successivamente confermato il buon funzionamento dell'app nel proprio collaudo.
- Qualità audio, Android Auto e tutti gli scenari offline/background non sono stati certificati dal collaudo automatico.
