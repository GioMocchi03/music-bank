# Privacy e dati

Descrizione del codice 1.3.8, non certificazione di sicurezza né informativa del server.

L'app contatta il server configurato per accesso, libreria, streaming, download,
preferiti, playlist e scrobbling. Il server può registrare account, IP e richieste.
URL audio/immagini possono contenere token; immagini restituite dal server possono
essere su domini di terzi. La ricerca web apre Google con artista/titolo e le radio
aprono gli URL configurati tramite il sistema. Non è configurato un servizio analytics
proprietario. Repository e download coinvolgono GitHub; non sono usati badge esterni
che interrogano i dati della repository privata.

| Dati | Conservazione |
| --- | --- |
| Credenziali native | SecureStore; migrazione/rimozione delle vecchie copie. |
| Credenziali web | Storage browser, non equivalente a SecureStore. Evitare computer condivisi. |
| Catalogo, cronologia e preferenze | JSON privati su native, storage browser sul web; possibili URL autenticati. |
| Download | File privati e indice; non cifrati individualmente dall'app. |
| Android Auto | Catalogo privato con metadati e URL, rimosso al logout. |
| Token GitHub opzionale | SecureStore nativo; mai preinstallato. Sul web non viene persistito. |

Backup/trasferimenti Android sono disabilitati nel manifest e nelle regole dedicate.
Lo spazio privato non protegge da un dispositivo compromesso o con accesso root.

**Disconnetti dal server** rimuove sessione e credenziali ma mantiene i download.
Per cancellarli usare Offline → Rimuovi dal dispositivo. Cancellare i dati dell'app
o disinstallarla elimina anche i download. Il logout non cancella account, musica
o cronologia già registrata sul server.

Il token GitHub per gli aggiornamenti deve essere fine-grained, limitato alla sola
repository e al permesso Contents: read. Rimuoverlo dall'app prima di cedere il
dispositivo o revocarlo da GitHub se viene smarrito.

Non condividere file di storage, password, token o URL autenticati. Segnalazioni
di vulnerabilità: [SECURITY.md](../SECURITY.md).
