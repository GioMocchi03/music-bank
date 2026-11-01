# Android Auto bug fix — verification status

Draft 1.3.15 (29). Not a verified release.

## Source preservation

The uploaded `music-bank-android-auto-sources.tar.gz` is kept unchanged. Its 13 selected files were applied to GitHub baseline d4f7ffb and recorded in commit b237c26 before edits. The archive is a selected-file snapshot, not a complete repository backup. No file on the Debian server has been changed. Additional server changes outside this archive cannot be compared here.

## Changes

Android transport commands, current position, queue, repeat and shuffle use the Media3 library service, including the phone UI. The Expo player remains the implementation on iOS/web. Android keeps an idle Expo instance for hook compatibility; it is never loaded or activated for playback. The native bridge retains a controller instead of connecting and releasing for every read. React samples state every 500 ms, including when returning from the background. Native playback and queue advancement do not depend on the JS timer.

Phone queue additions, removals and moves use native queue operations, preserving playback position. Playback uses the existing local-file versus authenticated raw-stream selection. The first track's URL resolution is unchanged; URLs for remaining queue entries are resolved before replacing the native queue.

Catalog writes are serialized; replacement waits for async File.move with overwrite. Cleanup uses a separate temporary File because move mutates its URI. Existing catalogs and empty libraries are regenerated, with refreshed credentials and metadata. A native FileObserver plus an explicit refresh notify subscribed browsers. Failed parsing keeps the last usable native catalog.

Browse hierarchy: albums, artists → albums, genres, songs; lists over 100 entries expose range folders. Search no longer truncates the source result set to 200 entries. The controller requests result pages. Single catalog-track selections populate their album context, while explicit phone queues retain order and local URIs. No custom Android Auto screen is used: the host renders MediaLibraryService and MediaSession controls.

## Local checks

- TypeScript: PASS.
- Unit tests: 57 PASS (including five catalog persistence tests).
- Android Metro/Hermes export: PASS.
- Kotlin/Gradle: BLOCKED before compilation. After fetching Gradle 9.3.1 separately, offline and online attempts both failed resolving org.gradle.toolchains.foojay-resolver-convention:1.0.0. No Kotlin compilation result is available.
- EAS preview command attempted: BLOCKED before starting a build because this environment is not logged into Expo.
- Android Auto vehicle/DHU: NOT RUN.
- GitHub native CI: NOT STARTED. Publishing the review branch was rejected by automatic approval review because the repository is public and contains previously unpublished local work; explicit publication authorization is needed.
- No installable verified APK has been produced.

The existing tests for queue utilities were restored with the matching functions already present on GitHub; the local snapshot lacked these exports.

## Required device checks

Install the EAS preview APK using the existing signing credential. Check cold-start Auto browsing, every category and range folder, Unicode search, artwork, selection from an album and remote search, and large libraries, including initial playback latency for a large queue (remaining stream URLs are resolved before queue replacement). In both directions check play/pause, next/previous, seek, duplicate tracks in queue, append/move/remove (including the playing item), repeat and shuffle. Compare the phone state after returning from background; allow up to one sampling interval. Test disconnect/reconnect, loss of network, preferred offline tracks, account switching/logout, empty libraries, and a sync while Auto is connected.

The debug CI APK uses a different signing key and is only a build verification artifact. It cannot update an installed production-signed Music Bank APK.

## Official references

- https://developer.android.com/media/media3/session/serve-content
- https://developer.android.com/media/media3/session/background-playback
- https://docs.expo.dev/versions/v57.0.0/
