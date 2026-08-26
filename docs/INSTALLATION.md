# Installazione e aggiornamenti Android

## Requisiti e installazione

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

Notifiche GitHub: **Watch → Custom → Releases**. Non c'è un updater nell'app né
aggiornamenti JavaScript OTA abilitati. I download locali non sono un backup.

## Verifica del file

Ogni APK ha un file `.apk.sha256`. Per la 1.3.7 build 21:

```powershell
Get-FileHash .\MusicBank-1.3.7-build21.apk -Algorithm SHA256
```

```bash
sha256sum -c MusicBank-1.3.7-build21.apk.sha256
```

SHA-256 atteso:

```text
fb3438f80651053342b2a06b849ff21b2e2eb1dd4eb78669a3889be4571c9c15
```

Con Android Build Tools è possibile controllare anche la firma:

```bash
apksigner verify --verbose --print-certs MusicBank-1.3.7-build21.apk
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
