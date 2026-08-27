# Installazione e aggiornamenti Android

## Requisiti e installazione

Questa distribuzione è privata. Accedi a GitHub con l'account invitato e accetta
l'invito del proprietario. Un errore 404 può indicare che non sei autenticato o
autorizzato, anche se il link è corretto. APK e aggiornamenti seguono gli stessi
permessi della repository: non esiste un link anonimo pubblico.

Android 7 / API 24 o superiore, spazio libero, server compatibile e account valido.
Usare HTTPS con certificato valido; omettere il protocollo abilita HTTPS, non HTTP.
Scaricare l'APK dalle [Releases ufficiali](https://github.com/GioMocchi03/music-bank/releases).
In **Assets** scegliere `.apk`, non gli archivi dei sorgenti. Android può chiedere
di consentire l'installazione al browser/gestore file: non occorre disabilitare
globalmente le protezioni del telefono.

## Aggiornamento

Installare sopra la versione precedente: package e certificato devono corrispondere
e il numero di build deve aumentare. Non disinstallare per risolvere un errore senza
considerare la perdita di dati locali e download. Un APK di sviluppo o firmato da
terzi non può aggiornare direttamente la release ufficiale.

Notifiche GitHub: **Watch → Custom → Releases**. Dalla 1.3.8 l'app può controllare
la release privata con un token fine-grained `Contents: read` salvato nel SecureStore;
il download si apre nel browser autenticato. Non sono abilitati aggiornamenti
JavaScript OTA. I download locali non sono un backup.

## Verifica del file

Ogni APK ha un file `.apk.sha256`. Per la 1.3.8 build 22:

```powershell
Get-FileHash .\MusicBank-1.3.8-build22.apk -Algorithm SHA256
```

```bash
sha256sum -c MusicBank-1.3.8-build22.apk.sha256
```

SHA-256 atteso:

```text
68206d38fd6252b715a0f3229a6801dd856459b9f2c008433a84e0f0fac2060a
```

Con Android Build Tools è possibile controllare anche la firma:

```bash
apksigner verify --verbose --print-certs MusicBank-1.3.8-build22.apk
```

SHA-256 del certificato ufficiale:

```text
f01a5a2a6113034b1ac6381197e8a0b9a83f2f7b0840f276ed5f5fca2dc68fed
```

Il checksum identifica un file integro: scaricarlo dalla stessa release ufficiale.

## Problemi comuni

| Problema | Verifica |
| --- | --- |
| Server irraggiungibile | Indirizzo, porta, sottopercorso, rete/VPN e certificato. Non aggiungere `/rest` manualmente. |
| Accesso negato | Credenziali e permessi dell'account sul server. |
| Solo il browser non si collega | Configurazione CORS e contenuti misti; non disattivare le protezioni del browser. |
| Download fallito | Rete, spazio e risposta del server. Riprova; un file parziale non deve avere l'icona evidenziata. |
| Aggiornamento rifiutato | File completo, spazio, versione/build e firma. Non disinstallare automaticamente. |
| Android Auto non mostra l'app | Compatibilità del sistema e politiche per app esterne allo store; non è garantito su ogni auto. |

Nelle issue indicare versione/build, modello, Android e passi riproducibili.
Rimuovere password, token, URL autenticati e informazioni personali dagli allegati.
