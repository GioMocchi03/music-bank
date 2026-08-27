import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { clearAndroidAutoCatalog, ensureAndroidAutoCatalog, saveAndroidAutoCatalog } from './src/storage/androidAutoStore';
import { clearConnection, loadConnection, saveConnection } from './src/storage/connectionStore';
import { homeGreeting, normalizeServerUrl } from './src/utils/connection';
import { chooseFeaturedAlbum, featuredArtistKey } from './src/utils/homeFeatured';
import { connectionSourceKey, downloadJobLabel, downloadKey, DownloadJob, DownloadQueue, formatDownloadSize, songBelongsToSource } from './src/utils/downloads';
import { clearHistory, HistoryEntry, loadHistory, rememberPlayed } from './src/storage/historyStore';
import { clearLibrary, loadLibrary, loadLibraryPreview, saveLibrary } from './src/storage/libraryStore';
import {
  OfflineTrack,
  clearOfflineTracks,
  downloadTrack,
  loadOfflineTracks,
  removeOfflineTrack,
} from './src/storage/offlineStore';
import {
  AppPreferences,
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from './src/storage/preferencesStore';
import {
  Album,
  Artist,
  Genre,
  InternetRadioStation,
  NavidromeClient,
  NavidromeConnection,
  Playlist,
  SearchResults,
  Song,
} from './src/subsonic/NavidromeClient';
import {
  normalizeSearchText,
  rankDirectSearchItems,
  rankSearchItems,
} from './src/utils/search';
import {
  APP_BUILD,
  APP_VERSION,
  clearGithubReleaseToken,
  compareVersions,
  fetchLatestPrivateRelease,
  GithubRelease,
  loadGithubReleaseToken,
  PRIVATE_RELEASES_URL,
  saveGithubReleaseToken,
} from './src/updates/githubUpdates';
import {
  isPlaylistOwnedBy,
  movePlaylistItem,
  normalizePlaylistName,
  partitionPlaylists,
  removePlaylistItem,
  validatePlaylistName,
} from './src/utils/playlists';

type Tab = 'home' | 'library' | 'search' | 'settings';
type LibraryMode =
  | 'hub'
  | 'albums'
  | 'artists'
  | 'genres'
  | 'tracks'
  | 'favorites'
  | 'playlists'
  | 'years'
  | 'radio'
  | 'offline';
type SettingsSection = 'hub' | 'server' | 'playback' | 'offline' | 'interface' | 'sync' | 'updates' | 'about';
type Detail =
  | { type: 'album'; id: string }
  | { type: 'artist'; id: string }
  | { type: 'genre'; genre: string; sources?: string[] }
  | { type: 'playlist'; id: string }
  | null;
type RepeatMode = 'none' | 'one' | 'all';
type GenreView = 'albums' | 'tracks' | 'artists';
type SearchFilter = 'all' | 'artists' | 'albums' | 'songs';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const lime = '#D6FF4B';
const OfflineContext = createContext<{
  tracks: Map<string, OfflineTrack>;
  jobs: Record<string, DownloadJob>;
  sourceKey: string;
  onDownload: (song: Song) => void;
  onDownloadMany: (songs: Song[]) => void;
}>({ tracks: new Map(), jobs: {}, sourceKey: 'legacy', onDownload: () => {}, onDownloadMany: () => {} });
const AUTO_SYNC_FRESHNESS_MS = 6 * 60 * 60 * 1000;
const demoAlbums: Album[] = [
  { id: 'demo-1', name: 'Collega Navidrome', artist: 'La tua musica apparirà qui' },
];
const emptySearch: SearchResults = { albums: [], artists: [], songs: [] };

function mergeSearchResults(local: SearchResults, remote: SearchResults): SearchResults {
  const unique = <T extends { id: string }>(items: T[]) =>
    [...new Map(items.map((item) => [item.id, item])).values()];
  return {
    albums: unique([...local.albums, ...remote.albums]).slice(0, 60),
    artists: unique([...local.artists, ...remote.artists]).slice(0, 30),
    songs: unique([...local.songs, ...remote.songs]).slice(0, 100),
  };
}

function coverUrlForSize(uri: string | undefined, size: number): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    url.searchParams.set('size', String(size));
    return url.toString();
  } catch {
    return uri;
  }
}
export default function App() {
  return (
    <SafeAreaProvider>
      <MusicBankApp />
    </SafeAreaProvider>
  );
}

function MusicBankApp() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 760;
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const columns = width >= 1180 ? (preferences.compactGrid ? 7 : 6) : width >= 760 ? (preferences.compactGrid ? 5 : 4) : 2;

  const [tab, setTab] = useState<Tab>('home');
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('hub');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('hub');
  const [detail, setDetail] = useState<Detail>(null);
  const [connection, setConnection] = useState<NavidromeConnection>({
    serverUrl: '',
    username: '',
    password: '',
  });
  const [albums, setAlbums] = useState<Album[]>([]);
  const [featuredAlbumId, setFeaturedAlbumId] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [radios, setRadios] = useState<InternetRadioStation[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [activeSourceKey, setActiveSourceKey] = useState('legacy');
  const [downloadJobs, setDownloadJobs] = useState<Record<string, DownloadJob>>({});
  const downloadQueueRef = useRef(new DownloadQueue());
  const offlineTracksRef = useRef<OfflineTrack[]>([]);
  const offlineByKey = useMemo(() => new Map(offlineTracks.map((track) => [downloadKey(track.song), track])), [offlineTracks]);
  const downloadsBusy = Object.values(downloadJobs).some((job) => job.status !== 'error');
  const [connected, setConnected] = useState(false);
  const [authenticatedUsername, setAuthenticatedUsername] = useState('');
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Collega il tuo server');
  const [query, setQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults>(emptySearch);
  const [detailAlbum, setDetailAlbum] = useState<Album | null>(null);
  const [detailArtist, setDetailArtist] = useState<Artist | null>(null);
  const [detailPlaylist, setDetailPlaylist] = useState<Playlist | null>(null);
  const [genreSongs, setGenreSongs] = useState<Song[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [managePlaylistOpen, setManagePlaylistOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [clearDownloadsOpen, setClearDownloadsOpen] = useState(false);
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const clientRef = useRef<NavidromeClient | null>(null);
  const finishedRef = useRef(false);
  const startedSongRef = useRef<string | null>(null);
  const pingFailuresRef = useRef(0);
  const restoredConnectionRef = useRef<NavidromeConnection | null>(null);
  const syncInFlightRef = useRef(false);
  const startupSyncStartedRef = useRef(false);
  const hasCachedLibraryRef = useRef(false);
  const lastFullSyncAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const syncAbortRef = useRef<AbortController | null>(null);
  const disconnectingRef = useRef(false);
  const playbackGenerationRef = useRef(0);
  const historyWriteRef = useRef<Promise<unknown> | null>(null);

  const verifyConnection = useCallback(async (announce = false) => {
    const client = clientRef.current;
    if (!client || disconnectingRef.current) return;
    try {
      await client.ping();
      if (clientRef.current !== client || disconnectingRef.current) return;
      pingFailuresRef.current = 0;
      setConnected(true);
      if (announce) setMessage('Navidrome online');
    } catch {
      if (clientRef.current !== client || disconnectingRef.current) return;
      pingFailuresRef.current += 1;
      if (pingFailuresRef.current >= 3) {
        setConnected(false);
        setMessage('Server temporaneamente non raggiungibile · libreria locale disponibile');
      }
    }
  }, []);

  const player = useAudioPlayer(null, {
    updateInterval: 750,
    keepAudioSessionActive: true,
  });
  const playerStatus = useAudioPlayerStatus(player);
  const currentSong = queueIndex >= 0 ? queue[queueIndex] : undefined;
  const actionTarget = actionSong ?? currentSong;

  const playWhenReady = useCallback(() => new Promise<void>((resolve, reject) => {
    const generation = playbackGenerationRef.current;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription: { remove: () => void } | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
    };
    const start = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (generation !== playbackGenerationRef.current) {
        resolve();
        return;
      }
      try {
        if (player.isLoaded || player.currentStatus.isLoaded) {
          player.setPlaybackRate(preferences.defaultPlaybackRate);
        }
        player.play();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    if (player.isLoaded || player.currentStatus.isLoaded) {
      start();
      return;
    }
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) start();
    });
    // Alcuni dispositivi non emettono l'evento di caricamento per gli stream remoti.
    // Il tentativo finale evita che il tap apra il player lasciandolo in pausa.
    timeout = setTimeout(start, 4_000);
  }), [player, preferences.defaultPlaybackRate]);

  useEffect(() => {
    let active = true;
    const connectionPromise = loadConnection();
    const previewPromise = loadLibraryPreview();
    const historyPromise = loadHistory();
    const offlinePromise = connectionPromise.then((saved) => loadOfflineTracks(saved ? connectionSourceKey(saved) : 'legacy'));
    const preferencesPromise = loadPreferences();

    void historyPromise.then((savedHistory) => {
      if (active) setHistory(savedHistory);
    }).catch(() => {
      // La Home resta utilizzabile anche senza cronologia locale.
    });
    void offlinePromise.then((savedOffline) => {
      if (active) {
        offlineTracksRef.current = savedOffline;
        setOfflineTracks(savedOffline);
      }
    }).catch(() => {
      // Un indice download danneggiato non deve ritardare il primo rendering.
    });
    void preferencesPromise.then((savedPreferences) => {
      if (!active) return;
      const restoredRate = Number.isFinite(savedPreferences.defaultPlaybackRate)
        ? Math.max(0.1, Math.min(2, savedPreferences.defaultPlaybackRate))
        : 1;
      setPreferences({ ...savedPreferences, defaultPlaybackRate: restoredRate });
      player.volume = 1;
      setPreferencesReady(true);
    }).catch(() => {
      if (active) setPreferencesReady(true);
    });

    void (async () => {
      // La connessione e intenzionalmente ripristinata prima e separatamente:
      // una cache corrotta o piena non puo piu trasformarsi in un logout.
      const saved = await connectionPromise;
      if (!active) return;
      if (saved) {
        setConnection(saved);
        clientRef.current = new NavidromeClient(saved);
        setAuthenticatedUsername(saved.username.trim());
        setActiveSourceKey(connectionSourceKey(saved));
        restoredConnectionRef.current = saved;
        setConnected(true);
        setMessage('Server salvato · preparazione aggiornamento automatico…');
      }

      // Primo rendering: un solo piccolo file con album, artisti, generi e
      // playlist. I blocchi delle tracce vengono letti soltanto dopo.
      const preview = await previewPromise;
      if (!active) return;
      if (preview && saved) {
        hasCachedLibraryRef.current = true;
        lastFullSyncAtRef.current = preview.syncedAt;
        setAlbums(preview.albums);
        setArtists(preview.artists);
        setGenres(preview.genres);
        setPlaylists(preview.playlists);
        setRadios(preview.radios);
        setMessage(
          `${preview.albums.length} album dalla cache · caricamento tracce in background…`,
        );
      }
      // Seconda fase non bloccante: completa ricerca, tracce e Android Auto.
      await loadLibrary().then(async (snapshot) => {
        if (!active || !snapshot || !saved) return;
        if (snapshot.syncedAt < lastFullSyncAtRef.current) return;
        setSongs(snapshot.songs);
        if (saved) {
          await ensureAndroidAutoCatalog(snapshot.songs, new NavidromeClient(saved)).catch(() => {
            // Il catalogo Auto verrà rigenerato alla prossima sincronizzazione completa.
          });
        }
      }).catch(() => {
        // Album, artisti e generi della preview restano immediatamente disponibili.
      });
      await Promise.allSettled([offlinePromise, historyPromise]);
    })().catch((error) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : 'Errore durante il ripristino locale');
      }
    }).finally(() => {
      if (active) setBootstrapReady(true);
    });
    return () => {
      active = false;
      try {
        player.setActiveForLockScreen(false);
      } catch {
        // Il player può essere già stato rilasciato durante lo smontaggio.
      }
    };
  }, [verifyConnection]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: preferences.backgroundPlayback,
      interruptionMode: 'doNotMix',
    });
    if (!preferences.backgroundPlayback) {
      try {
        player.setActiveForLockScreen(false);
      } catch {
        // Nessuna sessione attiva da disabilitare.
      }
    }
  }, [player, preferences.backgroundPlayback]);

  useEffect(() => {
    if (!preferencesReady) return;
    const timer = setTimeout(() => {
      void savePreferences(preferences).catch(() => {
        // Le preferenze non devono mai interrompere la sessione del server.
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [preferences, preferencesReady]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (disconnectOpen) {
        setDisconnectOpen(false);
        return true;
      }
      if (clearDownloadsOpen) {
        setClearDownloadsOpen(false);
        return true;
      }
      if (speedOpen) {
        setSpeedOpen(false);
        return true;
      }
      if (sleepOpen) {
        setSleepOpen(false);
        return true;
      }
      if (playlistPickerOpen) {
        setPlaylistPickerOpen(false);
        return true;
      }
      if (createPlaylistOpen) {
        setCreatePlaylistOpen(false);
        return true;
      }
      if (managePlaylistOpen) {
        setManagePlaylistOpen(false);
        return true;
      }
      if (actionsOpen) {
        setActionsOpen(false);
        setActionSong(null);
        return true;
      }
      if (eqOpen) {
        setEqOpen(false);
        return true;
      }
      if (queueOpen) {
        setQueueOpen(false);
        return true;
      }
      if (playerOpen) {
        setPlayerOpen(false);
        return true;
      }
      if (detail) {
        setDetail(null);
        return true;
      }
      if (tab === 'settings' && settingsSection !== 'hub') {
        setSettingsSection('hub');
        return true;
      }
      if (tab === 'library' && libraryMode !== 'hub') {
        setLibraryMode('hub');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [actionsOpen, clearDownloadsOpen, createPlaylistOpen, detail, disconnectOpen, eqOpen, libraryMode, managePlaylistOpen, playerOpen, playlistPickerOpen, queueOpen, settingsSection, sleepOpen, speedOpen, tab]);

  async function disconnectServer() {
    if (!bootstrapReady || syncInFlightRef.current || disconnectingRef.current || downloadQueueRef.current.busy) return;
    disconnectingRef.current = true;
    setDisconnecting(true);
    setDisconnectOpen(false);
    try {
      await clearConnection();
      // Nessun ping o avvio automatico deve riattivare l'account disconnesso.
      clientRef.current = null;
      restoredConnectionRef.current = null;
      startupSyncStartedRef.current = true;
      pingFailuresRef.current = 0;
      playbackGenerationRef.current += 1;
      try {
        player.pause();
        player.replace(null);
        player.setActiveForLockScreen(false);
      } catch {
        // Il rilascio del player non deve impedire la rimozione della sessione.
      }
      setConnected(false);
      setAuthenticatedUsername('');
      setActiveSourceKey('legacy');
      setDownloadJobs({});
      setConnection({ serverUrl: '', username: '', password: '' });
      setQueue([]);
      setQueueIndex(-1);
      setPlayerOpen(false);
      setQueueOpen(false);
      setSleepUntil(null);
      setDetail(null);
      setDetailAlbum(null);
      setDetailArtist(null);
      setDetailPlaylist(null);
      setGenreSongs([]);
      setQuery('');
      setSearchResults(emptySearch);
      setAlbums([]);
      setFeaturedAlbumId(null);
      setArtists([]);
      setGenres([]);
      setPlaylists([]);
      setSongs([]);
      setRadios([]);
      setHistory([]);
      hasCachedLibraryRef.current = false;
      lastFullSyncAtRef.current = 0;
      setMessage('Disconnesso dal server. I file scaricati sono stati conservati.');
      await historyWriteRef.current?.catch(() => {});
      const cleanup = await Promise.allSettled([clearLibrary(), clearHistory(), clearAndroidAutoCatalog()]);
      if (cleanup.some((result) => result.status === 'rejected')) {
        setMessage('Disconnesso dal server, ma non è stato possibile rimuovere tutta la cache locale.');
      }
    } catch (error) {
      setMessage(`Disconnessione non riuscita: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      disconnectingRef.current = false;
      setDisconnecting(false);
    }
  }

  const syncLibrary = useCallback(
    async (
      nextConnection: NavidromeConnection = connection,
      reason: 'manual' | 'startup' = 'manual',
    ) => {
      if (reason === 'manual') startupSyncStartedRef.current = true;
      if (syncInFlightRef.current || disconnectingRef.current) return;
      if (downloadQueueRef.current.busy) {
        setMessage('Attendi il completamento dei download prima di cambiare o sincronizzare il server.');
        return;
      }
      const abortController = new AbortController();
      syncAbortRef.current = abortController;
      syncInFlightRef.current = true;
      setBusy(true);
      setMessage(
        reason === 'manual'
          ? 'Verifica del server…'
          : 'Aggiornamento automatico · verifica server…',
      );
      let serverVerified = false;
      try {
        const client = new NavidromeClient(nextConnection);
        await client.ping(abortController.signal);
        serverVerified = true;
        setAuthenticatedUsername(nextConnection.username.trim());
        setActiveSourceKey(connectionSourceKey(nextConnection));
        clientRef.current = client;
        setConnection(nextConnection);
        setConnected(true);
        pingFailuresRef.current = 0;
        // Salva e rileggi il provider prima della sincronizzazione: anche se il catalogo
        // è lungo o viene interrotto, al prossimo avvio il server resta configurato.
        await saveConnection(nextConnection);
        const persistedConnection = await loadConnection();
        const expectedServer = normalizeServerUrl(nextConnection.serverUrl);
        if (
          !persistedConnection ||
          persistedConnection.serverUrl !== expectedServer ||
          persistedConnection.username !== nextConnection.username.trim() ||
          persistedConnection.password !== nextConnection.password
        ) {
          throw new Error('Test di persistenza fallito: il server non rimarrebbe salvato al riavvio.');
        }
        setConnection(persistedConnection);
        clientRef.current = new NavidromeClient(persistedConnection);
        restoredConnectionRef.current = persistedConnection;
        setMessage('Sincronizzazione album…');
        const allAlbums = await client.getAllAlbums(
          (count) => setMessage(`${count} album ricevuti…`),
          abortController.signal,
        );
        setMessage('Sincronizzazione artisti, generi e playlist…');
        const [allArtists, allGenres, allPlaylists] = await Promise.all([
          client.getArtists(abortController.signal),
          client.getGenres(abortController.signal),
          client.getPlaylists(abortController.signal),
        ]);
        setMessage('Sincronizzazione catalogo brani e radio…');
        const [allSongs, allRadios] = await Promise.all([
          client.getAllSongs(
            (count) => setMessage(`${count} brani ricevuti…`),
            abortController.signal,
          ),
          client.getInternetRadioStations(abortController.signal).catch((error) => {
            if (abortController.signal.aborted) throw error;
            return [];
          }),
        ]);
        const snapshot = {
          albums: allAlbums,
          artists: allArtists,
          genres: allGenres,
          playlists: allPlaylists,
          songs: allSongs,
          radios: allRadios,
          syncedAt: Date.now(),
        };
        setMessage('Salvataggio verificato della libreria…');
        await saveLibrary(snapshot, (savedSongs, totalSongs) => {
          setMessage(`Salvataggio sul dispositivo · ${savedSongs}/${totalSongs} brani…`);
        });
        const restoredSnapshot = await loadLibrary();
        if (
          !restoredSnapshot ||
          restoredSnapshot.albums.length !== allAlbums.length ||
          restoredSnapshot.songs.length !== allSongs.length
        ) {
          throw new Error('Il catalogo non supera la verifica di riapertura locale.');
        }

        setAlbums(restoredSnapshot.albums);
        setArtists(restoredSnapshot.artists);
        setGenres(restoredSnapshot.genres);
        setPlaylists(restoredSnapshot.playlists);
        setSongs(restoredSnapshot.songs);
        setRadios(restoredSnapshot.radios);
        hasCachedLibraryRef.current = true;
        lastFullSyncAtRef.current = restoredSnapshot.syncedAt;
        await saveConnection(nextConnection);

        let autoWarning = false;
        setMessage('Aggiornamento catalogo Android Auto…');
        try {
          await saveAndroidAutoCatalog(restoredSnapshot.songs, client);
        } catch {
          autoWarning = true;
        }
        setConnection(persistedConnection);
        setMessage(
          autoWarning
            ? `${allAlbums.length} album · ${allSongs.length} brani salvati · Android Auto da aggiornare`
            : `${allAlbums.length} album · ${allSongs.length} brani salvati e verificati`,
        );
        if (reason === 'manual') setTab('home');
      } catch (error) {
        if (abortController.signal.aborted) return;
        if (!serverVerified) setConnected(false);
        const detail = error instanceof Error ? error.message : 'Connessione non riuscita';
        setMessage(
          reason === 'manual'
            ? detail
            : hasCachedLibraryRef.current
              ? `Aggiornamento automatico non riuscito · libreria salvata disponibile · ${detail}`
              : `Aggiornamento automatico non riuscito · nessun catalogo locale · ${detail}`,
        );
      } finally {
        if (syncAbortRef.current === abortController) syncAbortRef.current = null;
        syncInFlightRef.current = false;
        setBusy(false);
      }
    },
    [connection],
  );

  useEffect(() => () => {
    syncAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!bootstrapReady || startupSyncStartedRef.current) return;
    const saved = restoredConnectionRef.current;
    if (!saved) return;
    startupSyncStartedRef.current = true;
    const cacheAge = Date.now() - lastFullSyncAtRef.current;
    if (!hasCachedLibraryRef.current || cacheAge >= AUTO_SYNC_FRESHNESS_MS) {
      void syncLibrary(saved, 'startup');
      return;
    }
    setMessage('Libreria caricata dalla cache · controllo server…');
    void verifyConnection(true);
  }, [bootstrapReady, syncLibrary, verifyConnection]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const previousState = appStateRef.current;
      appStateRef.current = state;
      if (state !== 'active' || previousState === 'active') return;
      setFeaturedAlbumId(null);

      const saved = restoredConnectionRef.current;
      if (!saved) return;
      if (bootstrapReady && !syncInFlightRef.current) {
        void verifyConnection(true);
      }
    });
    const interval = setInterval(() => {
      if (appStateRef.current === 'active' && !syncInFlightRef.current) {
        void verifyConnection(false);
      }
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [bootstrapReady, verifyConnection]);

  useEffect(() => {
    if (!bootstrapReady || !preferencesReady || !albums.length) return;
    if (featuredAlbumId && albums.some((album) => album.id === featuredAlbumId)) return;
    const selected = chooseFeaturedAlbum(
      albums, songs, history, preferences.lastFeaturedArtist, preferences.lastFeaturedAlbumId,
    );
    if (!selected) return;
    setFeaturedAlbumId(selected.id);
    setPreferences((current) => ({
      ...current,
      lastFeaturedArtist: featuredArtistKey(selected),
      lastFeaturedAlbumId: selected.id,
    }));
  }, [albums, bootstrapReady, featuredAlbumId, history, preferences.lastFeaturedAlbumId, preferences.lastFeaturedArtist, preferencesReady, songs]);

  const loadSong = useCallback(
    async (songs: Song[], index: number, autoPlay = true) => {
      const client = clientRef.current;
      const song = songs[index];
      if (!song || disconnectingRef.current) return;
      const stored = offlineByKey.get(downloadKey(song, activeSourceKey));
      const useLocal = !!stored && (!!song.offlineSourceKey || !client || !connected || preferences.preferOffline);
      if (!stored && (!client || !songBelongsToSource(song, activeSourceKey))) {
        setMessage('Questo brano non è scaricato. Collega il server per ascoltarlo.');
        return;
      }
      try {
        setQueue(songs);
        setQueueIndex(index);
        const uri = useLocal ? stored!.localUri : await client!.streamUrl(song.id);
        if (clientRef.current !== client || disconnectingRef.current) return;
        startedSongRef.current = null;
        player.replace({ uri, name: song.title });
        if (preferences.backgroundPlayback) {
          player.setActiveForLockScreen(true, {
            title: song.title,
            artist: song.artist ?? 'Artista sconosciuto',
            albumTitle: song.album,
            artworkUrl: song.coverUrl,
          });
        } else {
          player.setActiveForLockScreen(false);
        }
        player.loop = repeat === 'one';
        if (autoPlay) await playWhenReady();
      } catch (error) {
        setMessage(
          `Riproduzione non riuscita: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [activeSourceKey, connected, offlineByKey, playWhenReady, player, preferences.backgroundPlayback, preferences.preferOffline, repeat],
  );

  useEffect(() => {
    if (!playerStatus.playing || !currentSong || startedSongRef.current === currentSong.id) return;
    if (currentSong.offlineSourceKey && currentSong.offlineSourceKey !== activeSourceKey) return;
    startedSongRef.current = currentSong.id;
    const client = clientRef.current;
    void client?.scrobble(currentSong.id, false);
    historyWriteRef.current = rememberPlayed(currentSong).then((next) => {
      if (clientRef.current === client && !disconnectingRef.current) setHistory(next);
    }).catch(() => {
      // La riproduzione continua anche se la cronologia non e scrivibile.
    });
  }, [activeSourceKey, currentSong, playerStatus.playing]);

  useEffect(() => {
    if (!sleepUntil) return;
    const remaining = sleepUntil - Date.now();
    if (remaining <= 0) {
      player.pause();
      setSleepUntil(null);
      return;
    }
    const timer = setTimeout(() => {
      player.pause();
      setSleepUntil(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [player, sleepUntil]);

  const playNext = useCallback(() => {
    if (!queue.length) return;
    if (repeat === 'one') {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    let next = shuffle
      ? Math.floor(Math.random() * queue.length)
      : queueIndex + 1;
    if (next >= queue.length) {
      if (repeat !== 'all') return;
      next = 0;
    }
    void loadSong(queue, next);
  }, [loadSong, player, queue, queueIndex, repeat, shuffle]);

  const playPrevious = useCallback(() => {
    if (playerStatus.currentTime > 4) {
      void player.seekTo(0);
      return;
    }
    if (!queue.length) return;
    const previous = queueIndex > 0 ? queueIndex - 1 : repeat === 'all' ? queue.length - 1 : 0;
    void loadSong(queue, previous);
  }, [loadSong, player, playerStatus.currentTime, queue, queueIndex, repeat]);

  useEffect(() => {
    if (playerStatus.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      if (currentSong && (!currentSong.offlineSourceKey || currentSong.offlineSourceKey === activeSourceKey)) void clientRef.current?.scrobble(currentSong.id, true);
      playNext();
    }
    if (!playerStatus.didJustFinish) finishedRef.current = false;
  }, [activeSourceKey, currentSong, playNext, playerStatus.didJustFinish]);

  const searchCatalog = useMemo(() => ({
      albums: albums.map((album) => ({
        item: album,
        text: normalizeSearchText(`${album.name} ${album.artist} ${album.genre ?? ''}`),
      })),
      artists: artists.map((artist) => ({
        item: artist,
        text: normalizeSearchText(artist.name),
      })),
      songs: songs.map((song) => ({
        item: song,
        text: normalizeSearchText(`${song.title} ${song.artist ?? ''} ${song.album ?? ''} ${song.genre ?? ''}`),
      })),
    }), [albums, artists, songs]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(emptySearch);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const abortController = new AbortController();
    let localResults: SearchResults = {
      albums: searchFilter === 'all' || searchFilter === 'albums'
        ? rankDirectSearchItems(searchCatalog.albums, trimmed, 60)
        : [],
      artists: searchFilter === 'all' || searchFilter === 'artists'
        ? rankDirectSearchItems(searchCatalog.artists, trimmed, 30)
        : [],
      songs: searchFilter === 'all' || searchFilter === 'songs'
        ? rankDirectSearchItems(searchCatalog.songs, trimmed, 100)
        : [],
    };
    setSearchResults(localResults);

    const needsFuzzySearch = !localResults.albums.length
      && !localResults.artists.length
      && !localResults.songs.length;
    const fuzzyTimer = needsFuzzySearch ? setTimeout(() => {
      if (cancelled) return;
      localResults = {
        albums: searchFilter === 'all' || searchFilter === 'albums'
          ? rankSearchItems(searchCatalog.albums, trimmed, 60)
          : [],
        artists: searchFilter === 'all' || searchFilter === 'artists'
          ? rankSearchItems(searchCatalog.artists, trimmed, 30)
          : [],
        songs: searchFilter === 'all' || searchFilter === 'songs'
          ? rankSearchItems(searchCatalog.songs, trimmed, 100)
          : [],
      };
      setSearchResults(localResults);
    }, 90) : undefined;

    const timer = setTimeout(() => {
      const client = clientRef.current;
      if (!client || !connected) {
        return;
      }
      setSearching(true);
      void client.search(trimmed, abortController.signal).then(
        (remoteResults) => {
          if (!cancelled) setSearchResults(mergeSearchResults(localResults, remoteResults));
        },
        () => {
          // I risultati locali restano visibili anche durante un calo di rete.
        },
      ).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      abortController.abort();
      clearTimeout(timer);
      if (fuzzyTimer) clearTimeout(fuzzyTimer);
    };
  }, [connected, query, searchCatalog, searchFilter]);

  useEffect(() => {
    if (!detail) return;
    const client = clientRef.current;
    if (!client) return;
    const abortController = new AbortController();
    setDetailBusy(true);
    setDetailAlbum(null);
    setDetailArtist(null);
    setDetailPlaylist(null);
    setGenreSongs([]);
    const request =
      detail.type === 'album'
        ? client.getAlbum(detail.id, abortController.signal).then(setDetailAlbum)
        : detail.type === 'artist'
          ? client.getArtist(detail.id, abortController.signal).then(setDetailArtist)
          : detail.type === 'playlist'
            ? client.getPlaylist(detail.id, abortController.signal).then(setDetailPlaylist)
            : client.getSongsByGenre(
                detail.sources?.length ? detail.sources : detail.genre,
                500,
                0,
                abortController.signal,
              ).then(setGenreSongs);
    void request.catch((error) => {
      if (abortController.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : String(error));
      setDetail(null);
    }).finally(() => {
      if (!abortController.signal.aborted) setDetailBusy(false);
    });
    return () => abortController.abort();
  }, [detail]);

  function togglePlayback() {
    if (!currentSong) {
      const firstAlbum = albums[0];
      if (firstAlbum) setDetail({ type: 'album', id: firstAlbum.id });
      return;
    }
    if (playerStatus.playing) player.pause();
    else player.play();
  }

  async function toggleFavorite(song: Song) {
    const client = clientRef.current;
    if (!client || !songBelongsToSource(song, activeSourceKey)) {
      setMessage('Collega il server di questo brano per modificarne i preferiti.');
      return;
    }
    const shouldStar = !song.starred;
    try {
      await client.setStarred(song.id, shouldStar);
      setQueue((current) =>
        current.map((item) =>
          downloadKey(item, activeSourceKey) === downloadKey(song, activeSourceKey)
            ? { ...item, starred: shouldStar ? new Date().toISOString() : undefined }
            : item,
        ),
      );
      setSongs((current) =>
        current.map((item) =>
          item.id === song.id
            ? { ...item, starred: shouldStar ? new Date().toISOString() : undefined }
            : item,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function playAlbum(album: Album) {
    const client = clientRef.current;
    if (!client) {
      setSettingsSection('hub');
      setTab('settings');
      return;
    }
    try {
      setMessage(`Caricamento di ${album.name}…`);
      const fullAlbum = album.song?.length ? album : await client.getAlbum(album.id);
      if (fullAlbum.song?.length) {
        await loadSong(fullAlbum.song, 0);
        setMessage('Navidrome online');
      } else {
        setMessage('Questo album non contiene brani riproducibili.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function requestDownload(song: Song, allowRemove = true) {
    if (!bootstrapReady || disconnectingRef.current) return;
    const sourceKey = song.offlineSourceKey ?? activeSourceKey;
    const scopedSong = { ...song, offlineSourceKey: sourceKey };
    const key = downloadKey(scopedSong);
    const existing = offlineTracksRef.current.find((track) => downloadKey(track.song) === key);
    if (existing && !allowRemove) return;
    const client = clientRef.current;
    const operation = downloadQueueRef.current.enqueue(key, async () => {
      const updateJob = (job: DownloadJob) => setDownloadJobs((current) => ({ ...current, [key]: job }));
      try {
        if (existing) {
          updateJob({ song: scopedSong, status: 'removing' });
          const next = await removeOfflineTrack(key);
          offlineTracksRef.current = next;
          setOfflineTracks(next);
        } else {
          if (!client || sourceKey !== activeSourceKey || disconnectingRef.current) {
            throw new Error('Collega il server di questo brano per scaricarlo.');
          }
          updateJob({ song: scopedSong, status: 'downloading' });
          const track = await downloadTrack(scopedSong, await client.downloadUrl(song.id), (progress) => {
            updateJob({ song: scopedSong, status: 'downloading', progress });
          });
          const next = [track, ...offlineTracksRef.current.filter((entry) => downloadKey(entry.song) !== key)];
          offlineTracksRef.current = next;
          setOfflineTracks(next);
        }
        setDownloadJobs((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      } catch (error) {
        updateJob({ song: scopedSong, status: 'error', error: error instanceof Error ? error.message : 'Download non riuscito' });
      }
    });
    if (operation) setDownloadJobs((current) => ({ ...current, [key]: { song: scopedSong, status: 'queued' } }));
  }

  const currentAlbums = albums.length ? albums : demoAlbums;
  const connectionConfigured = Boolean(
    connection.serverUrl.trim() && connection.username.trim(),
  );
  const detailTitle =
    detail?.type === 'genre'
      ? detail.genre
      : detailAlbum?.name ?? detailArtist?.name ?? detailPlaylist?.name ?? '';

  return (
    <OfflineContext.Provider value={{ tracks: offlineByKey, jobs: downloadJobs, sourceKey: activeSourceKey,
      onDownload: requestDownload, onDownloadMany: (items) => items.forEach((song) => requestDownload(song, false)) }}>
    <SafeAreaView style={styles.app} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <LinearGradient
        colors={preferences.amoledTheme ? ['#000000', '#000000', '#000000'] : ['#0D0B15', '#07080C', '#050609']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        {!compact && (
          <SideNav
            tab={tab}
            connected={connected}
            onTab={(next) => {
              setDetail(null);
              if (next === 'settings') setSettingsSection('hub');
              setTab(next);
            }}
            onLibraryMode={(mode) => {
              setDetail(null);
              setLibraryMode(mode);
              setTab('library');
            }}
          />
        )}

        <View style={styles.content}>
          <AppHeader
            authenticatedUsername={authenticatedUsername}
            tab={tab}
            compact={compact}
            connected={connected}
            message={message}
            onSearch={() => {
              setDetail(null);
              setTab('search');
            }}
            onBack={
              detail
                ? () => setDetail(null)
                : tab === 'settings' && settingsSection !== 'hub'
                  ? () => setSettingsSection('hub')
                  : tab === 'library' && libraryMode !== 'hub'
                    ? () => setLibraryMode('hub')
                    : undefined
            }
            title={
              detail
                ? detailTitle
                : tab === 'settings' && settingsSection !== 'hub'
                  ? settingsSectionTitle(settingsSection)
                  : tab === 'library' && libraryMode !== 'hub'
                    ? libraryModeTitle(libraryMode)
                    : undefined
            }
          />

          {detail ? (
            <DetailScreen
              detail={detail}
              album={detailAlbum}
              artist={detailArtist}
              playlist={detailPlaylist}
              genreSongs={genreSongs}
              busy={detailBusy}
              columns={columns}
              onAlbum={(album) => setDetail({ type: 'album', id: album.id })}
              onArtist={(artist) => setDetail({ type: 'artist', id: artist.id })}
              onPlaySongs={(songs, index = 0) => void loadSong(songs, index)}
              playlistEditable={!!detailPlaylist && isPlaylistOwnedBy(detailPlaylist, authenticatedUsername)}
              onManagePlaylist={() => setManagePlaylistOpen(true)}
              onMoreSong={(song) => {
                setActionSong(song);
                setActionsOpen(true);
              }}
            />
          ) : tab === 'settings' && settingsSection === 'server' ? (
            <ConnectionScreen
              value={connection}
              onChange={setConnection}
              onConnect={() => void syncLibrary()}
              busy={busy || disconnecting}
              message={message}
              connected={connected}
              canDisconnect={!!authenticatedUsername}
              disconnectDisabled={busy || disconnecting || downloadsBusy || !bootstrapReady}
              onDisconnect={() => setDisconnectOpen(true)}
              stats={{
                albums: albums.length,
                artists: artists.length,
                genres: genres.length,
              }}
            />
          ) : tab === 'settings' ? (
            <SettingsScreen
              section={settingsSection}
              connected={connected}
              offlineCount={offlineTracks.length}
              songCount={songs.length}
              busy={busy}
              preferences={preferences}
              playbackRate={player.playbackRate}
              sleepUntil={sleepUntil}
              onSection={setSettingsSection}
              onPreference={(key, value) => setPreferences((current) => ({ ...current, [key]: value }))}
              onEqualizer={() => setEqOpen(true)}
              onSpeed={() => setSpeedOpen(true)}
              onSleep={() => setSleepOpen(true)}
              onOpenOffline={() => {
                setSettingsSection('hub');
                setLibraryMode('offline');
                setTab('library');
              }}
              onClearOffline={() => setClearDownloadsOpen(true)}
              downloadsBusy={downloadsBusy}
              onSync={() => {
                if (connected) void syncLibrary();
                else setSettingsSection('server');
              }}
              onShareDiagnostics={() => void Share.share({
                message: `Music Bank ${APP_VERSION} · ${albums.length} album · ${songs.length} brani · ${genres.length} generi · Navidrome ${connected ? 'online' : 'offline'}`,
              })}
            />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scroll,
                {
                  paddingBottom:
                    (compact ? 154 : currentSong ? 115 : 40) + insets.bottom,
                },
              ]}
            >
              {tab === 'home' && (
                <HomeScreen
                  albums={currentAlbums}
                  featured={albums.find((album) => album.id === featuredAlbumId) ?? currentAlbums[0]}
                  artists={artists}
                  genres={genres}
                  history={history}
                  connected={connected}
                  configured={connectionConfigured}
                  columns={columns}
                  onGenre={(genre) => setDetail({ type: 'genre', genre: genre.value, sources: genre.sourceValues })}
                  onPlayAlbum={playAlbum}
                  onSong={(items, index) => void loadSong(items, index)}
                  onMoreSong={(song) => {
                    setActionSong(song);
                    setActionsOpen(true);
                  }}
                  onArtist={(artist) => setDetail({ type: 'artist', id: artist.id })}
                  onRandom={async () => {
                    const songs = await clientRef.current?.getRandomSongs(100);
                    if (songs?.length) void loadSong(songs, 0);
                  }}
                  onConnect={() => {
                    setSettingsSection('server');
                    setTab('settings');
                  }}
                />
              )}
              {tab === 'library' && (
                <LibraryScreen
                  mode={libraryMode}
                  onMode={setLibraryMode}
                  albums={albums}
                  artists={artists}
                  genres={genres}
                  playlists={playlists}
                  username={authenticatedUsername}
                  connected={connected}
                  songs={songs}
                  radios={radios}
                  offlineTracks={offlineTracks}
                  columns={columns}
                  onAlbum={(album) => setDetail({ type: 'album', id: album.id })}
                  onPlayAlbum={(album) => void playAlbum(album)}
                  onArtist={(artist) => setDetail({ type: 'artist', id: artist.id })}
                  onGenre={(genre) => setDetail({ type: 'genre', genre: genre.value, sources: genre.sourceValues })}
                  onPlaylist={(playlist) =>
                    setDetail({ type: 'playlist', id: playlist.id })
                  }
                  onCreatePlaylist={() => setCreatePlaylistOpen(true)}
                  onSong={(items, index) => void loadSong(items, index)}
                  onMoreSong={(song) => {
                    setActionSong(song);
                    setActionsOpen(true);
                  }}
                />
              )}
              {tab === 'search' && (
                <SearchScreen
                  query={query}
                  onQuery={setQuery}
                  filter={searchFilter}
                  onFilter={setSearchFilter}
                  results={searchResults}
                  searching={searching}
                  columns={columns}
                  onAlbum={(album) => setDetail({ type: 'album', id: album.id })}
                  onPlayAlbum={(album) => void playAlbum(album)}
                  onArtist={(artist) => setDetail({ type: 'artist', id: artist.id })}
                  onSong={(songs, index) => void loadSong(songs, index)}
                  onMoreSong={(song) => {
                    setActionSong(song);
                    setActionsOpen(true);
                  }}
                />
              )}
            </ScrollView>
          )}
        </View>
      </View>

      {currentSong && tab !== 'settings' && !detailBusy && (
        <MiniPlayer
          song={currentSong}
          status={playerStatus}
          compact={compact}
          bottom={compact ? 68 + insets.bottom : 12}
          onOpen={() => setPlayerOpen(true)}
          onToggle={togglePlayback}
          onNext={playNext}
        />
      )}
      {compact && (
        <BottomNav
          tab={tab}
          bottomInset={insets.bottom}
          onTab={(next) => {
            setDetail(null);
            if (next === 'settings') setSettingsSection('hub');
            setTab(next);
          }}
        />
      )}

      <FullPlayer
        visible={playerOpen}
        song={currentSong}
        status={playerStatus}
        shuffle={shuffle}
        repeat={repeat}
        bottomInset={insets.bottom}
        onClose={() => setPlayerOpen(false)}
        onToggle={togglePlayback}
        onNext={playNext}
        onPrevious={playPrevious}
        onSeek={(seconds) => void player.seekTo(seconds)}
        onShuffle={() => setShuffle((value) => !value)}
        onRepeat={() => {
          const next = repeat === 'none' ? 'all' : repeat === 'all' ? 'one' : 'none';
          setRepeat(next);
          player.loop = next === 'one';
        }}
        onQueue={() => setQueueOpen(true)}
        onEqualizer={() => setEqOpen(true)}
        onMore={() => {
          setActionSong(null);
          setActionsOpen(true);
        }}
        onBackTen={() => void player.seekTo(Math.max(0, playerStatus.currentTime - 10))}
        onForwardTen={() => void player.seekTo(Math.min(playerStatus.duration, playerStatus.currentTime + 10))}
        onSpeed={() => setSpeedOpen(true)}
        onSleep={() => setSleepOpen(true)}
        onFavorite={() => currentSong && void toggleFavorite(currentSong)}
        showAudioDetails={preferences.showAudioDetails}
      />
      <QueueModal
        visible={queueOpen}
        queue={queue}
        currentIndex={queueIndex}
        onClose={() => setQueueOpen(false)}
        onPick={(index) => void loadSong(queue, index)}
      />
      <EqualizerModal
        visible={eqOpen}
        onClose={() => setEqOpen(false)}
      />
      <MoreActionsModal
        visible={actionsOpen}
        song={actionTarget}
        onClose={() => {
          setActionsOpen(false);
          setActionSong(null);
        }}
        onEqualizer={() => {
          setActionsOpen(false);
          setEqOpen(true);
        }}
        onSmartQueue={async () => {
          const extra = await clientRef.current?.getRandomSongs(50, actionTarget?.genre);
          if (actionTarget && extra?.length) {
            void loadSong([actionTarget, ...extra.filter((song) => song.id !== actionTarget.id)], 0);
            setMessage('Smart queue creata.');
          }
          setActionsOpen(false);
        }}
        onMix={async () => {
          const mix = await clientRef.current?.getRandomSongs(80, actionTarget?.genre);
          if (mix?.length) void loadSong(mix, 0);
          setActionsOpen(false);
        }}
        onAddPlaylist={() => {
          setActionsOpen(false);
          setPlaylistPickerOpen(true);
        }}
        onFavorite={() => {
          if (actionTarget) void toggleFavorite(actionTarget);
          setActionsOpen(false);
          setActionSong(null);
        }}
        onAlbum={() => {
          if (actionTarget?.albumId) {
            setActionsOpen(false);
            setPlayerOpen(false);
            setDetail({ type: 'album', id: actionTarget.albumId });
          }
        }}
        onArtist={() => {
          if (actionTarget?.artistId) {
            setActionsOpen(false);
            setPlayerOpen(false);
            setDetail({ type: 'artist', id: actionTarget.artistId });
          }
        }}
        onGenre={() => {
          if (actionTarget?.genre) {
            const cleanedGenre = genres.find(
              (genre) =>
                genre.value.toLocaleLowerCase('it') === actionTarget.genre?.toLocaleLowerCase('it') ||
                genre.sourceValues?.some(
                  (source) => source.toLocaleLowerCase('it') === actionTarget.genre?.toLocaleLowerCase('it'),
                ),
            );
            setActionsOpen(false);
            setPlayerOpen(false);
            setDetail({
              type: 'genre',
              genre: cleanedGenre?.value ?? actionTarget.genre,
              sources: cleanedGenre?.sourceValues,
            });
          }
        }}
        onDownload={() => {
          if (actionTarget) requestDownload(actionTarget);
          setActionsOpen(false);
        }}
        onShare={() => actionTarget && void Share.share({ message: `${actionTarget.title} — ${actionTarget.artist ?? 'Artista sconosciuto'} · ascoltato con Music Bank` })}
        onWeb={() => actionTarget && void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${actionTarget.artist ?? ''} ${actionTarget.title}`)}`)}
      />
      <PlaylistPickerModal
        visible={playlistPickerOpen}
        playlists={playlists}
        username={authenticatedUsername}
        onClose={() => setPlaylistPickerOpen(false)}
        onPick={async (playlist) => {
          if (!actionTarget) return;
          if (!clientRef.current || !songBelongsToSource(actionTarget, activeSourceKey)) {
            setMessage('Collega il server di questo brano per aggiungerlo a una playlist.');
            setPlaylistPickerOpen(false);
            return;
          }
          try {
            await clientRef.current?.addSongToPlaylist(playlist.id, actionTarget.id);
            setMessage(`Aggiunto a ${playlist.name}.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
          }
          setPlaylistPickerOpen(false);
        }}
      />
      <CreatePlaylistModal
        visible={createPlaylistOpen}
        onClose={() => setCreatePlaylistOpen(false)}
        onCreate={async (rawName) => {
          const client = clientRef.current;
          if (!client || !connected) throw new Error('Collega il server prima di creare una playlist.');
          const name = normalizePlaylistName(rawName);
          const created = await client.createPlaylist(name);
          let updatedPlaylists: Playlist[];
          try {
            updatedPlaylists = await client.getPlaylists();
          } catch (error) {
            if (!created) throw error;
            updatedPlaylists = [created, ...playlists.filter((playlist) => playlist.id !== created.id)];
          }
          setPlaylists(updatedPlaylists);
          setMessage(`Playlist “${name}” creata.`);
          void saveLibrary({
            albums,
            artists,
            genres,
            playlists: updatedPlaylists,
            songs,
            radios,
            syncedAt: Date.now(),
          }).catch(() => setMessage(`Playlist “${name}” creata sul server · cache locale da aggiornare.`));
        }}
      />
      <ManagePlaylistModal
        visible={managePlaylistOpen}
        playlist={detailPlaylist}
        onClose={() => setManagePlaylistOpen(false)}
        onSave={async ({ name, comment, public: isPublic, songs: orderedSongs }) => {
          const client = clientRef.current;
          const playlist = detailPlaylist;
          if (!client || !playlist || !isPlaylistOwnedBy(playlist, authenticatedUsername)) {
            throw new Error('Questa playlist non è modificabile dall’account collegato.');
          }
          await client.updatePlaylistMetadata(playlist.id, { name, comment, public: isPublic });
          await client.replacePlaylistSongs(playlist.id, orderedSongs.map((song) => song.id));
          const [updatedDetail, updatedPlaylists] = await Promise.all([
            client.getPlaylist(playlist.id),
            client.getPlaylists(),
          ]);
          setDetailPlaylist(updatedDetail);
          setPlaylists(updatedPlaylists);
          setMessage(`Playlist “${name}” aggiornata.`);
          void saveLibrary({ albums, artists, genres, playlists: updatedPlaylists, songs, radios, syncedAt: Date.now() });
        }}
        onDelete={async () => {
          const client = clientRef.current;
          const playlist = detailPlaylist;
          if (!client || !playlist || !isPlaylistOwnedBy(playlist, authenticatedUsername)) {
            throw new Error('Questa playlist non è eliminabile dall’account collegato.');
          }
          await client.deletePlaylist(playlist.id);
          const updatedPlaylists = await client.getPlaylists();
          setPlaylists(updatedPlaylists);
          setDetailPlaylist(null);
          setDetail(null);
          setMessage(`Playlist “${playlist.name}” eliminata.`);
          void saveLibrary({ albums, artists, genres, playlists: updatedPlaylists, songs, radios, syncedAt: Date.now() });
        }}
      />
      <ChoiceModal
        visible={speedOpen}
        title="Velocità di riproduzione"
        options={['0.75×', '1×', '1.25×', '1.5×', '2×']}
        onClose={() => setSpeedOpen(false)}
        onPick={(label) => {
          setSpeedOpen(false);
          const rate = Number.parseFloat(label.replace(',', '.'));
          if (!Number.isFinite(rate) || rate < 0.1 || rate > 2) {
            setMessage('Velocità non valida.');
            return;
          }
          if (!player.isLoaded && !player.currentStatus.isLoaded) {
            setMessage('Attendi il caricamento del brano prima di cambiare velocità.');
            return;
          }
          try {
            player.setPlaybackRate(rate);
            setPreferences((current) => ({ ...current, defaultPlaybackRate: rate }));
          } catch (error) {
            setMessage(
              `Cambio velocità non riuscito: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }}
      />
      <ChoiceModal
        visible={sleepOpen}
        title="Timer riproduzione"
        options={['15 minuti', '30 minuti', '60 minuti', 'Disattiva']}
        onClose={() => setSleepOpen(false)}
        onPick={(label) => {
          const minutes = Number(label.split(' ')[0]);
          setSleepUntil(Number.isFinite(minutes) ? Date.now() + minutes * 60_000 : null);
          setSleepOpen(false);
        }}
      />
      <ChoiceModal
        visible={disconnectOpen}
        title="Disconnettersi dal server?"
        description="Verranno rimossi l’accesso salvato e il catalogo sincronizzato. I file scaricati rimangono sul dispositivo."
        options={['Annulla', 'Disconnetti dal server']}
        onClose={() => setDisconnectOpen(false)}
        onPick={(label) => {
          if (label === 'Disconnetti dal server') void disconnectServer();
          else setDisconnectOpen(false);
        }}
      />
      <ChoiceModal
        visible={clearDownloadsOpen}
        title="Rimuovere tutti i download?"
        options={['Annulla', `Rimuovi ${offlineTracks.length} download`]}
        onClose={() => setClearDownloadsOpen(false)}
        onPick={(label) => {
          if (label.startsWith('Rimuovi')) {
            void downloadQueueRef.current.enqueue('__clear_all__', async () => {
              try {
                await clearOfflineTracks();
                offlineTracksRef.current = [];
                setOfflineTracks([]);
                setMessage('Tutti i download offline sono stati rimossi.');
              } catch (error) {
                setMessage(`Rimozione non riuscita: ${error instanceof Error ? error.message : String(error)}`);
              }
            });
          }
          setClearDownloadsOpen(false);
        }}
      />
    </SafeAreaView>
    </OfflineContext.Provider>
  );
}

function AppHeader({
  authenticatedUsername,
  tab,
  compact,
  connected,
  message,
  onSearch,
  onBack,
  title,
}: {
  tab: Tab;
  compact: boolean;
  connected: boolean;
  message: string;
  onSearch: () => void;
  onBack?: () => void;
  title?: string;
  authenticatedUsername: string;
}) {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const refreshHour = () => setHour(new Date().getHours());
    const interval = setInterval(refreshHour, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshHour();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  const titles: Record<Tab, string> = {
    home: homeGreeting(connected, authenticatedUsername, hour),
    library: 'La tua libreria',
    search: 'Cerca',
    settings: 'Impostazioni',
  };
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.headerTitleRow}>
        {onBack && (
          <IconButton icon="arrow-left" onPress={onBack} />
        )}
        <View style={{ flex: 1 }}>
          {compact && <Text style={styles.brand}>MUSIC BANK</Text>}
          <Text numberOfLines={1} style={[styles.headerTitle, compact && styles.headerTitleMobile]}>
            {title || titles[tab]}
          </Text>
          {!compact && (
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {connected ? 'Navidrome online' : message}
            </Text>
          )}
        </View>
      </View>
      {!onBack && <IconButton icon="magnify" onPress={onSearch} />}
    </View>
  );
}

function SideNav({
  tab,
  connected,
  onTab,
  onLibraryMode,
}: {
  tab: Tab;
  connected: boolean;
  onTab: (tab: Tab) => void;
  onLibraryMode: (mode: LibraryMode) => void;
}) {
  return (
    <View style={styles.sideNav}>
      <View style={styles.logo}>
        <LinearGradient colors={[lime, '#7DEB48']} style={styles.logoIcon}>
          <Image source={require('./assets/logo-mark.png')} style={styles.logoMark} />
        </LinearGradient>
        <Text style={styles.logoText}>MUSIC{'\n'}BANK</Text>
      </View>
      <Text style={styles.navHeading}>SCOPRI</Text>
      <NavItem icon="home-variant-outline" label="Home" active={tab === 'home'} onPress={() => onTab('home')} />
      <NavItem icon="magnify" label="Cerca" active={tab === 'search'} onPress={() => onTab('search')} />
      <NavItem icon="album" label="Libreria" active={tab === 'library'} onPress={() => onTab('library')} />
      <Text style={styles.navHeading}>LA TUA MUSICA</Text>
      <NavItem icon="account-music-outline" label="Artisti" onPress={() => onLibraryMode('artists')} />
      <NavItem icon="guitar-electric" label="Generi" onPress={() => onLibraryMode('genres')} />
      <NavItem icon="playlist-music" label="Playlist" onPress={() => onLibraryMode('playlists')} />
      <View style={{ flex: 1 }} />
      <Pressable style={styles.serverPill} onPress={() => onTab('settings')}>
        <View style={[styles.dot, connected && styles.dotOn]} />
        <Text style={styles.serverPillText}>
          {connected ? 'Server connesso' : 'Impostazioni'}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color="#898793" />
      </Pressable>
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.navItem, active && styles.navItemOn]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? lime : '#85838E'} />
      <Text style={[styles.navItemText, active && { color: lime }]}>{label}</Text>
    </Pressable>
  );
}

function HomeScreen({
  albums,
  featured,
  artists,
  genres,
  history,
  connected,
  configured,
  columns,
  onGenre,
  onPlayAlbum,
  onSong,
  onMoreSong,
  onArtist,
  onRandom,
  onConnect,
}: {
  albums: Album[];
  featured: Album;
  artists: Artist[];
  genres: Genre[];
  history: HistoryEntry[];
  connected: boolean;
  configured: boolean;
  columns: number;
  onGenre: (genre: Genre) => void;
  onPlayAlbum: (album: Album) => void;
  onSong: (songs: Song[], index: number) => void;
  onMoreSong: (song: Song) => void;
  onArtist: (artist: Artist) => void;
  onRandom: () => void;
  onConnect: () => void;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const recentSongs = useMemo(
    () => history.slice(0, 8).map((entry) => entry.song),
    [history],
  );
  const recentArtists = useMemo(() => {
    const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
    const artistsByName = new Map(
      artists.map((artist) => [normalizeSearchText(artist.name), artist]),
    );
    return [...new Map(
      history
        .map((entry) => entry.song.artistId
          ? artistsById.get(entry.song.artistId)
          : artistsByName.get(normalizeSearchText(entry.song.artist ?? '')))
        .filter((artist): artist is Artist => Boolean(artist))
        .map((artist) => [artist.id, artist]),
    ).values()].slice(0, 8);
  }, [artists, history]);
  const hasLibrary = albums.length > 0 && featured.id !== 'demo-1';
  return (
    <>
      <LinearGradient colors={['#3B2477', '#172047', '#111520']} style={[styles.hero, mobile && styles.heroMobile]}>
        <View style={styles.heroGlow} />
        <View style={[styles.heroCopy, mobile && styles.heroCopyMobile]}>
          <Text style={styles.eyebrow}>{connected ? 'SCELTO DALLA TUA LIBRERIA' : hasLibrary ? 'LIBRERIA LOCALE' : 'BENVENUTO'}</Text>
          <Text numberOfLines={2} style={[styles.heroTitle, mobile && styles.heroTitleMobile]}>{featured.name}</Text>
          <Text numberOfLines={1} style={[styles.heroArtist, mobile && styles.heroArtistMobile]}>{featured.artist}</Text>
          <View style={[styles.heroActions, mobile && styles.heroActionsMobile]}>
            <Pressable style={styles.primaryButton} onPress={() => hasLibrary ? onPlayAlbum(featured) : onConnect()}>
              <MaterialCommunityIcons name={hasLibrary ? 'play' : 'server-network'} size={20} color="#10130B" />
              <Text numberOfLines={1} style={styles.primaryButtonText}>{hasLibrary ? 'Riproduci' : configured ? 'Riprova server' : 'Collega server'}</Text>
            </Pressable>
            {connected && <IconButton icon="shuffle-variant" onPress={onRandom} light />}
          </View>
        </View>
        {featured.coverUrl && (
          <Image source={{ uri: featured.coverUrl }} style={[styles.heroCover, mobile && styles.heroCoverMobile]} />
        )}
      </LinearGradient>

      {hasLibrary && (
        <View style={styles.quickActions}>
          <QuickAction icon="shuffle-variant" title="Mix casuale" subtitle="100 brani dalla libreria" onPress={onRandom} />
        </View>
      )}

      {!!recentArtists.length && (
        <>
          <SectionTitle title="Artisti ascoltati di recente" subtitle="In base ai tuoi ultimi ascolti" />
          <ArtistGrid artists={recentArtists} columns={Math.min(columns, 4)} onArtist={onArtist} />
        </>
      )}

      {!!genres.length && (
        <>
          <SectionTitle title="Generi musicali" subtitle="Esplora la raccolta per stile" />
          <GenreGrid genres={genres.slice(0, 12)} onGenre={onGenre} />
        </>
      )}

      {!!recentSongs.length && (
        <>
          <SectionTitle title="Continua l’ascolto" subtitle="La tua cronologia recente" />
          <TrackList songs={recentSongs} onPlay={(index) => onSong(recentSongs, index)} onMore={onMoreSong} />
        </>
      )}

      {!!artists.length && (
        <>
          <SectionTitle title="Artisti da riscoprire" subtitle="Dalla tua raccolta" />
          <ArtistGrid artists={artists.slice(0, 8)} columns={Math.min(columns, 4)} onArtist={onArtist} />
        </>
      )}

    </>
  );
}

function LibraryScreen({
  mode,
  onMode,
  albums,
  artists,
  genres,
  playlists,
  username,
  connected,
  songs,
  radios,
  offlineTracks,
  columns,
  onAlbum,
  onPlayAlbum,
  onArtist,
  onGenre,
  onPlaylist,
  onCreatePlaylist,
  onSong,
  onMoreSong,
}: {
  mode: LibraryMode;
  onMode: (mode: LibraryMode) => void;
  albums: Album[];
  artists: Artist[];
  genres: Genre[];
  playlists: Playlist[];
  username: string;
  connected: boolean;
  songs: Song[];
  radios: InternetRadioStation[];
  offlineTracks: OfflineTrack[];
  columns: number;
  onAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  onArtist: (artist: Artist) => void;
  onGenre: (genre: Genre) => void;
  onPlaylist: (playlist: Playlist) => void;
  onCreatePlaylist: () => void;
  onSong: (songs: Song[], index: number) => void;
  onMoreSong: (song: Song) => void;
}) {
  const [genreQuery, setGenreQuery] = useState('');
  const favoriteSongs = useMemo(
    () => songs.filter((song) => !!song.starred),
    [songs],
  );
  const years = useMemo(
    () => Array.from(new Set(albums
      .map((album) => album.year)
      .filter((year): year is number => typeof year === 'number')))
      .sort((a, b) => Number(b) - Number(a)),
    [albums],
  );
  const yearCounts = useMemo(() => {
    const counts = new Map<number, number>();
    albums.forEach((album) => {
      if (album.year) counts.set(album.year, (counts.get(album.year) ?? 0) + 1);
    });
    return counts;
  }, [albums]);
  const filteredGenres = useMemo(() => {
    if (!genreQuery.trim()) return genres;
    const entries = genres.map((genre) => ({
      item: genre,
      text: normalizeSearchText(`${genre.value} ${(genre.sourceValues ?? []).join(' ')}`),
    }));
    return rankSearchItems(entries, genreQuery, genres.length);
  }, [genreQuery, genres]);
  const playlistGroups = useMemo(
    () => partitionPlaylists(playlists, username),
    [playlists, username],
  );
  const tiles: Array<[LibraryMode, IconName, string, string]> = [
    ['albums', 'album', 'Album', `${albums.length}`],
    ['artists', 'account-music', 'Artisti album', `${artists.length}`],
    ['genres', 'tag-outline', 'Generi musicali', `${genres.length}`],
    ['tracks', 'music-note', 'Tracce', `${songs.length}`],
    ['favorites', 'heart', 'Preferiti', `${favoriteSongs.length}`],
    ['playlists', 'playlist-music', 'Playlist', `${playlists.length}`],
    ['radio', 'radio', 'Radio Internet', `${radios.length}`],
    ['years', 'calendar-range', 'Anni', `${years.length}`],
    ['offline', 'download-circle', 'Offline', `${offlineTracks.length}`],
  ];
  return (
    <>
      {mode === 'hub' && (
        <View style={styles.libraryHub}>
          {tiles.map(([id, icon, label, count]) => (
            <Pressable key={id} style={styles.libraryTile} onPress={() => onMode(id)}>
              <View style={styles.libraryTileIcon}>
                <MaterialCommunityIcons name={icon} size={28} color={lime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.libraryTileTitle}>{label}</Text>
                <Text style={styles.libraryTileMeta}>{count} elementi</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#666470" />
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'albums' && (
        <CollectionPager
          items={albums}
          pageSize={Math.max(20, columns * 10)}
          label="album"
          renderPage={(page) => <AlbumGrid albums={page} columns={columns} onAlbum={onAlbum} onPlay={onPlayAlbum} />}
        />
      )}
      {mode === 'artists' && (
        <CollectionPager
          items={artists}
          pageSize={Math.max(20, columns * 10)}
          label="artisti"
          renderPage={(page) => <ArtistGrid artists={page} columns={columns} onArtist={onArtist} />}
        />
      )}
      {mode === 'genres' && (
        <>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={23} color="#85838E" />
            <TextInput
              value={genreQuery}
              onChangeText={setGenreQuery}
              placeholder="Cerca un genere musicale"
              placeholderTextColor="#686671"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {!!genreQuery && <IconButton icon="close-circle" onPress={() => setGenreQuery('')} small />}
          </View>
          <Text style={styles.filterSummary}>{filteredGenres.length} di {genres.length} generi</Text>
          {filteredGenres.length
            ? <CollectionPager
                items={filteredGenres}
                pageSize={60}
                label="generi"
                renderPage={(page) => <GenreGrid genres={page} onGenre={onGenre} />}
              />
            : <EmptyState icon="tag-search-outline" title="Nessun genere trovato" text="Prova con un nome o una parte diversa." />}
        </>
      )}
      {mode === 'tracks' && (
        <CollectionPager
          items={songs}
          pageSize={100}
          label="brani"
          renderPage={(page, offset) => <TrackList songs={page} onPlay={(index) => onSong(songs, offset + index)} onMore={onMoreSong} />}
        />
      )}
      {mode === 'favorites' && (
        favoriteSongs.length
          ? <CollectionPager
              items={favoriteSongs}
              pageSize={100}
              label="preferiti"
              renderPage={(page, offset) => <TrackList songs={page} onPlay={(index) => onSong(favoriteSongs, offset + index)} onMore={onMoreSong} />}
            />
          : <EmptyState icon="heart-outline" title="Nessun preferito" text="Aggiungi un cuore dal player o dal menu del brano." />
      )}
      {mode === 'offline' && (
        <OfflineDownloads onSong={onSong} onMoreSong={onMoreSong} />
      )}
      {mode === 'years' && (
        <View style={styles.libraryHub}>
          {years.map((year) => (
            <Pressable key={year} style={styles.libraryTile} onPress={() => {
              const first = albums.find((album) => album.year === year);
              if (first) onAlbum(first);
            }}>
              <MaterialCommunityIcons name="calendar" size={27} color={lime} />
              <Text style={styles.libraryTileTitle}>{year}</Text>
              <Text style={styles.libraryTileMeta}>{yearCounts.get(year) ?? 0} album</Text>
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'radio' && (
        <View style={styles.list}>
          {radios.map((station) => (
            <ListRow key={station.id} icon="radio" title={station.name} subtitle={station.homePageUrl ?? 'Radio Internet'} onPress={() => void Linking.openURL(station.streamUrl)} />
          ))}
          {!radios.length && <EmptyState icon="radio-off" title="Nessuna radio" text="Aggiungi le stazioni radio dal tuo server Navidrome." />}
        </View>
      )}
      {mode === 'playlists' && (
        <View style={styles.playlistPage}>
          <View style={styles.playlistIntro}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Le tue playlist</Text>
              <Text style={styles.sectionSubtitle}>Crea raccolte personali e ritrova quelle condivise dal server.</Text>
            </View>
            <Pressable
              disabled={!connected}
              style={[styles.primaryButton, !connected && styles.buttonDisabled]}
              onPress={onCreatePlaylist}
            >
              <MaterialCommunityIcons name="playlist-plus" size={20} color="#10130B" />
              <Text style={styles.primaryButtonText}>Nuova playlist</Text>
            </Pressable>
          </View>

          <SectionTitle title="Le mie playlist" subtitle={`${playlistGroups.owned.length} modificabili`} />
          <View style={styles.list}>
            {playlistGroups.owned.map((playlist) => (
              <ListRow
                key={playlist.id}
                icon="playlist-edit"
                title={playlist.name}
                subtitle={`${playlist.songCount ?? 0} brani · ${playlist.public ? 'Condivisa' : 'Personale'}`}
                onPress={() => onPlaylist(playlist)}
              />
            ))}
            {!playlistGroups.owned.length && (
              <PlaylistEmptyRow
                icon="playlist-plus"
                text={connected ? 'Non hai ancora playlist personali. Creane una con il pulsante qui sopra.' : 'Collega il server per creare playlist personali.'}
              />
            )}
          </View>

          <SectionTitle title="Dal server e condivise" subtitle={`${playlistGroups.server.length} disponibili`} />
          <View style={styles.list}>
            {playlistGroups.server.map((playlist) => (
              <ListRow
                key={playlist.id}
                icon="playlist-music"
                title={playlist.name}
                subtitle={`${playlist.songCount ?? 0} brani${playlist.owner ? ` · ${playlist.owner}` : ' · Server'}`}
                onPress={() => onPlaylist(playlist)}
              />
            ))}
            {!playlistGroups.server.length && <PlaylistEmptyRow icon="server" text="Nessuna playlist condivisa o importata dal server." />}
          </View>
        </View>
      )}
      {mode === 'hub' && !albums.length && <EmptyState icon="cloud-sync-outline" title="Libreria non sincronizzata" text="Apri Impostazioni e avvia la sincronizzazione completa." />}
    </>
  );
}

function SearchScreen({
  query,
  onQuery,
  filter,
  onFilter,
  results,
  searching,
  columns,
  onAlbum,
  onPlayAlbum,
  onArtist,
  onSong,
  onMoreSong,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: SearchFilter;
  onFilter: (value: SearchFilter) => void;
  results: SearchResults;
  searching: boolean;
  columns: number;
  onAlbum: (album: Album) => void;
  onPlayAlbum: (album: Album) => void;
  onArtist: (artist: Artist) => void;
  onSong: (songs: Song[], index: number) => void;
  onMoreSong: (song: Song) => void;
}) {
  const filterOptions: Array<[SearchFilter, string, IconName]> = [
    ['all', 'Tutto', 'magnify'],
    ['artists', 'Artisti', 'account-music-outline'],
    ['songs', 'Brani', 'music-note'],
    ['albums', 'Album', 'album'],
  ];
  const showArtists = filter === 'all' || filter === 'artists';
  const showAlbums = filter === 'all' || filter === 'albums';
  const showSongs = filter === 'all' || filter === 'songs';
  const hasVisibleResults = (showArtists && results.artists.length > 0)
    || (showAlbums && results.albums.length > 0)
    || (showSongs && results.songs.length > 0);
  return (
    <>
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={23} color="#85838E" />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Artista, album, brano o genere"
          placeholderTextColor="#686671"
          autoFocus
          style={styles.searchInput}
        />
        {searching ? <ActivityIndicator color={lime} /> : query ? (
          <IconButton icon="close-circle" onPress={() => onQuery('')} small />
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.searchFilters}>
        {filterOptions.map(([id, label, icon]) => {
          const active = filter === id;
          return (
            <Pressable key={id} style={[styles.searchFilter, active && styles.searchFilterActive]} onPress={() => onFilter(id)}>
              <MaterialCommunityIcons name={icon} size={18} color={active ? '#10130B' : '#A09EAA'} />
              <Text style={[styles.searchFilterText, active && styles.searchFilterTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!query && <EmptyState icon="music-box-outline" title="Cerca in tutto Navidrome" text="I risultati includono artisti, album e singoli brani." />}
      {showArtists && !!results.artists.length && (
        <>
          <SectionTitle title="Artisti" subtitle={`${results.artists.length} risultati`} />
          <CollectionPager
            items={results.artists}
            pageSize={Math.max(20, columns * 10)}
            label="artisti"
            renderPage={(page) => <ArtistGrid artists={page} columns={columns} onArtist={onArtist} />}
          />
        </>
      )}
      {showAlbums && !!results.albums.length && (
        <>
          <SectionTitle title="Album" subtitle={`${results.albums.length} risultati`} />
          <CollectionPager
            items={results.albums}
            pageSize={Math.max(20, columns * 10)}
            label="album"
            renderPage={(page) => <AlbumGrid albums={page} columns={columns} onAlbum={onAlbum} onPlay={onPlayAlbum} />}
          />
        </>
      )}
      {showSongs && !!results.songs.length && (
        <>
          <SectionTitle title="Brani" subtitle={`${results.songs.length} risultati`} />
          <TrackList songs={results.songs} onPlay={(index) => onSong(results.songs, index)} onMore={onMoreSong} />
        </>
      )}
      {!!query && !searching && !hasVisibleResults && (
        <EmptyState icon="magnify-close" title="Nessun risultato" text="Prova con un titolo o un artista diverso." />
      )}
    </>
  );
}

function DetailScreen({
  detail,
  album,
  artist,
  playlist,
  genreSongs,
  busy,
  columns,
  onAlbum,
  onArtist,
  onPlaySongs,
  playlistEditable,
  onManagePlaylist,
  onMoreSong,
}: {
  detail: NonNullable<Detail>;
  album: Album | null;
  artist: Artist | null;
  playlist: Playlist | null;
  genreSongs: Song[];
  busy: boolean;
  columns: number;
  onAlbum: (album: Album) => void;
  onArtist: (artist: Artist) => void;
  onPlaySongs: (songs: Song[], index?: number) => void;
  playlistEditable: boolean;
  onManagePlaylist: () => void;
  onMoreSong: (song: Song) => void;
}) {
  const [genreView, setGenreView] = useState<GenreView>('albums');
  const [genreQuery, setGenreQuery] = useState('');
  useEffect(() => {
    setGenreView('albums');
    setGenreQuery('');
  }, [detail.type === 'genre' ? detail.genre : detail.type]);

  const genreAlbums = useMemo(() => {
    const grouped = new Map<string, Album>();
    genreSongs.forEach((song) => {
      if (!song.albumId) return;
      const current = grouped.get(song.albumId);
      if (current) {
        current.song?.push(song);
        current.songCount = current.song?.length;
        current.duration = (current.duration ?? 0) + (song.duration ?? 0);
        return;
      }
      grouped.set(song.albumId, {
        id: song.albumId,
        name: song.album ?? 'Album sconosciuto',
        artist: song.artist ?? 'Artista sconosciuto',
        artistId: song.artistId,
        coverArt: song.coverArt,
        coverUrl: song.coverUrl,
        year: song.year,
        genre: detail.type === 'genre' ? detail.genre : song.genre,
        songCount: 1,
        duration: song.duration ?? 0,
        song: [song],
      });
    });
    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, 'it'));
  }, [detail, genreSongs]);

  const genreArtists = useMemo(() => {
    const grouped = new Map<string, { artist: Artist; albumIds: Set<string> }>();
    genreSongs.forEach((song) => {
      if (!song.artistId) return;
      const current = grouped.get(song.artistId);
      if (current) {
        if (song.albumId) current.albumIds.add(song.albumId);
        current.artist.albumCount = current.albumIds.size;
        return;
      }
      const albumIds = new Set<string>();
      if (song.albumId) albumIds.add(song.albumId);
      grouped.set(song.artistId, {
        artist: {
          id: song.artistId,
          name: song.artist ?? 'Artista sconosciuto',
          albumCount: albumIds.size,
          coverArt: song.coverArt,
          artistImageUrl: song.coverUrl,
        },
        albumIds,
      });
    });
    return [...grouped.values()]
      .map(({ artist }) => artist)
      .sort((left, right) => left.name.localeCompare(right.name, 'it'));
  }, [genreSongs]);

  const filteredGenreAlbums = useMemo(() => {
    if (!genreQuery.trim()) return genreAlbums;
    return rankSearchItems(
      genreAlbums.map((item) => ({
        item,
        text: normalizeSearchText(`${item.name} ${item.artist} ${item.year ?? ''}`),
      })),
      genreQuery,
      genreAlbums.length,
    );
  }, [genreAlbums, genreQuery]);

  const filteredGenreArtists = useMemo(() => {
    if (!genreQuery.trim()) return genreArtists;
    return rankSearchItems(
      genreArtists.map((item) => ({ item, text: normalizeSearchText(item.name) })),
      genreQuery,
      genreArtists.length,
    );
  }, [genreArtists, genreQuery]);

  const filteredGenreSongs = useMemo(() => {
    if (!genreQuery.trim()) return genreSongs;
    return rankSearchItems(
      genreSongs.map((item) => ({
        item,
        text: normalizeSearchText(`${item.title} ${item.artist ?? ''} ${item.album ?? ''}`),
      })),
      genreQuery,
      genreSongs.length,
    );
  }, [genreQuery, genreSongs]);

  if (busy) return <LoadingState text="Caricamento da Navidrome…" />;
  const songs = album?.song ?? playlist?.entry ?? genreSongs;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
      {album && (
        <>
        <DetailHero
          image={album.coverUrl}
          eyebrow="ALBUM"
          title={album.name}
          subtitle={`${album.artist} · ${album.year ?? 'Anno sconosciuto'} · ${album.songCount ?? songs.length} brani`}
          onSubtitle={album.artistId ? () => onArtist({ id: album.artistId!, name: album.artist }) : undefined}
          onPlay={() => onPlaySongs(songs)}
        />
        <CollectionDownloadAction songs={songs} kind="album" />
        </>
      )}
      {artist && (
        <>
          <DetailHero
            image={artist.artistImageUrl}
            eyebrow="ARTISTA"
            title={artist.name}
            subtitle={`${artist.albumCount ?? artist.album?.length ?? 0} album`}
            onPlay={() => artist.album?.[0] && onAlbum(artist.album[0])}
          />
          <SectionTitle title="Discografia" subtitle="Album disponibili" />
          <CollectionPager
            items={artist.album ?? []}
            pageSize={Math.max(20, columns * 10)}
            label="album"
            renderPage={(page) => <AlbumGrid albums={page} columns={columns} onAlbum={onAlbum} onPlay={onAlbum} />}
          />
        </>
      )}
      {playlist && (
        <>
        <DetailHero
          image={playlist.coverUrl}
          eyebrow="PLAYLIST"
          title={playlist.name}
          subtitle={`${playlist.songCount ?? songs.length} brani · ${formatTime(playlist.duration ?? 0)}`}
          onPlay={() => onPlaySongs(songs)}
        />
        {playlistEditable && (
          <Pressable style={styles.playlistManageButton} onPress={onManagePlaylist}>
            <MaterialCommunityIcons name="playlist-edit" size={21} color={lime} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>Gestisci playlist</Text>
              <Text style={styles.settingsRowSubtitle}>Rinomina, condividi, riordina o rimuovi brani</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#777580" />
          </Pressable>
        )}
        <CollectionDownloadAction songs={songs} kind="playlist" />
        </>
      )}
      {detail.type === 'genre' && (
        <>
          <DetailHero
            eyebrow="GENERE"
            title={detail.genre}
            subtitle={`${genreAlbums.length} album · ${genreArtists.length} artisti · ${songs.length} brani`}
            onPlay={() => onPlaySongs(songs)}
          />
          <GenreViewPicker
            value={genreView}
            albums={genreQuery.trim() ? filteredGenreAlbums.length : genreAlbums.length}
            tracks={genreQuery.trim() ? filteredGenreSongs.length : songs.length}
            artists={genreQuery.trim() ? filteredGenreArtists.length : genreArtists.length}
            onChange={setGenreView}
          />
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={23} color="#85838E" />
            <TextInput
              value={genreQuery}
              onChangeText={setGenreQuery}
              placeholder={`Cerca ${genreView === 'albums' ? 'album' : genreView === 'artists' ? 'artisti' : 'tracce'} in ${detail.genre}`}
              placeholderTextColor="#66646F"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!genreQuery && (
              <Pressable accessibilityLabel="Cancella ricerca nel genere" onPress={() => setGenreQuery('')}>
                <MaterialCommunityIcons name="close-circle" size={22} color="#85838E" />
              </Pressable>
            )}
          </View>
          {genreView === 'albums' && (
            <>
              <SectionTitle title="Album" subtitle={`${filteredGenreAlbums.length} nel genere ${detail.genre}`} />
              {filteredGenreAlbums.length
                ? <CollectionPager
                    items={filteredGenreAlbums}
                    pageSize={Math.max(20, columns * 10)}
                    label="album"
                    renderPage={(page) => <AlbumGrid albums={page} columns={columns} onAlbum={onAlbum} onPlay={(item) => onPlaySongs(item.song ?? [])} />}
                  />
                : <EmptyState icon="album" title="Nessun album trovato" text={genreQuery ? `Nessun album corrisponde a “${genreQuery}”.` : 'Navidrome non ha restituito album per questo genere.'} />}
            </>
          )}
          {genreView === 'artists' && (
            <>
              <SectionTitle title="Artisti" subtitle={`${filteredGenreArtists.length} nel genere ${detail.genre}`} />
              {filteredGenreArtists.length
                ? <CollectionPager
                    items={filteredGenreArtists}
                    pageSize={Math.max(20, columns * 10)}
                    label="artisti"
                    renderPage={(page) => <ArtistGrid artists={page} columns={columns} onArtist={onArtist} />}
                  />
                : <EmptyState icon="account-music-outline" title="Nessun artista trovato" text={genreQuery ? `Nessun artista corrisponde a “${genreQuery}”.` : 'Navidrome non ha restituito artisti per questo genere.'} />}
            </>
          )}
          {genreView === 'tracks' && (
            <>
              <SectionTitle title="Tracce" subtitle={`${filteredGenreSongs.length} nel genere ${detail.genre}`} />
              {filteredGenreSongs.length
                ? <CollectionPager
                    items={filteredGenreSongs}
                    pageSize={100}
                    label="brani"
                    renderPage={(page, offset) => <TrackList songs={page} onPlay={(index) => onPlaySongs(filteredGenreSongs, offset + index)} onMore={onMoreSong} />}
                  />
                : <EmptyState icon="music-note-off" title="Nessuna traccia trovata" text={genreQuery ? `Nessuna traccia corrisponde a “${genreQuery}”.` : 'Navidrome non ha restituito tracce per questo genere.'} />}
            </>
          )}
        </>
      )}
      {detail.type !== 'genre' && !!songs.length && (
        <>
          <SectionTitle title="Brani" subtitle={`${songs.length} in coda`} />
          <CollectionPager
            items={songs}
            pageSize={100}
            label="brani"
            renderPage={(page, offset) => <TrackList songs={page} onPlay={(index) => onPlaySongs(songs, offset + index)} onMore={onMoreSong} />}
          />
        </>
      )}
    </ScrollView>
  );
}

function GenreViewPicker({ value, albums, tracks, artists, onChange }: { value: GenreView; albums: number; tracks: number; artists: number; onChange: (value: GenreView) => void }) {
  const options: Array<{ id: GenreView; label: string; count: number; icon: IconName }> = [
    { id: 'albums', label: 'Album', count: albums, icon: 'album' },
    { id: 'tracks', label: 'Tracce', count: tracks, icon: 'music-note' },
    { id: 'artists', label: 'Artisti', count: artists, icon: 'account-music-outline' },
  ];
  return (
    <View style={styles.genreViewPicker}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.genreViewOption, active && styles.genreViewOptionActive]}
            onPress={() => onChange(option.id)}
          >
            <MaterialCommunityIcons name={option.icon} size={20} color={active ? '#10130B' : '#94919D'} />
            <Text style={[styles.genreViewLabel, active && styles.genreViewLabelActive]}>{option.label}</Text>
            <Text style={[styles.genreViewCount, active && styles.genreViewCountActive]}>{option.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DetailHero({
  image,
  eyebrow,
  title,
  subtitle,
  onSubtitle,
  onPlay,
}: {
  image?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  onSubtitle?: () => void;
  onPlay: () => void;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const artworkSize = mobile ? Math.min(width - 96, 260) : 170;
  return (
    <LinearGradient colors={['#31245C', '#17192A', '#111219']} style={[styles.detailHero, mobile && styles.detailHeroMobile]}>
      <Artwork uri={image} title={title} size={artworkSize} />
      <View style={[styles.detailHeroCopy, mobile && styles.detailHeroCopyMobile]}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text numberOfLines={mobile ? 3 : 2} style={[styles.detailTitle, mobile && styles.detailTitleMobile]}>{title}</Text>
        <Pressable disabled={!onSubtitle} onPress={onSubtitle}>
          <Text style={styles.detailSubtitle}>{subtitle}</Text>
        </Pressable>
        <Pressable style={[styles.primaryButton, mobile && styles.primaryButtonMobile]} onPress={onPlay}>
          <MaterialCommunityIcons name="play" size={21} color="#10130B" />
          <Text numberOfLines={1} style={styles.primaryButtonText}>Riproduci tutto</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function ConnectionScreen({
  value,
  onChange,
  onConnect,
  busy,
  message,
  connected,
  stats,
  canDisconnect,
  disconnectDisabled,
  onDisconnect,
}: {
  value: NavidromeConnection;
  onChange: (value: NavidromeConnection) => void;
  onConnect: () => void;
  busy: boolean;
  message: string;
  connected: boolean;
  stats: { albums: number; artists: number; genres: number };
  canDisconnect: boolean;
  disconnectDisabled: boolean;
  onDisconnect: () => void;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.connectionScroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.connectionCard, mobile && styles.connectionCardMobile]}>
        <LinearGradient colors={['#2B2251', '#171426']} style={[styles.connectionVisual, mobile && styles.connectionVisualMobile]}>
          <LinearGradient colors={[lime, '#80ED48']} style={styles.connectionIcon}>
            <MaterialCommunityIcons name="server-network" size={43} color="#10130B" />
          </LinearGradient>
        </LinearGradient>
        <View style={[styles.connectionForm, mobile && styles.connectionFormMobile]}>
          <Text style={styles.eyebrow}>NAVIDROME · SUBSONIC</Text>
          <Text style={styles.formTitle}>La tua libreria, completa.</Text>
          <Text style={styles.formHelp}>La sincronizzazione ora usa pagine da 500 album e continua fino alla fine della raccolta.</Text>
          <Field label="Indirizzo del server" icon="web" value={value.serverUrl} onChange={(serverUrl) => onChange({ ...value, serverUrl })} />
          <Text style={styles.formHelp}>Puoi omettere https://: viene aggiunto automaticamente.</Text>
          <Field label="Nome utente" icon="account-outline" value={value.username} onChange={(username) => onChange({ ...value, username })} />
          <Field label="Password" icon="lock-outline" value={value.password} secure onChange={(password) => onChange({ ...value, password })} />
          <Pressable disabled={busy || !value.serverUrl || !value.username || !value.password} style={[styles.syncButton, busy && { opacity: 0.6 }]} onPress={onConnect}>
            {busy ? <ActivityIndicator color="#10130B" /> : <MaterialCommunityIcons name={connected ? 'sync' : 'connection'} size={21} color="#10130B" />}
            <Text style={styles.syncButtonText}>{busy ? 'Sincronizzazione…' : connected ? 'Sincronizza tutto di nuovo' : 'Verifica e sincronizza'}</Text>
          </Pressable>
          <Text style={styles.statusText}>{message}</Text>
          {canDisconnect && (
            <SettingsActionRow icon="logout" title="Disconnetti dal server" subtitle="Rimuovi l’accesso salvato su questo dispositivo" disabled={disconnectDisabled} destructive onPress={onDisconnect} />
          )}
          {!!stats.albums && (
            <View style={styles.statsRow}>
              <Stat value={stats.albums} label="Album" />
              <Stat value={stats.artists} label="Artisti" />
              <Stat value={stats.genres} label="Generi" />
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function SettingsScreen({
  section,
  connected,
  offlineCount,
  downloadsBusy,
  songCount,
  busy,
  preferences,
  playbackRate,
  sleepUntil,
  onSection,
  onPreference,
  onEqualizer,
  onSpeed,
  onSleep,
  onOpenOffline,
  onClearOffline,
  onSync,
  onShareDiagnostics,
}: {
  section: SettingsSection;
  connected: boolean;
  offlineCount: number;
  downloadsBusy: boolean;
  songCount: number;
  busy: boolean;
  preferences: AppPreferences;
  playbackRate: number;
  sleepUntil: number | null;
  onSection: (section: SettingsSection) => void;
  onPreference: <Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => void;
  onEqualizer: () => void;
  onSpeed: () => void;
  onSleep: () => void;
  onOpenOffline: () => void;
  onClearOffline: () => void;
  onSync: () => void;
  onShareDiagnostics: () => void;
}) {
  if (section !== 'hub') {
    const timerText = sleepUntil && sleepUntil > Date.now()
      ? `${Math.max(1, Math.ceil((sleepUntil - Date.now()) / 60_000))} minuti rimasti`
      : 'Disattivato';
    return (
      <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
        {section === 'interface' && (
          <View style={styles.settingsActionGroup}>
            <SettingsActionRow icon="theme-light-dark" title="Nero AMOLED" subtitle="Sfondo completamente nero per schermi OLED" switchValue={preferences.amoledTheme} onPress={() => onPreference('amoledTheme', !preferences.amoledTheme)} />
            <SettingsActionRow icon="view-grid-outline" title="Griglia compatta" subtitle="Mostra più elementi su tablet e PC" switchValue={preferences.compactGrid} onPress={() => onPreference('compactGrid', !preferences.compactGrid)} />
            <SettingsActionRow icon="waveform" title="Dettagli qualità audio" subtitle="Formato, bit, frequenza e bitrate nel player" switchValue={preferences.showAudioDetails} onPress={() => onPreference('showAudioDetails', !preferences.showAudioDetails)} />
          </View>
        )}
        {section === 'playback' && (
          <View style={styles.settingsActionGroup}>
            <SettingsActionRow icon="tune-variant" title="Audio puro · DSP" subtitle="Zero elaborazione · formato originale" value="Dettagli" onPress={onEqualizer} />
            <SettingsActionRow icon="speedometer" title="Velocità predefinita" subtitle="Applicata a ogni nuovo brano" value={formatPlaybackRate(playbackRate)} onPress={onSpeed} />
            <SettingsActionRow icon="timer-sand" title="Timer riproduzione" subtitle={timerText} value="Configura" onPress={onSleep} />
            <SettingsActionRow icon="cellphone-sound" title="Riproduzione in background" subtitle="Audio e controlli nella schermata di blocco" switchValue={preferences.backgroundPlayback} onPress={() => onPreference('backgroundPlayback', !preferences.backgroundPlayback)} />
          </View>
        )}
        {section === 'offline' && (
          <View style={styles.settingsActionGroup}>
            <SettingsActionRow icon="download-circle" title="Brani scaricati" subtitle={`${offlineCount} disponibili senza rete`} value="Apri" onPress={onOpenOffline} />
            <SettingsActionRow icon="wifi-off" title="Preferisci file offline" subtitle="Usa il file locale quando è già disponibile" switchValue={preferences.preferOffline} onPress={() => onPreference('preferOffline', !preferences.preferOffline)} />
            <SettingsActionRow icon="delete-sweep-outline" title="Rimuovi tutti i download" subtitle={downloadsBusy ? 'Attendi il completamento dei download' : 'Libera lo spazio occupato dai file musicali'} value={offlineCount ? `${offlineCount}` : 'Vuoto'} disabled={!offlineCount || downloadsBusy} destructive onPress={onClearOffline} />
          </View>
        )}
        {section === 'sync' && (
          <View style={styles.settingsActionGroup}>
            <SettingsActionRow icon="sync" title="Sincronizzazione completa" subtitle={`${songCount} brani · album, artisti, generi, playlist e radio`} value={busy ? 'In corso…' : 'Avvia'} disabled={busy} onPress={onSync} />
          </View>
        )}
        {section === 'updates' && <UpdateSettings />}
        {section === 'about' && (
          <View style={styles.settingsActionGroup}>
            <SettingsActionRow icon="information-outline" title="Music Bank" subtitle={`Versione ${APP_VERSION} · build Android ${APP_BUILD}`} value="Condividi" onPress={onShareDiagnostics} />
            <SettingsActionRow icon="shield-lock-outline" title="Credenziali e privacy" subtitle={Platform.OS === 'web' ? 'Salvataggio locale del browser' : 'Password cifrata nel SecureStore del dispositivo'} value="Provider" onPress={() => onSection('server')} />
            <SettingsActionRow icon="book-open-variant" title="Protocollo OpenSubsonic" subtitle="Documentazione delle API utilizzate" value="Apri" onPress={() => void Linking.openURL('https://opensubsonic.netlify.app/docs/')} />
          </View>
        )}
      </ScrollView>
    );
  }
  const groups: Array<{
    title: string;
    rows: Array<[SettingsSection, IconName, string, string]>;
  }> = [
    {
      title: 'Impostazioni',
      rows: [
        ['interface', 'gesture-tap', 'Interfaccia', 'Tema scuro Music Bank e layout responsive'],
        ['playback', 'play-circle-outline', 'Riproduzione', 'Qualità, velocità, timer ed equalizzatore'],
        ['offline', 'download-circle-outline', 'Download e ascolto offline', `${offlineCount} brani disponibili offline`],
      ],
    },
    {
      title: 'Libreria e server',
      rows: [
        ['server', 'server-network', 'Media provider Navidrome', connected ? 'Connesso' : 'Da collegare'],
        ['sync', 'sync', 'Sync manager', `${songCount} brani indicizzati`],
        ['updates', 'update', 'Aggiornamenti privati', `Versione installata ${APP_VERSION}`],
      ],
    },
    {
      title: 'Dettagli',
      rows: [
        ['about', 'information-outline', 'Dettagli applicazione', `Music Bank ${APP_VERSION} · client Subsonic`],
      ],
    },
  ];
  return (
    <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
      {groups.map((group) => (
        <View key={group.title} style={{ gap: 7 }}>
          <Text style={styles.settingsGroupTitle}>{group.title}</Text>
          {group.rows.map(([id, icon, title, subtitle]) => (
            <Pressable key={id} style={styles.settingsRow} onPress={() => onSection(id)}>
              <MaterialCommunityIcons name={icon} size={25} color={lime} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsRowTitle}>{title}</Text>
                <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#65636E" />
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function UpdateSettings() {
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [release, setRelease] = useState<GithubRelease | null>(null);

  const check = useCallback(async (candidate: string) => {
    setChecking(true);
    setStatus('Controllo della release privata…');
    setRelease(null);
    try {
      if (Platform.OS !== 'web') await saveGithubReleaseToken(candidate);
      const latest = await fetchLatestPrivateRelease(candidate);
      setRelease(latest);
      const comparison = compareVersions(latest.version, APP_VERSION);
      setStatus(comparison > 0
        ? `Aggiornamento ${latest.version} disponibile.`
        : comparison === 0
          ? 'Music Bank è aggiornato.'
          : `La versione installata è più recente della release ${latest.version}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadGithubReleaseToken().then((savedToken) => {
      if (!active) return;
      setToken(savedToken);
      if (savedToken) void check(savedToken);
    });
    return () => { active = false; };
  }, [check]);

  return (
    <View style={styles.settingsActionGroup}>
      <SettingsActionRow icon="cellphone-check" title="Versione installata" subtitle={`Music Bank ${APP_VERSION} · build ${APP_BUILD}`} value="Installata" onPress={() => {}} />
      <View style={styles.updateCard}>
        <Text style={styles.settingsRowTitle}>Accesso alla release privata</Text>
        <Text style={styles.updateHelp}>Usa un token personale fine-grained limitato a questa repository con il solo permesso Contents: read. Il token resta nel SecureStore del dispositivo e non viene inserito nei link o nei log.</Text>
        <Field label="Token GitHub" icon="github" value={token} secure onChange={setToken} />
        <Pressable disabled={checking || !token.trim()} style={[styles.syncButton, (checking || !token.trim()) && styles.buttonDisabled]} onPress={() => void check(token)}>
          {checking ? <ActivityIndicator size="small" color="#10130B" /> : <MaterialCommunityIcons name="update" size={21} color="#10130B" />}
          <Text style={styles.syncButtonText}>{checking ? 'Controllo…' : 'Salva e controlla'}</Text>
        </Pressable>
        {!!status && <Text style={styles.statusText}>{status}</Text>}
      </View>
      {release && compareVersions(release.version, APP_VERSION) > 0 && (
        <SettingsActionRow icon="download-circle" title={release.name} subtitle={release.apkName ?? `Versione ${release.version}`} value="Apri" onPress={() => void Linking.openURL(release.url)} />
      )}
      <SettingsActionRow icon="open-in-new" title="Apri le release private" subtitle="Il browser utilizza la sessione GitHub autorizzata" value="GitHub" onPress={() => void Linking.openURL(PRIVATE_RELEASES_URL)} />
      <SettingsActionRow icon="key-remove" title="Rimuovi token GitHub" subtitle="Cancella la credenziale salvata da questo dispositivo" disabled={!token && Platform.OS !== 'web'} destructive onPress={() => {
        void clearGithubReleaseToken().then(() => {
          setToken('');
          setRelease(null);
          setStatus('Token GitHub rimosso.');
        });
      }} />
      {Platform.OS === 'web' && <Text style={styles.updateHelp}>Sul web il token non viene memorizzato: resta valido soltanto finché questa schermata è aperta.</Text>}
    </View>
  );
}

function SettingsActionRow({ icon, title, subtitle, value, switchValue, disabled, destructive, onPress }: { icon: IconName; title: string; subtitle: string; value?: string; switchValue?: boolean; disabled?: boolean; destructive?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole={switchValue === undefined ? 'button' : 'switch'}
      accessibilityState={{ disabled: !!disabled, checked: switchValue }}
      disabled={disabled}
      style={[styles.settingsRow, disabled && { opacity: 0.42 }]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon} size={25} color={destructive ? '#FF6B6B' : lime} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.settingsRowTitle, destructive && { color: '#FF8B8B' }]}>{title}</Text>
        <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
      </View>
      {switchValue !== undefined ? (
        <View style={[styles.switch, switchValue && styles.switchOn]}>
          <View style={[styles.switchThumb, switchValue && styles.switchThumbOn]} />
        </View>
      ) : (
        <>
          {!!value && <Text style={[styles.settingsValue, destructive && { color: '#FF8B8B' }]}>{value}</Text>}
          <MaterialCommunityIcons name="chevron-right" size={20} color="#65636E" />
        </>
      )}
    </Pressable>
  );
}

function Field({ label, icon, value, onChange, secure }: { label: string; icon: IconName; value: string; onChange: (value: string) => void; secure?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <MaterialCommunityIcons name={icon} size={20} color="#7F7D89" />
        <TextInput value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholderTextColor="#5D5B66" />
      </View>
    </View>
  );
}

function CollectionPager<T>({
  items,
  pageSize,
  label,
  renderPage,
}: {
  items: T[];
  pageSize: number;
  label: string;
  renderPage: (items: T[], offset: number) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const offset = safePage * pageSize;

  useEffect(() => {
    setPage(0);
  }, [items, pageSize]);

  return (
    <View style={styles.pagedCollection}>
      {renderPage(items.slice(offset, offset + pageSize), offset)}
      {totalPages > 1 && (
        <View style={styles.pager}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pagina precedente"
            disabled={safePage === 0}
            style={[styles.pagerButton, safePage === 0 && styles.pagerButtonDisabled]}
            onPress={() => setPage((current) => Math.max(0, current - 1))}
          >
            <MaterialCommunityIcons name="chevron-left" size={22} color={safePage === 0 ? '#5B5963' : '#10130B'} />
          </Pressable>
          <Text style={styles.pagerText}>
            {offset + 1}–{Math.min(items.length, offset + pageSize)} di {items.length} {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pagina successiva"
            disabled={safePage >= totalPages - 1}
            style={[styles.pagerButton, safePage >= totalPages - 1 && styles.pagerButtonDisabled]}
            onPress={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            <MaterialCommunityIcons name="chevron-right" size={22} color={safePage >= totalPages - 1 ? '#5B5963' : '#10130B'} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AlbumGrid({ albums, columns, onAlbum, onPlay }: { albums: Album[]; columns: number; onAlbum: (album: Album) => void; onPlay: (album: Album) => void }) {
  const { width: viewportWidth } = useWindowDimensions();
  const contentWidth = viewportWidth - (viewportWidth >= 760 ? 230 : 0) - 56;
  const gap = 14;
  const itemWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);
  return (
    <View style={styles.grid}>
      {albums.map((album) => (
        <Pressable key={album.id} style={[styles.albumCard, { width: itemWidth }]} onPress={() => onAlbum(album)}>
          <Artwork uri={album.coverUrl} title={album.name} fluid />
          <Pressable style={styles.cardPlay} onPress={(event) => { event.stopPropagation(); onPlay(album); }}>
            <MaterialCommunityIcons name="play" size={19} color="#10130B" />
          </Pressable>
          <Text numberOfLines={1} style={styles.cardTitle}>{album.name}</Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>{album.artist}</Text>
          <Text style={styles.cardMeta}>{album.year ?? '—'} · {album.songCount ?? 0} brani</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ArtistGrid({ artists, columns, onArtist }: { artists: Artist[]; columns: number; onArtist: (artist: Artist) => void }) {
  const { width: viewportWidth } = useWindowDimensions();
  const contentWidth = viewportWidth - (viewportWidth >= 760 ? 230 : 0) - 56;
  const gap = 14;
  const itemWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);
  return (
    <View style={styles.grid}>
      {artists.map((artist) => (
        <Pressable key={artist.id} style={[styles.artistCard, { width: itemWidth }]} onPress={() => onArtist(artist)}>
          <Artwork uri={artist.artistImageUrl} title={artist.name} fluid round />
          <Text numberOfLines={1} style={[styles.cardTitle, { textAlign: 'center' }]}>{artist.name}</Text>
          <Text style={[styles.cardSubtitle, { textAlign: 'center' }]}>{artist.albumCount ?? 0} album</Text>
        </Pressable>
      ))}
    </View>
  );
}

function GenreGrid({ genres, onGenre }: { genres: Genre[]; onGenre: (genre: Genre) => void }) {
  const { width: viewportWidth } = useWindowDimensions();
  const contentWidth = viewportWidth - (viewportWidth >= 760 ? 230 : 0) - 56;
  const columns = viewportWidth < 760 ? 2 : 3;
  const gap = 12;
  const itemWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);
  return (
    <View style={styles.genreGrid}>
      {genres.map((genre, index) => (
        <Pressable key={genre.value} style={[styles.genreCard, { width: itemWidth }]} onPress={() => onGenre(genre)}>
          <LinearGradient colors={genreColors(index)} style={StyleSheet.absoluteFill} />
          <MaterialCommunityIcons name={genreIcon(index)} size={28} color="rgba(255,255,255,.9)" />
          <Text numberOfLines={1} style={styles.genreName}>{genre.value}</Text>
          <Text numberOfLines={1} style={styles.genreMeta}>
            {genre.albumCount} album · {genre.songCount} brani
            {(genre.sourceValues?.length ?? 0) > 1 ? ` · ${genre.sourceValues!.length} tag uniti` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function DownloadIndicator({ song }: { song: Song }) {
  const { tracks, jobs, sourceKey } = useContext(OfflineContext);
  const key = downloadKey(song, sourceKey);
  const job = jobs[key];
  const downloaded = tracks.has(key);
  const label = job ? downloadJobLabel(job) : downloaded ? 'Disponibile offline' : 'Non scaricato';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${label}: ${song.title}`} style={{ width: 22, alignItems: 'center' }}>
      {job?.status === 'downloading' || job?.status === 'removing'
        ? <ActivityIndicator size="small" color={lime} />
        : <MaterialCommunityIcons name={job?.status === 'error' ? 'alert-circle-outline' : job?.status === 'queued' ? 'clock-outline' : 'download'} size={19} color={job?.status === 'error' ? '#FF8B8B' : job?.status === 'queued' ? '#F5C76A' : downloaded ? lime : '#555360'} />}
    </View>
  );
}

function CollectionDownloadAction({ songs, kind }: { songs: Song[]; kind: 'album' | 'playlist' }) {
  const { tracks, jobs, sourceKey, onDownloadMany } = useContext(OfflineContext);
  const uniqueSongs = [...new Map(songs.map((song) => [downloadKey(song, sourceKey), song])).values()];
  const saved = uniqueSongs.filter((song) => tracks.has(downloadKey(song, sourceKey))).length;
  const active = uniqueSongs.some((song) => { const job = jobs[downloadKey(song, sourceKey)]; return job && job.status !== 'error'; });
  const failed = uniqueSongs.some((song) => jobs[downloadKey(song, sourceKey)]?.status === 'error');
  const complete = saved === uniqueSongs.length && saved > 0;
  return (
    <SettingsActionRow icon={complete ? 'download-circle' : 'download'}
      title={complete ? `${kind === 'album' ? 'Album' : 'Playlist'} disponibile offline` : active ? 'Download in corso…' : failed ? 'Riprova brani mancanti' : `Scarica ${kind}`}
      subtitle={`${saved} di ${uniqueSongs.length} brani scaricati`}
      disabled={!uniqueSongs.length || complete || active} onPress={() => onDownloadMany(uniqueSongs)} />
  );
}

function OfflineDownloads({ onSong, onMoreSong }: { onSong: (songs: Song[], index: number) => void; onMoreSong: (song: Song) => void }) {
  const { tracks, jobs, onDownload } = useContext(OfflineContext);
  const [albumFilter, setAlbumFilter] = useState('');
  const saved = [...tracks.values()];
  const query = normalizeSearchText(albumFilter);
  const songs = saved.filter((entry) => normalizeSearchText(`${entry.song.album ?? ''} ${entry.song.artist ?? ''}`).includes(query)).map((entry) => entry.song);
  return (
    <>
      <SectionTitle title="Download" subtitle={`${saved.length} brani · ${formatDownloadSize(saved.reduce((total, track) => total + (track.size ?? 0), 0))} sul dispositivo`} />
      {Object.entries(jobs).map(([key, job]) => (
        <SettingsActionRow key={key} icon={job.status === 'error' ? 'alert-circle-outline' : 'download'} title={job.song.title}
          subtitle={job.status === 'error' ? job.error ?? 'Download non riuscito' : downloadJobLabel(job)}
          value={job.status === 'error' ? 'Riprova' : undefined} disabled={job.status !== 'error'} onPress={() => onDownload(job.song)} />
      ))}
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="album" size={22} color="#85838E" />
        <TextInput accessibilityLabel="Filtra download per album o artista" placeholder="Filtra per album o artista" placeholderTextColor="#686671" value={albumFilter} onChangeText={setAlbumFilter} style={styles.searchInput} />
        {!!albumFilter && <IconButton icon="close-circle" small onPress={() => setAlbumFilter('')} />}
      </View>
      <Text style={styles.filterSummary}>{songs.length} brani · l’icona verde indica i file disponibili offline</Text>
      {songs.length ? <CollectionPager items={songs} pageSize={100} label="download"
        renderPage={(page, offset) => <TrackList songs={page} onPlay={(index) => onSong(songs, offset + index)} onMore={onMoreSong} />} />
        : <EmptyState icon="download-off-outline" title={saved.length ? 'Nessun album corrispondente' : 'Nessun brano offline'} text={saved.length ? 'Prova un altro album o artista.' : 'Scarica un brano dal menu Più azioni oppure un album o una playlist dalla sua pagina.'} />}
    </>
  );
}

function TrackList({ songs, onPlay, onMore }: { songs: Song[]; onPlay: (index: number) => void; onMore?: (song: Song) => void }) {
  return (
    <View style={styles.trackList}>
      {songs.map((song, index) => (
        <Pressable key={`${song.id}-${index}`} style={styles.trackRow} onPress={() => onPlay(index)}>
          <Text style={styles.trackNumber}>{song.track ?? index + 1}</Text>
          <Artwork uri={song.coverUrl} title={song.title} size={46} />
          <View style={styles.trackCopy}>
            <Text numberOfLines={1} style={styles.trackTitle}>{song.title}</Text>
            <Text numberOfLines={1} style={styles.trackSubtitle}>{song.artist ?? 'Artista sconosciuto'} · {song.album ?? 'Album sconosciuto'}</Text>
          </View>
          <Text style={styles.trackDuration}>{formatTime(song.duration ?? 0)}</Text>
          <DownloadIndicator song={song} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Più azioni per ${song.title}`}
            style={styles.trackMore}
            onPress={(event) => {
              event.stopPropagation();
              onMore?.(song);
            }}
          >
            <MaterialCommunityIcons name="dots-vertical" size={20} color="#A09EAA" />
          </Pressable>
        </Pressable>
      ))}
    </View>
  );
}

function MiniPlayer({ song, status, compact, bottom, onOpen, onToggle, onNext }: { song: Song; status: ReturnType<typeof useAudioPlayerStatus>; compact: boolean; bottom: number; onOpen: () => void; onToggle: () => void; onNext: () => void }) {
  const progress = status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  return (
    <Pressable style={[styles.miniPlayer, compact ? styles.miniPlayerMobile : styles.miniPlayerDesktop, { bottom }]} onPress={onOpen}>
      <Artwork uri={song.coverUrl} title={song.title} size={50} />
      <View style={styles.miniCopy}>
        <Text numberOfLines={1} style={styles.miniTitle}>{song.title}</Text>
        <Text numberOfLines={1} style={styles.miniSubtitle}>{song.artist}</Text>
      </View>
      {status.isBuffering && <ActivityIndicator size="small" color={lime} />}
      <DownloadIndicator song={song} />
      <IconButton icon={status.playing ? 'pause' : 'play'} onPress={onToggle} light />
      {!compact && <IconButton icon="skip-next" onPress={onNext} />}
      <View style={[styles.miniProgress, { width: `${progress}%` }]} />
    </Pressable>
  );
}

function FullPlayer({ visible, song, status, shuffle, repeat, bottomInset, showAudioDetails, onClose, onToggle, onNext, onPrevious, onSeek, onShuffle, onRepeat, onQueue, onEqualizer, onFavorite, onMore, onBackTen, onForwardTen, onSpeed, onSleep }: { visible: boolean; song?: Song; status: ReturnType<typeof useAudioPlayerStatus>; shuffle: boolean; repeat: RepeatMode; bottomInset: number; showAudioDetails: boolean; onClose: () => void; onToggle: () => void; onNext: () => void; onPrevious: () => void; onSeek: (seconds: number) => void; onShuffle: () => void; onRepeat: () => void; onQueue: () => void; onEqualizer: () => void; onFavorite: () => void; onMore: () => void; onBackTen: () => void; onForwardTen: () => void; onSpeed: () => void; onSleep: () => void }) {
  if (!song || !visible) return null;
  const playbackRate = status.playbackRate || 1;
  return (
      <SafeAreaView style={[styles.playerModal, styles.fullOverlay]} edges={['top', 'left', 'right']}>
        <LinearGradient colors={['#33245F', '#11121B', '#08090D']} style={StyleSheet.absoluteFill} />
        <View style={styles.modalHeader}>
          <IconButton icon="chevron-down" onPress={onClose} />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.playerEyebrow}>IN RIPRODUZIONE</Text>
            <Text numberOfLines={1} style={styles.playerAlbum}>{song.album}</Text>
          </View>
          <IconButton icon="dots-horizontal" onPress={onMore} />
        </View>
        <View style={styles.playerBody}>
          <Artwork uri={song.coverUrl} title={song.title} player />
          <View style={styles.nowCopy}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.nowTitle}>{song.title}</Text>
              <Text numberOfLines={1} style={styles.nowArtist}>{song.artist}</Text>
            </View>
            <IconButton icon={song.starred ? 'heart' : 'heart-outline'} onPress={onFavorite} active={!!song.starred} />
            <DownloadIndicator song={song} />
          </View>
          <WaveformSeek
            songId={song.id}
            value={status.currentTime}
            duration={status.duration}
            onSeek={onSeek}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timePill}>{formatTime(status.currentTime)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Velocità ${formatPlaybackRate(playbackRate)}`}
              style={styles.speedPill}
              onPress={onSpeed}
            >
              <Text style={styles.speedPillText}>Velocità: {formatPlaybackRate(playbackRate)}</Text>
            </Pressable>
            <Text style={styles.timePill}>{status.isBuffering ? '…' : formatTime(status.duration)}</Text>
          </View>
          {showAudioDetails && (
            <View style={styles.audioInfoRow}>
              <MaterialCommunityIcons name="information-outline" size={15} color="#85828E" />
              <Text numberOfLines={1} style={styles.audioInfoText}>{formatAudioInfo(song)}</Text>
            </View>
          )}
          <View style={styles.transport}>
            <IconButton icon="shuffle-variant" onPress={onShuffle} active={shuffle} />
            <IconButton icon="rewind-10" onPress={onBackTen} large />
            <Pressable style={styles.bigPlay} onPress={onToggle}>
              {status.isBuffering ? <ActivityIndicator color="#10130B" /> : <MaterialCommunityIcons name={status.playing ? 'pause' : 'play'} size={38} color="#10130B" />}
            </Pressable>
            <IconButton icon="fast-forward-10" onPress={onForwardTen} large />
            <IconButton icon={repeat === 'one' ? 'repeat-once' : 'repeat'} onPress={onRepeat} active={repeat !== 'none'} />
          </View>
          <View style={styles.secondaryTransport}>
            <ToolButton icon="skip-previous" label="Precedente" onPress={onPrevious} />
            <ToolButton icon="speedometer" label="Velocità" onPress={onSpeed} />
            <ToolButton icon="skip-next" label="Successivo" onPress={onNext} />
          </View>
          <View style={[styles.playerTools, { paddingBottom: bottomInset + 12 }]}>
            <ToolButton icon="playlist-music" label="Coda" onPress={onQueue} />
            <ToolButton icon="tune-variant" label="Equalizzatore" onPress={onEqualizer} />
            <ToolButton icon="timer-sand" label="Timer" onPress={onSleep} />
            <ToolButton icon="dots-horizontal" label="Più azioni" onPress={onMore} />
          </View>
        </View>
      </SafeAreaView>
  );
}

function WaveformSeek({ songId, value, duration, onSeek }: { songId: string; value: number; duration: number; onSeek: (seconds: number) => void }) {
  const [width, setWidth] = useState(0);
  const bars = useMemo(() => createWaveform(songId, 84), [songId]);
  const progress = duration > 0 ? Math.max(0, Math.min(1, value / duration)) : 0;
  const seekFromPosition = (locationX: number) => {
    if (width <= 0 || duration <= 0) return;
    onSeek(Math.max(0, Math.min(duration, (locationX / width) * duration)));
  };
  const waveformBars = (color: string) => (
    <View style={styles.waveformBars}>
      {bars.map((height, index) => (
        <View key={`${songId}-${index}`} style={[styles.waveformBar, { height, backgroundColor: color }]} />
      ))}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Posizione del brano"
      accessibilityValue={{
        min: 0,
        max: Math.round(duration),
        now: Math.round(value),
        text: `${formatTime(value)} di ${formatTime(duration)}`,
      }}
      style={styles.waveform}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={(event) => seekFromPosition(event.nativeEvent.locationX)}
    >
      {waveformBars('#4A4753')}
      <View pointerEvents="none" style={[styles.waveformPlayed, { width: `${progress * 100}%` }]}>
        <View style={{ width, height: '100%' }}>
          {waveformBars(lime)}
        </View>
      </View>
      <View pointerEvents="none" style={[styles.waveformCursor, { left: `${progress * 100}%` }]} />
    </Pressable>
  );
}

function QueueModal({ visible, queue, currentIndex, onClose, onPick }: { visible: boolean; queue: Song[]; currentIndex: number; onClose: () => void; onPick: (index: number) => void }) {
  if (!visible) return null;
  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Coda di riproduzione</Text>
        <Text style={styles.sheetSubtitle}>{queue.length} brani</Text>
        <ScrollView>
          {queue.map((song, index) => (
            <Pressable key={`${song.id}-${index}`} style={[styles.queueRow, index === currentIndex && styles.queueRowOn]} onPress={() => onPick(index)}>
              <MaterialCommunityIcons name={index === currentIndex ? 'volume-high' : 'drag'} size={20} color={index === currentIndex ? lime : '#686671'} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.trackTitle, index === currentIndex && { color: lime }]}>{song.title}</Text>
                <Text numberOfLines={1} style={styles.trackSubtitle}>{song.artist}</Text>
              </View>
              <Text style={styles.trackDuration}>{formatTime(song.duration ?? 0)}</Text>
              <DownloadIndicator song={song} />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function EqualizerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView style={[styles.sheet, styles.eqSheet]} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <View style={styles.eqHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Audio puro</Text>
            <Text style={styles.sheetSubtitle}>Il DSP interno è disabilitato in modo permanente</Text>
          </View>
          <MaterialCommunityIcons name="shield-check-outline" size={34} color={lime} />
        </View>
        <View style={styles.qualityCard}>
          <MaterialCommunityIcons name="waveform" size={30} color={lime} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle}>Formato originale Navidrome</Text>
            <Text style={styles.trackSubtitle}>format=raw · maxBitRate=0 · volume digitale 100%</Text>
          </View>
        </View>
        <Text style={styles.eqNotice}>Audio originale · DSP completamente disattivato</Text>
      </SafeAreaView>
    </View>
  );
}

function BottomNav({ tab, bottomInset, onTab }: { tab: Tab; bottomInset: number; onTab: (tab: Tab) => void }) {
  const items: Array<[Tab, string, IconName]> = [
    ['home', 'Home', 'home-variant-outline'],
    ['search', 'Cerca', 'magnify'],
    ['library', 'Libreria', 'album'],
    ['settings', 'Impostazioni', 'cog-outline'],
  ];
  return (
    <View style={[styles.bottomNav, { height: 68 + bottomInset, paddingBottom: bottomInset }]}>
      {items.map(([id, label, icon]) => (
        <Pressable key={id} style={styles.bottomNavItem} onPress={() => onTab(id)}>
          <MaterialCommunityIcons name={icon} size={23} color={tab === id ? lime : '#777580'} />
          <Text style={[styles.bottomNavText, tab === id && { color: lime }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Artwork({ uri, title, size, fluid, round, player }: { uri?: string; title: string; size?: number; fluid?: boolean; round?: boolean; player?: boolean }) {
  const imageUri = useMemo(
    () => coverUrlForSize(uri, player ? 700 : fluid ? 400 : Math.max(96, (size ?? 80) * 2)),
    [fluid, player, size, uri],
  );
  const style = player
    ? styles.playerArtwork
    : fluid
      ? [styles.artworkFluid, round && { borderRadius: 999 }]
      : { width: size, height: size, borderRadius: round ? 999 : 12 };
  if (imageUri) return <Image source={{ uri: imageUri }} fadeDuration={0} style={[styles.artwork, style] as never} />;
  return (
    <LinearGradient colors={['#7250D9', '#32256A', '#171525']} style={[styles.artwork, style] as never}>
      <MaterialCommunityIcons name="music-note" size={player ? 72 : Math.min(36, (size ?? 80) / 2)} color="rgba(255,255,255,.75)" />
      <Text numberOfLines={1} style={styles.artFallback}>{title}</Text>
    </LinearGradient>
  );
}

function QuickAction({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <LinearGradient colors={['#7550E1', '#AB4BC6']} style={styles.quickIcon}>
        <MaterialCommunityIcons name={icon} size={26} color="#FFF" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.quickSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="play-circle" size={31} color={lime} />
    </Pressable>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ListRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.listRow} onPress={onPress}>
      <View style={styles.listIcon}><MaterialCommunityIcons name={icon} size={25} color={lime} /></View>
      <View style={{ flex: 1 }}><Text style={styles.trackTitle}>{title}</Text><Text style={styles.trackSubtitle}>{subtitle}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={22} color="#777580" />
    </Pressable>
  );
}

function PlaylistEmptyRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.playlistEmptyRow}>
      <MaterialCommunityIcons name={icon} size={22} color="#777580" />
      <Text style={styles.playlistEmptyText}>{text}</Text>
    </View>
  );
}

function IconButton({ icon, onPress, active, light, large, small }: { icon: IconName; onPress: () => void; active?: boolean; light?: boolean; large?: boolean; small?: boolean }) {
  return (
    <Pressable style={[styles.iconButton, light && styles.iconButtonLight, small && styles.iconButtonSmall]} onPress={(event) => { event.stopPropagation(); onPress(); }}>
      <MaterialCommunityIcons name={icon} size={large ? 34 : small ? 19 : 24} color={light ? '#10130B' : active ? lime : '#ECEBF1'} />
    </Pressable>
  );
}

function MoreActionsModal({
  visible,
  song,
  onClose,
  onEqualizer,
  onSmartQueue,
  onMix,
  onAddPlaylist,
  onFavorite,
  onAlbum,
  onArtist,
  onGenre,
  onDownload,
  onShare,
  onWeb,
}: {
  visible: boolean;
  song?: Song;
  onClose: () => void;
  onEqualizer: () => void;
  onSmartQueue: () => void;
  onMix: () => void;
  onAddPlaylist: () => void;
  onFavorite: () => void;
  onAlbum: () => void;
  onArtist: () => void;
  onGenre: () => void;
  onDownload: () => void;
  onShare: () => void;
  onWeb: () => void;
}) {
  const { tracks, jobs, sourceKey } = useContext(OfflineContext);
  if (!visible || !song) return null;
  const key = downloadKey(song, sourceKey);
  const downloaded = tracks.has(key);
  const job = jobs[key];
  const serverActionsEnabled = songBelongsToSource(song, sourceKey);
  const actions: Array<[IconName, string, () => void, boolean?]> = [
    ['playlist-play', 'Smart flow · Smart queue', onSmartQueue, !serverActionsEnabled],
    ['creation', 'Mix istantaneo', onMix, !serverActionsEnabled],
    ['tune-variant', 'Equalizzatore · DSP', onEqualizer],
    [song.starred ? 'heart' : 'heart-outline', song.starred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti', onFavorite, !serverActionsEnabled],
    ['playlist-plus', 'Aggiungi alla playlist', onAddPlaylist, !serverActionsEnabled],
    ['album', `Vai all’album · ${song.album ?? ''}`, onAlbum, !song.albumId || !serverActionsEnabled],
    ['account-music', `Vai a ${song.artist ?? 'artista'}`, onArtist, !song.artistId || !serverActionsEnabled],
    ['tag-outline', `Vai a ${song.genre ?? 'genere'}`, onGenre, !song.genre || !serverActionsEnabled],
    [downloaded ? 'delete-outline' : 'download', job ? downloadJobLabel(job) : downloaded ? 'Rimuovi dal dispositivo' : 'Scarica per ascolto offline', onDownload, !!job && job.status !== 'error'],
    ['magnify', 'Ricerca web e testi', onWeb],
    ['share-variant', 'Condividi', onShare],
  ];
  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView style={[styles.sheet, styles.actionsSheet]} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Più azioni</Text>
        <Text numberOfLines={1} style={styles.sheetSubtitle}>{song.title} · {song.artist}</Text>
        <ScrollView>
          {actions.map(([icon, label, onPress, disabled]) => (
            <Pressable key={label} disabled={disabled} style={[styles.actionRow, disabled && { opacity: 0.35 }]} onPress={onPress}>
              <MaterialCommunityIcons name={icon} size={23} color={lime} />
              <Text numberOfLines={1} style={styles.actionText}>{label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#5F5D68" />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PlaylistPickerModal({ visible, playlists, username, onClose, onPick }: { visible: boolean; playlists: Playlist[]; username: string; onClose: () => void; onPick: (playlist: Playlist) => void }) {
  if (!visible) return null;
  const editablePlaylists = partitionPlaylists(playlists, username).owned;
  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Aggiungi alla playlist</Text>
        <Text style={styles.sheetSubtitle}>Scegli una playlist del tuo account</Text>
        <ScrollView>
          {editablePlaylists.map((playlist) => (
            <Pressable key={playlist.id} style={styles.actionRow} onPress={() => onPick(playlist)}>
              <MaterialCommunityIcons name="playlist-music" size={23} color={lime} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>{playlist.name}</Text>
                <Text style={styles.trackSubtitle}>{playlist.songCount ?? 0} brani</Text>
              </View>
            </Pressable>
          ))}
          {!editablePlaylists.length && <EmptyState icon="playlist-remove" title="Nessuna playlist personale" text="Apri Libreria → Playlist e creane una nuova." />}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function CreatePlaylistModal({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  if (!visible) return null;
  const submit = async () => {
    const validationError = validatePlaylistName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate(name);
      onClose();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : String(creationError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} />
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Nuova playlist</Text>
        <Text style={styles.sheetSubtitle}>Verrà salvata nel tuo account sul server.</Text>
        <View style={styles.inputWrap}>
          <MaterialCommunityIcons name="playlist-edit" size={21} color={lime} />
          <TextInput
            autoFocus
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error) setError('');
            }}
            editable={!busy}
            maxLength={100}
            placeholder="Nome della playlist"
            placeholderTextColor="#5D5B66"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={styles.input}
          />
        </View>
        {!!error && <Text style={styles.playlistError}>{error}</Text>}
        <Pressable
          disabled={busy || !normalizePlaylistName(name)}
          style={[styles.syncButton, (busy || !normalizePlaylistName(name)) && styles.buttonDisabled]}
          onPress={() => void submit()}
        >
          {busy ? <ActivityIndicator size="small" color="#10130B" /> : <MaterialCommunityIcons name="playlist-plus" size={21} color="#10130B" />}
          <Text style={styles.syncButtonText}>{busy ? 'Creazione…' : 'Crea playlist'}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

type PlaylistDraft = { name: string; comment: string; public: boolean; songs: Song[] };

function ManagePlaylistModal({ visible, playlist, onClose, onSave, onDelete }: {
  visible: boolean;
  playlist: Playlist | null;
  onClose: () => void;
  onSave: (draft: PlaylistDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [draftSongs, setDraftSongs] = useState<Song[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible || !playlist) return;
    setName(playlist.name);
    setComment(playlist.comment ?? '');
    setIsPublic(!!playlist.public);
    setDraftSongs(playlist.entry ?? []);
    setBusy(false);
    setError('');
    setConfirmDelete(false);
  }, [playlist, visible]);

  if (!visible || !playlist) return null;

  const moveSong = (index: number, direction: -1 | 1) => {
    setDraftSongs((current) => movePlaylistItem(current, index, direction));
  };

  const save = async () => {
    const validationError = validatePlaylistName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: normalizePlaylistName(name),
        comment: comment.trim(),
        public: isPublic,
        songs: draftSongs,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} />
      <SafeAreaView style={[styles.sheet, styles.playlistManageSheet]} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Gestisci playlist</Text>
        <Text style={styles.sheetSubtitle}>Le modifiche vengono salvate sul server.</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.playlistManageContent}>
          <View style={styles.inputWrap}>
            <MaterialCommunityIcons name="playlist-edit" size={21} color={lime} />
            <TextInput value={name} onChangeText={setName} editable={!busy} maxLength={100} placeholder="Nome" placeholderTextColor="#5D5B66" style={styles.input} />
          </View>
          <View style={styles.inputWrap}>
            <MaterialCommunityIcons name="text" size={21} color={lime} />
            <TextInput value={comment} onChangeText={setComment} editable={!busy} maxLength={200} placeholder="Descrizione facoltativa" placeholderTextColor="#5D5B66" style={styles.input} />
          </View>
          <Pressable style={styles.settingsRow} disabled={busy} onPress={() => setIsPublic((value) => !value)}>
            <MaterialCommunityIcons name={isPublic ? 'account-multiple' : 'lock-outline'} size={24} color={lime} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>{isPublic ? 'Playlist condivisa' : 'Playlist personale'}</Text>
              <Text style={styles.settingsRowSubtitle}>{isPublic ? 'Visibile agli altri utenti del server' : 'Visibile soltanto al tuo account'}</Text>
            </View>
            <View style={[styles.switch, isPublic && styles.switchOn]}><View style={[styles.switchThumb, isPublic && styles.switchThumbOn]} /></View>
          </Pressable>

          <SectionTitle title="Ordine dei brani" subtitle={`${draftSongs.length} nella playlist`} />
          {draftSongs.map((song, index) => (
            <View key={`${song.id}-${index}`} style={styles.playlistEditRow}>
              <Text style={styles.trackNumber}>{index + 1}</Text>
              <View style={styles.trackCopy}>
                <Text numberOfLines={1} style={styles.trackTitle}>{song.title}</Text>
                <Text numberOfLines={1} style={styles.trackSubtitle}>{song.artist ?? 'Artista sconosciuto'}</Text>
              </View>
              <Pressable disabled={busy || index === 0} style={styles.playlistEditIcon} onPress={() => moveSong(index, -1)}>
                <MaterialCommunityIcons name="chevron-up" size={21} color={index === 0 ? '#44424C' : '#AAA7B2'} />
              </Pressable>
              <Pressable disabled={busy || index === draftSongs.length - 1} style={styles.playlistEditIcon} onPress={() => moveSong(index, 1)}>
                <MaterialCommunityIcons name="chevron-down" size={21} color={index === draftSongs.length - 1 ? '#44424C' : '#AAA7B2'} />
              </Pressable>
              <Pressable disabled={busy} style={styles.playlistEditIcon} onPress={() => setDraftSongs((current) => removePlaylistItem(current, index))}>
                <MaterialCommunityIcons name="delete-outline" size={20} color="#FF7B8B" />
              </Pressable>
            </View>
          ))}
          {!draftSongs.length && <PlaylistEmptyRow icon="playlist-remove" text="La playlist è vuota. Potrai aggiungere brani dal menu Più azioni." />}
          {!!error && <Text style={styles.playlistError}>{error}</Text>}
          <Pressable disabled={busy} style={[styles.syncButton, busy && styles.buttonDisabled]} onPress={() => void save()}>
            {busy ? <ActivityIndicator size="small" color="#10130B" /> : <MaterialCommunityIcons name="content-save" size={21} color="#10130B" />}
            <Text style={styles.syncButtonText}>{busy ? 'Salvataggio…' : 'Salva modifiche'}</Text>
          </Pressable>
          <Pressable disabled={busy} style={styles.playlistDeleteButton} onPress={() => void remove()}>
            <MaterialCommunityIcons name="delete-forever-outline" size={21} color="#FF7B8B" />
            <Text style={styles.playlistDeleteText}>{confirmDelete ? 'Conferma eliminazione definitiva' : 'Elimina playlist'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ChoiceModal({ visible, title, description, options, onClose, onPick }: { visible: boolean; title: string; description?: string; options: string[]; onClose: () => void; onPick: (value: string) => void }) {
  if (!visible) return null;
  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <Text style={[styles.sheetTitle, { marginBottom: 14 }]}>{title}</Text>
        {!!description && <Text style={styles.sheetSubtitle}>{description}</Text>}
        {options.map((option) => (
          <Pressable key={option} style={styles.actionRow} onPress={() => onPick(option)}>
            <MaterialCommunityIcons name="check-circle-outline" size={22} color={lime} />
            <Text style={styles.actionText}>{option}</Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </View>
  );
}

function ToolButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.toolButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={24} color="#D6D4DD" />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={50} color="#5F5D68" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function LoadingState({ text }: { text: string }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color={lime} /><Text style={styles.emptyText}>{text}</Text></View>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function genreColors(index: number): [string, string] {
  const colors: Array<[string, string]> = [
    ['#6240C2', '#30236A'], ['#C14873', '#682344'], ['#167F84', '#16434B'],
    ['#C06A2D', '#60351E'], ['#356FC2', '#203A68'], ['#8D3CA7', '#492058'],
  ];
  return colors[index % colors.length];
}

function genreIcon(index: number): IconName {
  const icons: IconName[] = ['guitar-electric', 'piano', 'headphones', 'microphone-variant', 'radio', 'music-circle'];
  return icons[index % icons.length];
}

function libraryModeTitle(mode: LibraryMode): string {
  const titles: Record<LibraryMode, string> = {
    hub: 'La tua libreria',
    albums: 'Album',
    artists: 'Artisti album',
    genres: 'Generi musicali',
    tracks: 'Tracce',
    favorites: 'Preferiti',
    playlists: 'Playlist',
    years: 'Anni',
    radio: 'Radio Internet',
    offline: 'Musica offline',
  };
  return titles[mode];
}

function settingsSectionTitle(section: SettingsSection): string {
  const titles: Record<SettingsSection, string> = {
    hub: 'Impostazioni',
    server: 'Media provider',
    playback: 'Riproduzione',
    offline: 'Download e ascolto offline',
    interface: 'Interfaccia',
    sync: 'Sync manager',
    updates: 'Aggiornamenti',
    about: 'Dettagli',
  };
  return titles[section];
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function createWaveform(seed: string, count: number): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  let previous = 24;
  return Array.from({ length: count }, (_, index) => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    const random = ((state ^ (state >>> 16)) >>> 0) / 4294967295;
    const envelope = Math.sin((index / Math.max(1, count - 1)) * Math.PI);
    const target = 9 + random * 36 * (0.55 + envelope * 0.45);
    previous = previous * 0.42 + target * 0.58;
    return Math.round(previous);
  });
}

function formatPlaybackRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2).replace(/0+$/, '').replace('.', ',')}x`;
}

function formatAudioInfo(song: Song): string {
  const technical: string[] = [audioFormat(song.suffix, song.contentType)];

  if (song.bitDepth && song.samplingRate) {
    technical.push(`${song.bitDepth}-bit/${formatSamplingRate(song.samplingRate)}`);
  } else if (song.bitDepth) {
    technical.push(`${song.bitDepth}-bit`);
  } else if (song.samplingRate) {
    technical.push(formatSamplingRate(song.samplingRate));
  }
  if (song.bitRate) technical.push(`${Math.round(song.bitRate)} kb/s`);
  if (song.channelCount) technical.push(song.channelCount === 1 ? 'Mono' : song.channelCount === 2 ? 'Stereo' : `${song.channelCount} canali`);
  if (technical.length === 1) technical.push('Qualità originale');
  return technical.join(' · ');
}

function audioFormat(suffix?: string, contentType?: string, fallback = 'AUDIO'): string {
  const mimeFormat = contentType?.split('/').pop()?.split(';')[0];
  return (suffix || mimeFormat || fallback).toUpperCase().replace('MPEG', 'MP3');
}

function formatSamplingRate(rate: number): string {
  const khz = rate >= 1000 ? rate / 1000 : rate;
  return `${Number.isInteger(khz) ? khz.toFixed(0) : khz.toFixed(1).replace('.', ',')} kHz`;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#07080C' },
  shell: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  scroll: { paddingHorizontal: 28, paddingTop: 8, gap: 24 },
  sideNav: { width: 230, padding: 22, borderRightWidth: 1, borderRightColor: '#1D1C24', backgroundColor: 'rgba(10,10,15,.9)' },
  logo: { flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 34 },
  logoIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  logoMark: { width: 34, height: 34, resizeMode: 'contain' },
  logoText: { color: '#F5F4F8', fontSize: 14, lineHeight: 14, fontWeight: '900', letterSpacing: 3 },
  navHeading: { color: '#5D5B66', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 20, marginBottom: 8 },
  navItem: { height: 45, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13 },
  navItemOn: { backgroundColor: '#201E2A' },
  navItemText: { color: '#94929D', fontWeight: '700', fontSize: 13 },
  serverPill: { minHeight: 57, borderRadius: 16, borderWidth: 1, borderColor: '#2C2A34', backgroundColor: '#15141B', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12 },
  serverPillText: { color: '#D2D0D8', fontSize: 12, fontWeight: '700', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6A6873' },
  dotOn: { backgroundColor: lime, shadowColor: lime, shadowOpacity: 0.8, shadowRadius: 7 },
  header: { minHeight: 93, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerCompact: { minHeight: 115, paddingHorizontal: 18, paddingTop: 15 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: lime, fontWeight: '900', letterSpacing: 3.5, fontSize: 11, marginBottom: 8 },
  headerTitle: { color: '#F4F3F7', fontSize: 29, fontWeight: '900', letterSpacing: -1 },
  headerTitleMobile: { fontSize: 24 },
  headerSubtitle: { color: '#777580', fontSize: 12, marginTop: 4 },
  iconButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28,27,36,.86)', borderWidth: 1, borderColor: '#302E39' },
  iconButtonLight: { backgroundColor: lime, borderColor: lime },
  iconButtonSmall: { width: 32, height: 32, borderWidth: 0, backgroundColor: 'transparent' },
  hero: { minHeight: 310, borderRadius: 28, padding: 36, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  heroMobile: { minHeight: 220, padding: 18, borderRadius: 24 },
  heroGlow: { position: 'absolute', width: 380, height: 380, borderRadius: 190, backgroundColor: 'rgba(101,72,210,.25)', right: -100, top: -160 },
  heroCopy: { flex: 1, zIndex: 2 },
  heroCopyMobile: { minWidth: 0 },
  eyebrow: { color: lime, fontSize: 11, fontWeight: '900', letterSpacing: 2.2, marginBottom: 13 },
  heroTitle: { color: '#FFF', fontSize: 44, lineHeight: 48, fontWeight: '900', letterSpacing: -2.1, maxWidth: 600 },
  heroTitleMobile: { fontSize: 25, lineHeight: 29, letterSpacing: -0.8 },
  heroArtist: { color: '#C5C2CF', fontSize: 18, fontWeight: '600', marginTop: 6 },
  heroArtistMobile: { fontSize: 13, marginTop: 4 },
  heroActions: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 28 },
  heroActionsMobile: { gap: 7, marginTop: 16 },
  heroCover: { width: 230, height: 230, borderRadius: 24, marginLeft: 30, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20 },
  heroCoverMobile: { width: 108, height: 108, borderRadius: 18, marginLeft: 12, flexShrink: 0 },
  primaryButton: { minHeight: 48, borderRadius: 16, backgroundColor: lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, alignSelf: 'flex-start' },
  primaryButtonText: { color: '#10130B', fontWeight: '900', fontSize: 13 },
  primaryButtonMobile: { width: '100%', alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.4 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: { minWidth: 0, flexGrow: 1, flexBasis: 260, height: 86, padding: 12, borderRadius: 20, backgroundColor: '#15141B', borderWidth: 1, borderColor: '#2A2832', flexDirection: 'row', gap: 12, alignItems: 'center' },
  quickIcon: { width: 60, height: 60, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: '#F0EFF3', fontWeight: '800', fontSize: 14 },
  quickSubtitle: { color: '#777580', fontSize: 11, marginTop: 5 },
  libraryHub: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  libraryTile: { width: '48.8%', minWidth: 250, minHeight: 92, borderRadius: 20, padding: 16, backgroundColor: '#15141B', borderWidth: 1, borderColor: '#2A2832', flexDirection: 'row', alignItems: 'center', gap: 13 },
  libraryTileIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#242039', alignItems: 'center', justifyContent: 'center' },
  libraryTileTitle: { color: '#F2F1F5', fontSize: 15, fontWeight: '800' },
  libraryTileMeta: { color: '#777580', fontSize: 10, marginTop: 4 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  sectionTitle: { color: '#F3F2F6', fontSize: 22, fontWeight: '900', letterSpacing: -0.7 },
  sectionSubtitle: { color: '#777580', fontSize: 11, marginTop: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  pagedCollection: { gap: 18 },
  pager: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
  pagerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' },
  pagerButtonDisabled: { backgroundColor: '#22212A', opacity: 0.65 },
  pagerText: { minWidth: 150, color: '#9A98A3', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  albumCard: { minWidth: 0, position: 'relative', marginBottom: 10 },
  artistCard: { minWidth: 0, marginBottom: 12 },
  artwork: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#211C38' },
  artworkFluid: { width: '100%', aspectRatio: 1, borderRadius: 17 },
  artFallback: { position: 'absolute', bottom: 10, left: 9, right: 9, color: 'rgba(255,255,255,.65)', fontSize: 9, fontWeight: '800' },
  cardPlay: { position: 'absolute', right: 8, top: 8, width: 37, height: 37, borderRadius: 19, backgroundColor: lime, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8 },
  cardTitle: { color: '#F0EFF3', fontSize: 13, fontWeight: '800', marginTop: 9 },
  cardSubtitle: { color: '#85838E', fontSize: 11, marginTop: 3 },
  cardMeta: { color: '#595761', fontSize: 9, marginTop: 4 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  genreCard: { height: 115, borderRadius: 18, overflow: 'hidden', padding: 16, justifyContent: 'flex-end' },
  genreName: { color: '#FFF', fontSize: 17, fontWeight: '900', marginTop: 7 },
  genreMeta: { color: 'rgba(255,255,255,.65)', fontSize: 9, marginTop: 3 },
  genreViewPicker: { width: '100%', flexDirection: 'row', gap: 9, padding: 6, borderRadius: 22, backgroundColor: '#111018', borderWidth: 1, borderColor: '#292731' },
  genreViewOption: { flex: 1, minWidth: 0, minHeight: 76, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 2 },
  genreViewOptionActive: { backgroundColor: lime },
  genreViewLabel: { color: '#AAA7B2', fontSize: 11, fontWeight: '800' },
  genreViewLabelActive: { color: '#10130B' },
  genreViewCount: { color: '#686671', fontSize: 9, fontWeight: '700' },
  genreViewCountActive: { color: 'rgba(16,19,11,.65)' },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { height: 37, paddingHorizontal: 16, borderRadius: 19, borderWidth: 1, borderColor: '#302E38', backgroundColor: '#15141B', justifyContent: 'center' },
  chipOn: { backgroundColor: lime, borderColor: lime },
  chipText: { color: '#A09EAA', fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: '#10130B' },
  searchBox: { height: 60, borderRadius: 19, borderWidth: 1, borderColor: '#302E38', backgroundColor: '#121218', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  searchInput: { flex: 1, color: '#F1F0F4', fontSize: 16, outlineStyle: 'none' } as never,
  searchFilters: { flexDirection: 'row', gap: 9, paddingVertical: 2, paddingRight: 12 },
  searchFilter: { minHeight: 42, borderRadius: 15, borderWidth: 1, borderColor: '#302E38', backgroundColor: '#15141B', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15 },
  searchFilterActive: { borderColor: lime, backgroundColor: lime },
  searchFilterText: { color: '#AAA7B2', fontSize: 12, fontWeight: '800' },
  searchFilterTextActive: { color: '#10130B' },
  filterSummary: { color: '#777580', fontSize: 11, fontWeight: '700', marginTop: -10 },
  empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { color: '#E5E3EA', fontSize: 18, fontWeight: '800', marginTop: 15 },
  emptyText: { color: '#777580', fontSize: 12, textAlign: 'center', marginTop: 7 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list: { gap: 8 },
  playlistPage: { gap: 12 },
  playlistIntro: { minHeight: 88, padding: 18, borderRadius: 20, backgroundColor: '#17161E', borderWidth: 1, borderColor: '#2A2832', flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  playlistEmptyRow: { minHeight: 68, paddingHorizontal: 16, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: '#302E38', flexDirection: 'row', alignItems: 'center', gap: 12 },
  playlistEmptyText: { flex: 1, color: '#777580', fontSize: 11, lineHeight: 17 },
  playlistError: { color: '#FF7B8B', fontSize: 11, fontWeight: '700', marginTop: 9 },
  playlistManageButton: { minHeight: 68, paddingHorizontal: 16, borderRadius: 17, backgroundColor: '#17161E', borderWidth: 1, borderColor: '#302E38', flexDirection: 'row', alignItems: 'center', gap: 12 },
  playlistManageSheet: { maxHeight: '92%' },
  playlistManageContent: { gap: 10, paddingBottom: 8 },
  playlistEditRow: { minHeight: 58, paddingHorizontal: 9, borderRadius: 14, backgroundColor: '#1A1921', flexDirection: 'row', alignItems: 'center', gap: 6 },
  playlistEditIcon: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  playlistDeleteButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: '#66313B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  playlistDeleteText: { color: '#FF8B98', fontSize: 12, fontWeight: '900' },
  listRow: { minHeight: 68, padding: 10, borderRadius: 17, backgroundColor: '#131219', borderWidth: 1, borderColor: '#27252E', flexDirection: 'row', alignItems: 'center', gap: 12 },
  listIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#262238', alignItems: 'center', justifyContent: 'center' },
  detailScroll: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 150, gap: 22 },
  detailHero: { minHeight: 245, borderRadius: 27, padding: 28, flexDirection: 'row', alignItems: 'center', gap: 28, overflow: 'hidden' },
  detailHeroMobile: { minHeight: 0, padding: 20, flexDirection: 'column', alignItems: 'center', gap: 20 },
  detailHeroCopy: { flex: 1, alignItems: 'flex-start' },
  detailHeroCopyMobile: { flex: 0, width: '100%', minWidth: 0, alignItems: 'stretch' },
  detailTitle: { color: '#FFF', fontWeight: '900', fontSize: 36, letterSpacing: -1.4 },
  detailTitleMobile: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8 },
  detailSubtitle: { color: '#AAA7B2', fontSize: 13, marginTop: 8, marginBottom: 24 },
  trackList: { gap: 5 },
  trackRow: { minHeight: 62, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackNumber: { width: 22, color: '#6B6974', textAlign: 'center', fontSize: 11 },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: '#EDECF1', fontSize: 12, fontWeight: '700' },
  trackSubtitle: { color: '#777580', fontSize: 10, marginTop: 4 },
  trackDuration: { color: '#777580', fontSize: 10 },
  trackMore: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connectionScroll: { paddingHorizontal: 28, paddingBottom: 120 },
  settingsScroll: { paddingHorizontal: 28, paddingBottom: 140, gap: 26 },
  settingsActionGroup: { gap: 8 },
  updateCard: { borderRadius: 20, padding: 18, backgroundColor: '#15141B', borderWidth: 1, borderColor: '#292731' },
  updateHelp: { color: '#85838F', fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 14 },
  settingsGroupTitle: { color: lime, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 },
  settingsRow: { minHeight: 78, borderRadius: 18, paddingHorizontal: 18, backgroundColor: '#15141B', borderWidth: 1, borderColor: '#292731', flexDirection: 'row', alignItems: 'center', gap: 15 },
  settingsRowTitle: { color: '#F0EFF3', fontSize: 14, fontWeight: '800' },
  settingsRowSubtitle: { color: '#74727D', fontSize: 10, marginTop: 4 },
  settingsValue: { maxWidth: 82, color: '#AAA7B2', fontSize: 10, fontWeight: '800', textAlign: 'right' },
  connectionCard: { maxWidth: 920, width: '100%', alignSelf: 'center', borderRadius: 28, overflow: 'hidden', backgroundColor: '#111018', borderWidth: 1, borderColor: '#302E3A', flexDirection: 'row' },
  connectionCardMobile: { flexDirection: 'column' },
  connectionVisual: { width: '35%', minHeight: 620, alignItems: 'center', justifyContent: 'center' },
  connectionVisualMobile: { width: '100%', minHeight: 145, height: 145 },
  connectionIcon: { width: 120, height: 120, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  connectionForm: { flex: 1, padding: 35 },
  connectionFormMobile: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', padding: 22 },
  formTitle: { color: '#F7F6F9', fontSize: 29, fontWeight: '900', letterSpacing: -1, marginBottom: 9 },
  formHelp: { color: '#85838F', fontSize: 12, lineHeight: 19, marginBottom: 19 },
  field: { marginBottom: 14 },
  fieldLabel: { color: '#A6A3AE', fontWeight: '700', fontSize: 11, marginBottom: 7 },
  inputWrap: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#302E38', backgroundColor: '#0E0F14', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15 },
  input: { flex: 1, color: '#F0EFF3', fontSize: 14, outlineStyle: 'none' } as never,
  syncButton: { height: 55, borderRadius: 16, backgroundColor: lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5 },
  syncButtonText: { color: '#10130B', fontWeight: '900', fontSize: 13 },
  statusText: { color: '#85838F', fontSize: 10, textAlign: 'center', marginTop: 13 },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 17 },
  stat: { flex: 1, borderRadius: 14, backgroundColor: '#191820', padding: 12, alignItems: 'center' },
  statValue: { color: lime, fontWeight: '900', fontSize: 18 },
  statLabel: { color: '#777580', fontSize: 9, marginTop: 2 },
  miniPlayer: { position: 'absolute', zIndex: 30, minHeight: 70, borderRadius: 21, borderWidth: 1, borderColor: '#302E38', backgroundColor: 'rgba(18,18,23,.97)', flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9, overflow: 'hidden' },
  miniPlayerMobile: { left: 12, right: 12 },
  miniPlayerDesktop: { left: 242, right: 12 },
  miniCopy: { flex: 1, minWidth: 0 },
  miniTitle: { color: '#F0EFF3', fontSize: 13, fontWeight: '800' },
  miniSubtitle: { color: '#7C7A85', fontSize: 10, marginTop: 3 },
  miniProgress: { position: 'absolute', height: 2, left: 0, bottom: 0, backgroundColor: lime },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, flexDirection: 'row', backgroundColor: 'rgba(16,16,20,.98)', borderTopWidth: 1, borderTopColor: '#24232A' },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomNavText: { color: '#777580', fontSize: 9, fontWeight: '700' },
  playerModal: { flex: 1, backgroundColor: '#090A0E' },
  fullOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100 },
  modalHeader: { minHeight: 70, paddingHorizontal: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerEyebrow: { color: '#8C8995', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  playerAlbum: { color: '#E8E6ED', fontSize: 11, fontWeight: '700', marginTop: 3, maxWidth: 220 },
  playerBody: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 28, justifyContent: 'space-evenly' },
  playerArtwork: { width: '100%', maxHeight: 510, aspectRatio: 1, borderRadius: 28, alignSelf: 'center' },
  nowCopy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowTitle: { color: '#F7F6F9', fontWeight: '900', fontSize: 23 },
  nowArtist: { color: '#9996A1', fontSize: 14, marginTop: 5 },
  seek: { width: '100%', height: 36 },
  waveform: { width: '100%', height: 58, position: 'relative', justifyContent: 'center', overflow: 'hidden' },
  waveformBars: { width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  waveformBar: { flex: 1, minWidth: 1, borderRadius: 2 },
  waveformPlayed: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  waveformCursor: { position: 'absolute', top: 5, bottom: 5, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: '#F4F3F7' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -3 },
  timePill: { minWidth: 48, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', backgroundColor: 'rgba(9,10,14,.46)', color: '#D6D4DC', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  speedPill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(9,10,14,.46)' },
  speedPillText: { color: '#D6D4DC', fontSize: 10, fontWeight: '700' },
  audioInfoRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  audioInfoText: { flexShrink: 1, color: '#85828E', fontSize: 10, textAlign: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigPlay: { width: 72, height: 72, borderRadius: 36, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' },
  playerTools: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#25232D', paddingTop: 16 },
  secondaryTransport: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  toolButton: { alignItems: 'center', gap: 5, minWidth: 75 },
  toolText: { color: '#85838E', fontSize: 9, fontWeight: '600' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 0, backgroundColor: 'rgba(0,0,0,.7)' },
  sheetOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 120 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1, maxHeight: '78%', backgroundColor: '#121118', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  sheetHandle: { width: 45, height: 4, borderRadius: 2, backgroundColor: '#4C4A55', alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#F4F3F7', fontWeight: '900', fontSize: 21 },
  sheetSubtitle: { color: '#777580', fontSize: 10, marginTop: 4, marginBottom: 14 },
  queueRow: { minHeight: 58, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  queueRowOn: { backgroundColor: '#211F2B' },
  eqSheet: { maxHeight: '90%' },
  actionsSheet: { maxHeight: '86%' },
  actionRow: { minHeight: 61, borderRadius: 15, backgroundColor: '#1A1921', marginBottom: 7, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 13 },
  actionText: { flex: 1, color: '#E8E7EC', fontSize: 13, fontWeight: '700' },
  eqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qualityCard: { minHeight: 76, borderRadius: 18, backgroundColor: '#1A1921', marginTop: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switch: { width: 48, height: 27, borderRadius: 14, padding: 3, backgroundColor: '#3B3943' },
  switchOn: { backgroundColor: lime },
  switchThumb: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#F2F1F5' },
  switchThumbOn: { marginLeft: 21, backgroundColor: '#10130B' },
  eqBand: { flex: 1, alignItems: 'center' },
  verticalSlider: { width: 205, height: 32, transform: [{ rotate: '-90deg' }], marginTop: 87, marginBottom: 86 },
  eqValue: { color: '#8D8A96', fontSize: 8 },
  eqLabel: { color: '#B1AEB9', fontSize: 8 },
  eqNotice: { color: '#686671', fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 8 },
});

if (Platform.OS !== 'web') {
  // Evita che Android selezioni accidentalmente il testo durante pressioni lunghe.
}
