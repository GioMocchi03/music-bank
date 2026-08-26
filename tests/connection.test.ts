import assert from 'node:assert/strict';
import test from 'node:test';
import { homeGreeting, normalizeServerUrl } from '../src/utils/connection.ts';

test('aggiunge HTTPS a dominio, porta e percorso senza prefisso', () => {
  assert.equal(normalizeServerUrl(' music.example.org '), 'https://music.example.org');
  assert.equal(normalizeServerUrl('music.example.org:4533/navidrome///'), 'https://music.example.org:4533/navidrome');
  assert.equal(normalizeServerUrl('192.168.1.10:4533'), 'https://192.168.1.10:4533');
});

test('conserva il protocollo esplicito e normalizza una sola volta', () => {
  for (const url of ['https://music.example.org', 'http://localhost:4533', 'http://127.0.0.1:4533', 'ftp://music.example.org']) {
    assert.equal(normalizeServerUrl(' ' + url + '/ '), url);
    assert.equal(normalizeServerUrl(normalizeServerUrl(url)), url);
  }
  assert.equal(normalizeServerUrl('  '), '');
});

test('non mostra un nome prima del login o dopo la disconnessione', () => {
  assert.equal(homeGreeting(false, '', 20), 'Buonasera');
  assert.equal(homeGreeting(false, 'Gio', 8), 'Buongiorno');
  assert.equal(homeGreeting(true, '  ', 14), 'Buon pomeriggio');
});

test('usa il nome autenticato anche al cambio utente', () => {
  assert.equal(homeGreeting(true, ' Anna ', 20), 'Buonasera, Anna');
  assert.equal(homeGreeting(true, 'Marco', 8), 'Buongiorno, Marco');
});

test('cambia saluto alle 5, alle 12 e alle 18, inclusa la mezzanotte', () => {
  for (const [hour, expected] of [
    [0, 'Buonasera'], [4, 'Buonasera'], [5, 'Buongiorno'], [11, 'Buongiorno'],
    [12, 'Buon pomeriggio'], [17, 'Buon pomeriggio'], [18, 'Buonasera'], [23, 'Buonasera'],
  ] as const) {
    assert.equal(homeGreeting(false, '', hour), expected);
    assert.equal(homeGreeting(true, 'Anna', hour), `${expected}, Anna`);
  }
});
