# Guida all'app

## Server e Home

**Collega server** apre il modulo di accesso. Inserisci indirizzo, utente e password,
connetti e sincronizza. Senza protocollo viene aggiunto HTTPS. Le funzioni disponibili
dipendono dalle API implementate dal server.

Il saluto usa l'account autenticato: buongiorno 05:00–11:59, buon pomeriggio
12:00–17:59, buonasera altrimenti. Il banner cambia all'apertura/ritorno nell'app
fra gli artisti più ascoltati secondo i dati disponibili; senza cronologia usa la
libreria. Un catalogo piccolo non può sempre offrire un artista diverso.

## Ascolto

Apri un brano o Riproduci tutto su una raccolta. Il mini player riapre player e coda.
Lo streaming richiede il formato originale: codec e riproducibilità dipendono da
file, server e dispositivo. Le radio Internet vengono aperte tramite un'app esterna.

## Playlist

Apri **Libreria → Playlist** e usa **Nuova playlist** per creare una raccolta nel
tuo account Navidrome. L'app mostra separatamente **Le mie playlist**, modificabili,
e **Dal server e condivise**, che comprende playlist di altri proprietari, pubbliche
o importate. Le API Subsonic non indicano la cartella fisica di origine, quindi la
separazione usa il proprietario restituito dal server.

Dal menu di un brano, **Aggiungi alla playlist** mostra soltanto le playlist del tuo
account: il protocollo consente di modificare esclusivamente quelle di cui sei
proprietario. Se il server nega la creazione, verifica che l'utente abbia il ruolo
playlist nelle autorizzazioni Navidrome.

## Offline

- Menu brano → **Scarica per ascolto offline**.
- Album/playlist → comando di download della raccolta. Il conteggio riguarda brani
  unici; quelli già disponibili non vengono riscaricati.
- La coda è seriale. Offline mostra attesa, avanzamento o errore; **Riprova** riguarda
  i brani mancanti, non garantisce la ripresa byte per byte di un file parziale.
- L'icona download evidenziata nelle liste e nel player identifica i file completati.
- **Rimuovi dal dispositivo** elimina soltanto la copia locale.

Mantieni l'app aperta durante i download: la coda non è un servizio persistente del
sistema e non è garantita dopo chiusura forzata o sospensione. Un file diventa
disponibile solo dopo controllo e salvataggio.

Offline mostra numero brani, spazio e filtro album/artista. Prova l'ascolto senza
rete aprendo un download completato da questa sezione. Immagini e metadati remoti
non sono necessariamente disponibili senza server.

## Disconnessione

In impostazioni server usa **Disconnetti dal server** e conferma. Credenziali,
catalogo e sessione vengono rimossi; i download restano. Il comando è disabilitato
durante sincronizzazione/download. Per cancellare anche i file usa Offline.

Le copie sono distinte per server/account: un download di un account precedente
non viene inviato al nuovo server per preferiti, playlist o streaming con lo stesso ID.

## Android Auto

È incluso un servizio Media3 con catalogo dedicato. Sincronizza prima del collegamento.
Non presumere che i download dell'app siano disponibili anche nel servizio Auto:
questa integrazione offline richiede un lavoro separato. La 1.3.7 non è ancora
stata collaudata su auto reali durante questo rilascio.
