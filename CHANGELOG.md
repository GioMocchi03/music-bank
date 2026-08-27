# Changelog

Release riservate agli account autorizzati: [GitHub Releases](https://github.com/GioMocchi03/music-bank/releases).
Il numero di build Android è distinto dalla versione leggibile.

## Non rilasciato

### Aggiunto

- Creazione di playlist personali direttamente dalla Libreria.
- Playlist separate tra quelle modificabili dall’account e quelle provenienti dal server o condivise.
- Aggiunta dei brani limitata alle playlist di cui l’utente collegato è proprietario.

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
