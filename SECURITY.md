# Sicurezza

Le correzioni vengono sviluppate sulla versione più recente; non sono mantenuti
rami distinti per ogni release precedente.

## Segnalazione riservata

Per esposizione di credenziali, dati o esecuzione di codice usa
**[Security → Report a vulnerability](https://github.com/GioMocchi03/music-bank/security/advisories/new)**.
Non aprire issue pubbliche con dettagli sfruttabili. Se la segnalazione privata non
è disponibile, chiedi un canale riservato in un'issue senza dettagli sensibili.
Non sono promessi SLA o premi.

Indica versione, piattaforma, impatto e riproduzione con dati fittizi. Non allegare
password, token, URL autenticati, storage locale o chiavi di firma.

## Manutenzione

- Non commettere `.env`, `credentials.json`, keystore release o cataloghi utente.
- `android/app/debug.keystore` è esclusivamente la chiave pubblica di sviluppo.
- La firma release resta separata dal repository e non viene passata a PR/CI.
- Token con permessi minimi; niente codice di fork con segreti o auto-merge.
- Verificare firma e checksum prima di pubblicare l'APK.
- Un segreto esposto va revocato/ruotato: cancellare il file non annulla la fuga.

Vedi [privacy](docs/PRIVACY.md) e [rilasci](docs/RELEASING.md).
