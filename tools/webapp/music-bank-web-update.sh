#!/bin/sh
# Scarica l'ultima webapp pubblicata da GitHub Actions e la attiva solo se il checksum è valido.
set -eu

BASE_URL="${MUSIC_BANK_WEB_URL:-https://github.com/GioMocchi03/music-bank/releases/download/webapp}"
ROOT="${MUSIC_BANK_WEB_ROOT:-/srv/music-bank-web}"
KEEP=3

mkdir -p "$ROOT/releases"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL --retry 3 -o "$work/MusicBank-web.tar.gz.sha256" "$BASE_URL/MusicBank-web.tar.gz.sha256"
sum="$(cut -d ' ' -f 1 "$work/MusicBank-web.tar.gz.sha256")"
case "$sum" in
  *[!0-9a-f]* | '') echo "Checksum non valido" >&2; exit 1 ;;
esac
[ "${#sum}" -eq 64 ] || { echo "Checksum non valido" >&2; exit 1; }

if [ "$(readlink "$ROOT/current" 2>/dev/null || true)" = "releases/$sum" ]; then
  exit 0
fi

curl -fsSL --retry 3 -o "$work/MusicBank-web.tar.gz" "$BASE_URL/MusicBank-web.tar.gz"
(cd "$work" && sha256sum -c MusicBank-web.tar.gz.sha256 >/dev/null)

target="$ROOT/releases/$sum"
rm -rf "$target.tmp"
mkdir -p "$target.tmp"
tar -xzf "$work/MusicBank-web.tar.gz" -C "$target.tmp" --no-same-owner --no-same-permissions
test -s "$target.tmp/index.html"
chmod -R a+rX "$target.tmp"
rm -rf "$target"
mv "$target.tmp" "$target"

ln -sfn "releases/$sum" "$ROOT/current.tmp"
mv -T "$ROOT/current.tmp" "$ROOT/current"
echo "Webapp attivata: $sum"

# Tiene le ultime versioni per tornare indietro a mano se serve.
ls -1t "$ROOT/releases" | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$old" = "$sum" ] || rm -rf "$ROOT/releases/$old"
done
