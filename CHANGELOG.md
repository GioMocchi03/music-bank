# Changelog

Release pubbliche: [GitHub Releases](https://github.com/GioMocchi03/music-bank/releases).
Il numero di build Android è distinto dalla versione leggibile.

## 1.3.12 — 2026-10-30 · build 26

### Migliorato

- Lo swipe della coda e della libreria non mostra più pannelli verde/rosso sovrapposti ai dati del brano.
- Il feedback del gesto è ora un movimento breve e neutro della riga.
- Le bande dell'equalizzatore hanno un'area tattile più ampia e seguono lo spostamento verticale del dito.

### Verificato

- Manifest, catalogo Media3, ricerca e controlli di riproduzione Android Auto verificati staticamente e compilati nella build Android.
- La prova su un host Android Auto reale o Desktop Head Unit resta necessaria.

## 1.3.11 — 2026-10-30 · build 25

### Aggiunto

- Svuotamento dei brani in attesa senza interrompere quello corrente e rimozione dei singoli brani con swipe verso destra.
- Swipe verso destra sulle tracce della libreria per aggiungerle alla coda.
- Azione “Riproduci subito dopo” nel menu dei tre puntini.
- Equalizzatore Android integrato a bande verticali, disattivabile e persistente.

### Audio

- L'equalizzatore è disattivato per impostazione predefinita.
- Quando è disattivato non vengono applicate bande o altri effetti al flusso originale.
- Nessuna normalizzazione, bass boost o elaborazione aggiuntiva viene attivata automaticamente.

## 1.3.10 — 2026-10-30 · build 24

### Aggiunto

- Azione “Aggiungi alla coda” nel menu di ogni brano.
- Riordino della coda tramite trascinamento, mantenendo il brano corrente.
- Apertura del pannello equalizzatore di sistema sui dispositivi Android compatibili.

### Corretto

- Il comando equalizzatore ora apre una schermata esplicita e segnala quando il dispositivo non offre un pannello compatibile.
- La coda non viene sostituita quando un singolo brano viene aggiunto in fondo.

### Limiti

- Expo Audio 57 non espone l'ID della sessione Android: disponibilità e applicazione degli effetti dipendono dal pannello audio del produttore.
- iOS e web non dispongono di un equalizzatore collegabile al player tramite Expo Audio.

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
