import http from 'node:http';

const albums = [
  { id: 'a1', name: 'Behind the Gardens—Behind the Wall—Under the Tree', artist: 'Andreas Vollenweider', artistId: 'r1', year: 1981, songCount: 9, coverArt: 'c1' },
  { id: 'a2', name: '“Clic”', artist: 'Franco Battiato', artistId: 'r2', year: 1974, songCount: 7, coverArt: 'c2' },
  { id: 'a3', name: '#SELFIE: The Remixes', artist: 'The Chainsmokers', artistId: 'r3', year: 2014, songCount: 1, coverArt: 'c3' },
  { id: 'a4', name: 'Un titolo molto lungo per verificare due colonne', artist: 'Artista con nome molto lungo', artistId: 'r4', year: 2026, songCount: 12, coverArt: 'c4' },
];
const artists = [
  { id: 'r1', name: 'Andreas Vollenweider', albumCount: 4, coverArt: 'c1' },
  { id: 'r2', name: 'Franco Battiato', albumCount: 18, coverArt: 'c2' },
  { id: 'r3', name: 'The Chainsmokers', albumCount: 6, coverArt: 'c3' },
  { id: 'r4', name: 'Artista con nome molto lungo', albumCount: 12, coverArt: 'c4' },
];
const songs = albums.flatMap((album, albumIndex) =>
  Array.from({ length: Math.min(album.songCount, 3) }, (_, index) => ({
    id: `s${albumIndex}-${index}`,
    title: index === 0 ? 'Brano con un titolo molto lungo per il menu azioni' : `Brano ${index + 1}`,
    album: album.name,
    albumId: album.id,
    artist: album.artist,
    artistId: album.artistId,
    coverArt: album.coverArt,
    duration: 210,
    track: index + 1,
    genre: albumIndex % 2 ? 'Elettronica' : 'Ambient',
    suffix: albumIndex % 2 === 0 ? 'flac' : 'mp3',
    contentType: albumIndex % 2 === 0 ? 'audio/flac' : 'audio/mpeg',
    bitRate: albumIndex % 2 === 0 ? 909 : 320,
    bitDepth: albumIndex % 2 === 0 ? 16 : undefined,
    samplingRate: albumIndex % 2 === 0 ? 44100 : 48000,
    channelCount: 2,
  })),
);

function envelope(payload = {}) {
  return JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...payload } });
}

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(request.url ?? '/', 'http://localhost:8091');
  const endpoint = url.pathname.split('/').pop()?.replace('.view', '');
  console.log(endpoint ?? 'unknown');
  if (endpoint === 'stream') {
    const sampleRate = 8000;
    const samples = sampleRate * 30;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', String(wav.length));
    response.end(wav);
    return;
  }
  if (endpoint === 'getCoverArt') {
    const id = url.searchParams.get('id') ?? 'cover';
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g"><stop stop-color="#5536a8"/><stop offset="1" stop-color="#13182d"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="300" r="150" fill="#d6ff4b"/><text x="300" y="325" text-anchor="middle" font-family="sans-serif" font-size="62" font-weight="900" fill="#111">${id}</text></svg>`);
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  if (endpoint === 'getAlbumList2') {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    response.end(envelope({ albumList2: { album: offset ? [] : albums } }));
  } else if (endpoint === 'getArtists') {
    response.end(envelope({ artists: { index: [{ name: 'A', artist: artists }] } }));
  } else if (endpoint === 'getArtist') {
    const artist = artists.find((item) => item.id === url.searchParams.get('id')) ?? artists[0];
    response.end(envelope({ artist: { ...artist, album: albums.filter((item) => item.artistId === artist.id) } }));
  } else if (endpoint === 'getAlbum') {
    const album = albums.find((item) => item.id === url.searchParams.get('id')) ?? albums[0];
    response.end(envelope({ album: { ...album, song: songs.filter((song) => song.albumId === album.id) } }));
  } else if (endpoint === 'getGenres') {
    response.end(envelope({ genres: { genre: [
      { value: 'Hip Hop', albumCount: 2, songCount: 4 },
      { value: 'hip-hop', albumCount: 1, songCount: 2 },
      { value: 'HIPHOP', albumCount: 1, songCount: 1 },
      { value: 'R&B', albumCount: 2, songCount: 5 },
      { value: 'Rhythm and Blues', albumCount: 1, songCount: 2 },
      { value: 'Rock; Alternative Rock', albumCount: 2, songCount: 3 },
      { value: 'Unknown', albumCount: 20, songCount: 100 },
    ] } }));
  } else if (endpoint === 'getPlaylists') {
    response.end(envelope({ playlists: { playlist: [{ id: 'p1', name: 'Preferiti test', songCount: 4 }] } }));
  } else if (endpoint === 'search3') {
    response.end(envelope({ searchResult3: { song: url.searchParams.get('songOffset') === '0' ? songs : [] } }));
  } else if (endpoint === 'getInternetRadioStations') {
    response.end(envelope({ internetRadioStations: { internetRadioStation: [] } }));
  } else if (endpoint === 'getRandomSongs') {
    response.end(envelope({ randomSongs: { song: songs } }));
  } else if (endpoint === 'getSongsByGenre') {
    response.end(envelope({ songsByGenre: { song: songs.slice(0, 4) } }));
  } else {
    response.end(envelope());
  }
});

server.listen(8091, '127.0.0.1');
