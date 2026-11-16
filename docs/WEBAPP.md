# Webapp per iPhone e iPad

La webapp è la versione web di Music Bank pubblicata sul proprio server. Su iPhone
si apre in Safari e si aggiunge alla schermata Home: non serve firmare un `.ipa`,
non scade dopo 7 giorni e si aggiorna da sola.

## Come funziona

1. A ogni merge su `main` il workflow `Music Bank webapp` esporta il frontend
   web e pubblica `MusicBank-web.tar.gz` con il suo `.sha256` nella pre-release
   `webapp`. `/releases/latest` e il controllo aggiornamenti dell'app la ignorano.
2. Sul server un timer systemd esegue ogni 10 minuti
   [music-bank-web-update.sh](../tools/webapp/music-bank-web-update.sh): scarica
   il pacchetto, verifica il checksum e cambia il link `current` solo se tutto è valido.
3. Caddy serve i file da `/srv/music-bank-web/current` e inoltra `/rest/*` a
   Navidrome. Webapp e API stanno sullo stesso dominio, quindi non serve CORS.

Il sito non viene indicizzato: `robots.txt`, meta `noindex` e header
`X-Robots-Tag`. Non è un controllo di accesso: chi conosce l'indirizzo vede la
pagina di login, come per Navidrome.

## Installazione sul server

```bash
sudo useradd --system --home /srv/music-bank-web --shell /usr/sbin/nologin music-bank-web
sudo install -d -o music-bank-web -g music-bank-web -m 0755 /srv/music-bank-web
sudo install -m 0755 tools/webapp/music-bank-web-update.sh /usr/local/bin/music-bank-web-update
sudo install -m 0644 tools/webapp/music-bank-web-update.service tools/webapp/music-bank-web-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now music-bank-web-update.timer
sudo systemctl start music-bank-web-update.service
```

Blocco Caddy, con il dominio configurato su deSEC:

```caddy
musicbank.example.dedyn.io {
	encode zstd gzip
	header {
		X-Robots-Tag "noindex, nofollow"
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
	}
	handle /rest/* {
		reverse_proxy 127.0.0.1:4533
	}
	handle {
		root * /srv/music-bank-web/current
		@immutable path /_expo/static/*
		header @immutable Cache-Control "public, max-age=31536000, immutable"
		@fresh not path /_expo/static/*
		header @fresh Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
```

Poi `sudo caddy validate --config /etc/caddy/Caddyfile` e
`sudo systemctl reload caddy`. Su deSEC il nome deve puntare all'IP pubblico del
server, come gli altri servizi.

## Installazione su iPhone

1. Apri l'indirizzo della webapp in Safari.
2. Condividi → **Aggiungi alla schermata Home**.
3. Apri Music Bank dalla Home e accedi usando come server lo stesso indirizzo
   della webapp.

## Limiti

- Niente download offline, Android Auto/CarPlay ed equalizzatore: su iPhone e
  iPad Web Audio può interrompere l'ascolto a schermo bloccato.
- L'ascolto in background e i controlli sulla schermata di blocco dipendono da
  Safari: vanno verificati sulla versione di iOS in uso.
- La libreria è in cache nel browser. Se cancelli i dati di Safari va
  sincronizzata di nuovo.
