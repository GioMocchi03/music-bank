# Changelog

Release pubbliche: [GitHub Releases](https://github.com/GioMocchi03/music-bank/releases).
Il numero di build Android è distinto dalla versione leggibile.

## 1.3.9 — 2026-08-27 · build 23

### Corretto

- “Le mie playlist” contiene soltanto playlist create dall'app per lo specifico server/account.
- Le raccolte del server che duplicano un album completo vengono escluse dalle playlist.
- Playlist server e cartelle album non sono più modificabili in base al solo campo `owner`.

### Migliorato

- Il controllo aggiornamenti usa la release pubblica senza richiedere account o token GitHub.
- Gli ID delle playlist create dall'app vengono conservati localmente senza password.

## 1.3.8 — 2026-08-27 · build 22

### Aggiunto

- Creazione di playlist personali direttamente dalla Libreria.
- Playlist separate tra quelle modificabili dall’account e quelle provenienti dal server o condivise.
- Aggiunta dei brani limitata alle playlist di cui l’utente collegato è proprietario.
- Rinomina, descrizione, visibilità, riordino, rimozione brani ed eliminazione delle playlist personali.
- Controllo delle release GitHub private con token opzionale conservato nel SecureStore.

### Sicurezza

- Nessun token GitHub è incluso nell’APK, nei link, nei log o nella repository.
- Il download apre la release privata nel browser, che richiede un account autorizzato.

## 1.3.7 — 2026-08-26 · build 21

### Aggiunto

- Download album/playlist con coda seriale, conteggi e retry dei mancanti.
- Icona download evidenziata nelle liste, coda e player.
- Offline con quantità, spazio e filtro album/artista.
- Disconnessione con conferma che conserva le copie locali.
- Saluto in base all'ora/account e selezione variabile del banner.

### Corretto

- Rimosso il nome fisso nella Home e prima del login.
- Collega server apre direttamente il modulo; HTTPS automatico negli URL.
- Eliminato il duplicato Media provider in Sync manager.
- File incompleti/troncati non risultano scaricati.
- Download distinti per server/account e pulizia delle credenziali legacy al logout.
- Riproduzione locale senza connessione al server.

### Distribuzione

- Prima pubblicazione GitHub con guide, CI e procedura release.
- APK con lo stesso certificato della precedente build 20.
- [Verifiche e limiti](docs/releases/1.3.7.md).

Non viene ricostruita una cronologia non verificabile delle versioni precedenti.
La 1.3.6 build 20 era stata distribuita prima di questa repository.
