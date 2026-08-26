<div align="center">
  <img src="assets/icon.png" alt="Music Bank" width="112" />
  <h1>Music Bank</h1>
  <p><strong>La tua libreria musicale. Il tuo server. Anche offline.</strong></p>
  <p>Client indipendente per Navidrome e server compatibili Subsonic / OpenSubsonic.</p>
  <p>
    <a href="https://github.com/GioMocchi03/music-bank/releases/latest">Scarica per Android</a> ·
    <a href="docs/USER_GUIDE.md">Guida all'app</a> ·
    <a href="docs/DEVELOPMENT.md">Sviluppo</a> ·
    <a href="https://github.com/GioMocchi03/music-bank/issues">Segnala un problema</a>
  </p>
  <p>
    Android 7+ · <a href="LICENSE">MIT</a> · Distribuzione privata
  </p>
</div>

## Cos'è

Music Bank permette di navigare e ascoltare la musica conservata sul proprio server,
con libreria sincronizzata, player con coda e download sul dispositivo. Non fornisce
musica o un server incluso: servono un server compatibile, un account e contenuti
che si è autorizzati ad ascoltare.

**English:** Music Bank is an independent Navidrome / Subsonic music client built with
Expo, React Native and TypeScript. Android APKs are available through
[GitHub Releases](https://github.com/GioMocchi03/music-bank/releases/latest).
The main documentation is currently in Italian.

## Scarica e aggiorna

**Repository privata:** devi accedere a GitHub con un account autorizzato dal
proprietario. Anche le Releases e gli APK sono riservati; il solo link non dà accesso.
Per inviti e permessi vedi [gestione accessi](docs/ACCESS.md).

1. Apri **[l'ultima release](https://github.com/GioMocchi03/music-bank/releases/latest)**.
2. In **Assets**, scarica `MusicBank-<versione>-build<numero>.apk`.
3. Apri il file su Android e autorizza, se richiesto, l'installazione da quella sorgente.
4. Per aggiornare una release ufficiale, installa il nuovo APK **senza disinstallare
   l'app**. La firma deve essere la stessa.

Gli archivi **Source code** sono sorgenti, non l'app da installare. Ogni release include
note e checksum SHA-256. Per le notifiche: **Watch → Custom → Releases** su GitHub.
Gli aggiornamenti sono manuali: non c'è un updater automatico nell'app.
Vedi [installazione e problemi comuni](docs/INSTALLATION.md).

## Funzioni

| Area | Disponibile |
| --- | --- |
| Libreria | Album, artisti, tracce, generi, anni, playlist, preferiti e ricerca locale/remota tollerante agli errori. |
| Ascolto | Streaming richiesto nel formato originale, player, coda, cronologia e scrobbling. I codec dipendono dal dispositivo. |
| Offline | Download di brani, album e playlist; avanzamento, retry, conteggio e icona evidenziata per i file completati. |
| Spazio | Numero brani, spazio occupato, filtro album/artista e rimozione delle copie locali. |
| Home | Nome autenticato, saluto in base all'ora e banner variabile fra gli artisti più ascoltati secondo i dati disponibili. |
| Server | HTTPS automatico negli URL senza protocollo; disconnessione esplicita che conserva i download. |
| Android Auto | Servizio nativo Media3 per la libreria; da verificare su auto/dispositivi reali. |

## Piattaforme e stato

| Piattaforma | Stato |
| --- | --- |
| Android | APK release; Android 7 / API 24 o superiore. ARM64, ARM 32 bit, x86 e x86_64. |
| Web | Interfaccia per sviluppo/verifica; niente download nativi o Android Auto. Il server deve consentire CORS. |
| iOS | Sorgenti condivisi ed export JavaScript verificati; nessuna IPA o pubblicazione App Store. Serve un build iOS dedicato. |

La **1.3.7 (21)** ha superato compilazione Android, TypeScript, 33 test automatici
e verifiche UI web con dati simulati. **Non è ancora stata collaudata su telefono
o auto reali durante questo rilascio.** Vedi [verifiche e limiti](docs/releases/1.3.7.md).

## Primo accesso

Apri **Collega server**, inserisci indirizzo (ad esempio `music.example.org`), utente
e password, quindi connetti e sincronizza. Senza protocollo viene aggiunto `https://`;
non viene effettuato un ripiego automatico su HTTP.

L'icona download evidenziata indica una copia completata. Dopo il logout i file
conservati restano in **Offline**. Disinstallare o cancellare i dati dell'app elimina
anche i download: non sono un backup della libreria.

## Sviluppo

Requisiti: Node.js **24 LTS**, npm e Git. Per Android: JDK 17 e SDK/NDK Android.

```bash
git clone https://github.com/GioMocchi03/music-bank.git
cd music-bank
npm ci
npm run check
npm run web
```

| Comando | Scopo |
| --- | --- |
| `npm run check` | Versioni coerenti, TypeScript e test. |
| `npm run doctor` | Diagnostica Expo, separata dai test deterministici. |
| `npm run export:check` | Export Android, iOS e web. |
| `npm run android` | Avvio Android in sviluppo. |
| `npm run build:android` | Release Android locale non firmata. |

**Non eseguire `expo prebuild --clean`:** `android/` contiene personalizzazioni
Android Auto, backup e integrazioni native che devono restare versionate.

- [Ambiente e build](docs/DEVELOPMENT.md) · [Architettura](docs/ARCHITECTURE.md)
- [Procedura release](docs/RELEASING.md) · [Changelog](CHANGELOG.md)
- [Contribuire](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

## Privacy, supporto e licenza

Credenziali native in SecureStore; file offline nello spazio privato dell'app.
Il logout conserva i download. Il web ha garanzie differenti: [privacy](docs/PRIVACY.md).
Per bug usa gli [Issue](https://github.com/GioMocchi03/music-bank/issues), senza segreti
o URL autenticati. Per vulnerabilità segui [SECURITY.md](SECURITY.md).

Licenza [MIT](LICENSE); le dipendenze mantengono le proprie
[licenze e attribuzioni](THIRD_PARTY_NOTICES.md). Music Bank non è affiliata a
Navidrome, Subsonic, OpenSubsonic o Google.
