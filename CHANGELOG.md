# Changelog

Release pubbliche: [GitHub Releases](https://github.com/GioMocchi03/music-bank/releases).
Il numero di build Android è distinto dalla versione leggibile.

## Aggiornamento OTA su 1.3.20 — 2026-11-12

### Corretto

- La ricerca non mostra più come artisti le collaborazioni dei singoli brani
  (per esempio «L'Entourloop, LMK») che Navidrome restituisce con 0 album e una
  pagina vuota. I loro brani restano tra i risultati «Brani».

## 1.3.20 — 2026-11-09 · build 34

### Sicurezza

- Android Auto e gli altri controller multimediali ricevono le copertine come
  indirizzi locali `content://` opachi, non più come URL Navidrome con utente,
  token e salt. L'app scarica l'immagine quando viene richiesta e la tiene in una
  cache locale separata per utente; al logout cancella cache e URL autenticati.

### Migliorato

- La Home sceglie il suggerimento dai metadati e dalla cronologia locali, senza
  aspettare tutte le tracce. Durante il ripristino non mostra più «Collega
  Navidrome» né il primo album alfabetico come suggerimenti provvisori.
- Il primo passaggio tra Libreria, Ricerca e Impostazioni non avvia più la
  normalizzazione di tutti i brani in un unico blocco. Ricerca, preferiti, anni e
  lookup dei brani vengono preparati insieme, a piccoli blocchi fuori dal render,
  e riutilizzati quando si cambia scheda.
- Anche i filtri di ricerca cedono il thread tra i blocchi e vengono annullati
  quando si lascia la scheda o si cambia query; i risultati remoti restano visibili
  se terminano prima di quelli locali.
- Il ripristino della libreria cede il controllo tra i file delle tracce e completa
  le copertine per blocco, senza una seconda scansione sincrona di tutti i brani.

### Build

- Gli APK delle release vengono compilati sul runner GitHub con EAS locale,
  senza consumare la quota build Expo e mantenendo la firma ufficiale. Il rilancio
  manuale può verificare un APK senza pubblicarlo; EAS cloud resta selezionabile.
- Le verifiche Android delle PR compilano e testano su GitHub; la preview EAS
  cloud aggiuntiva parte solo se richiesta manualmente, non a ogni push.

## 1.3.19 — 2026-11-06 · build 33

Include tutte le novità della 1.3.18, che non è mai stata pubblicata come APK.

### Migliorato

- Avvio più reattivo: il catalogo Android Auto non viene più rigenerato a ogni apertura,
  ma solo dopo una sincronizzazione o quando cambiano account, libreria o formato.
- I link del catalogo Auto condividono un solo token invece di uno per brano, e la
  generazione cede il passo all'interfaccia tra un blocco e l'altro.
- Il servizio Android Auto legge il catalogo in background e una sola volta per ogni
  scrittura, invece di due volte sul thread grafico.
- Lo stato del player non ridisegna più l'app quando non cambia nulla, e la coda viene
  riallineata solo quando cambia davvero.
- L'indice di ricerca viene costruito alla prima ricerca e la sincronizzazione rilegge
  la libreria salvata una volta sola.
- I tempi di avvio compaiono anche nei log della build release (`[startup]`).

### Corretto

- La release automatica scarica l'APK da EAS con le credenziali, aspetta fino a 120
  minuti per le code serali, rispetta il tag scelto nel rilancio manuale, blocca APK
  firmati con un certificato diverso da quello ufficiale e usa queste note.
- L'aggiornamento OTA automatico non parte più quando il codice nativo è cambiato
  rispetto all'ultima release o quando la nuova versione non ha ancora un APK.

### Verificato

- Typecheck, test di unità, test JVM del catalogo Auto e compilazione Kotlin di debug.
  Tempi di avvio e Android Auto vanno ancora provati su telefono e auto reali.

## 1.3.18 — 2026-11-05 · build 32

### Aggiunto

- Android Auto ora rispecchia la Libreria del telefono: accanto ad Album, Artisti e Brani
  compare la sezione **Raccolte** con Generi musicali, Preferiti, Playlist, Radio Internet
  e Anni, nei limiti dei quattro pannelli consentiti da Android Auto.
- Le stazioni radio del server sono riproducibili direttamente da Android Auto.
- Il catalogo Auto include playlist e anni (versione 3); i contenuti delle playlist
  restano disponibili anche quando una sincronizzazione non raggiunge il server.

### Migliorato

- Toccando un brano dentro una playlist o la lista radio, la coda segue quel contenitore
  invece dell'album, come avviene nell'app.

### Corretto

- Riferimenti a Expo aggiornati alla versione 58 in README, AGENTS.md e messaggi degli strumenti.
- Il workflow di verifica Android Auto torna a partire su `main` e sulle pull request.
- Rimosso lo strumento di patch di expo-audio non più usato: l'equalizzatore lavora sulla
  sessione audio di ExoPlayer.

### Verificato

- Typecheck, test di unità e test JVM del catalogo Auto superati; compilazione Kotlin
  di debug superata. La prova su un host Android Auto reale resta necessaria.

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
