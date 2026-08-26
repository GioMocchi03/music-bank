# Contribuire

Apri un'issue prima di modifiche estese. Usa dati di esempio, mai credenziali reali.

1. Crea un fork e un branch dedicato.
2. Installa con `npm ci`; leggi [DEVELOPMENT.md](docs/DEVELOPMENT.md) e `AGENTS.md`.
3. Mantieni il cambiamento circoscritto e testa il comportamento modificato.
4. Esegui `npm run check` e `npm run export:check`.
5. Per modifiche native compila Android e dichiara dispositivo e prove effettuate.
6. Nella PR spiega cosa cambia, perché, controlli eseguiti e limiti noti.

Non rigenerare `android/` con `expo prebuild --clean`, non cambiare firma/package
ufficiali e non inserire segreti, musica, build o dati personali nel repository.
Gli upgrade Expo/React Native devono rispettare la compatibilità SDK. Non aggiungere
dipendenze per operazioni già coperte dallo stack.

Interfaccia e documentazione principale sono in italiano; issue e PR possono essere
anche in inglese. Mantieni un confronto rispettoso. Non sono promessi tempi di risposta.
I contributi vengono distribuiti secondo la [licenza MIT](LICENSE): contribuisci solo
materiale per cui disponi dei diritti necessari.
