# Sicurezza

Le correzioni vengono sviluppate sulla versione più recente; non sono mantenuti
rami distinti per ogni release precedente.

## Segnalazione riservata

Per esposizione di credenziali, dati o esecuzione di codice contatta il proprietario
**GioMocchi03** attraverso il canale privato concordato al momento dell'invito.
Se non ne hai uno, chiedi un contatto riservato in un'issue senza dettagli sensibili.
Anche un'issue nella repository privata può essere letta dagli altri collaboratori.
La segnalazione privata GitHub non è presupposta disponibile per questo account.
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
