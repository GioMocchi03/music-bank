# Accesso e distribuzione

La repository `GioMocchi03/music-bank` è pubblica. Codice, documentazione, workflow
e release APK possono essere consultati senza un account GitHub.

## Download

Aprire la pagina [Releases](https://github.com/GioMocchi03/music-bank/releases),
scegliere l'ultima versione e scaricare dagli **Assets** il file `.apk` insieme al
relativo `.apk.sha256`. Gli archivi automatici **Source code** non sono APK.

Dal terminale:

```bash
gh release download --repo GioMocchi03/music-bank --pattern '*.apk' --pattern '*.sha256'
```

Non incorporare token GitHub nell'app, negli URL condivisi o nei file di configurazione.

## Collaborazione

La visibilità pubblica consente lettura e fork, ma non concede il permesso di scrivere
direttamente sul repository. Modifiche esterne arrivano tramite pull request e restano
soggette a revisione. I collaboratori con accesso diretto devono essere aggiunti soltanto
dal proprietario e con i permessi minimi necessari.

## Controlli e costi

CI, Gitleaks e Dependabot controllano il progetto senza unione automatica delle modifiche.
La compilazione Android in Actions resta manuale e non contiene le chiavi di firma.

Fonti: [permessi di accesso GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository),
[visibilità delle repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
