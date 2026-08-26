# Accesso riservato

La repository `GioMocchi03/music-bank` è privata. Sorgenti, issue, log dei workflow
e release APK sono accessibili agli account autorizzati. La creazione iniziale
non invita nessun collaboratore: decide il proprietario chi aggiungere.

## Invitare una persona

Il proprietario apre **Settings → Collaborators → Add people**, cerca il nome utente
GitHub e invia l'invito. Verificare attentamente l'account prima di inviare. La persona
deve accettare e accedere a GitHub per vedere repository e Releases. Un URL non è un
invito e non rende pubblico l'APK.

**Attenzione ai permessi:** nelle repository di un account personale i collaboratori
hanno lettura e scrittura, non un ruolo di sola lettura. Per distribuire APK a tester
che non devono modificare sorgenti/release, valutare una repository privata di
un'organizzazione con ruolo Read. Non trasferire o invitare utenti senza una scelta
esplicita del proprietario.

Rimuovere un collaboratore blocca gli accessi futuri, ma non elimina copie del codice
o APK già scaricati. La visibilità privata non sostituisce le condizioni della licenza
MIT presente nel progetto né impedisce tecnicamente la copia di un file.

## Download

Usare la pagina Releases dopo il login. Dal terminale autenticato:

```bash
gh release download --repo GioMocchi03/music-bank --pattern '*.apk' --pattern '*.sha256'
```

Non incorporare token GitHub nell'app, negli URL condivisi o nei file di configurazione.
Niente GitHub Pages o mirror pubblici vengono attivati per questa distribuzione.

## Controlli e costi

CI e Gitleaks usano GitHub Actions; le repository private consumano la quota disponibile
del proprio account. Non vengono acquistati piani o incrementati limiti di spesa.
La compilazione Android in Actions è manuale; CodeQL è disabilitato per default
e richiede idoneità/licenza prima dell'attivazione. Dependabot propone cambiamenti
senza unirli automaticamente.

Fonti: [permessi nelle repository personali](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository),
[disponibilità di Code Scanning](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning).
