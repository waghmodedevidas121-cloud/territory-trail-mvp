# Territory Trail MVP

A small original territory-capture arcade game built as an Android-friendly Progressive Web App (PWA). It uses a grid, a drawn trail, flood-fill territory capture, two roaming rival bots, and touch/keyboard controls. The static GitHub Pages version stores scores in the current browser; it does not provide a shared leaderboard.

## Run it

Requirements: Node.js 20 or newer. There are no npm dependencies and no build step.

```sh
cd /workspace/territory-trail-mvp
npm start
```

Open `http://localhost:4173` on the same computer. To use another device on the same network, start the server with `HOST=0.0.0.0 npm start`, then open the computer's LAN address on the phone. For example, `http://192.168.1.20:4173` (use your computer's actual address).

On Android, open the game in Chrome and use **Add to Home screen** or **Install app** from the browser menu. The PWA app shell and game are cached after the first load, so the game itself can be played offline. High scores are saved in the browser's local storage, separately on each device. Browser PWA installation generally requires HTTPS or localhost; a plain LAN HTTP URL may still run the game in-browser but may not offer installation/offline caching.

## GitHub Pages

The repository deploys the contents of `public/` with GitHub Actions. The asset, manifest, and service-worker URLs are relative so the site works at the repository subpath (`https://<owner>.github.io/<repository>/`). Each browser keeps its own high scores in local storage; scores are not synced between devices.

## Controls and scoring

- Swipe on the field or use the on-screen directional pad; keyboard users can use arrows or WASD.
- Leave your mint-colored turf, draw a loop, and re-enter your own turf to capture enclosed cells.
- Your open trail is vulnerable to the bots. Running into rival land, the edge, or your own open trail ends the run.
- Each captured cell is worth 10 points; cutting a rival's open trail gives a small bonus.
- Press **Pause** (or Space/Escape) to pause. Use **Restart** to begin a new run.
- After a run ends, enter a name and save to the local top-10 leaderboard. Static GitHub Pages stores up to 50 entries in this browser's local storage.

## Test

```sh
npm test
```

## Project structure

- `public/` — responsive canvas game, UI, manifest, icon, and service worker
- `public/game-engine.js` — grid and territory flood-fill logic
- `server.js` — static-file server and `/api/health`, `/api/leaderboard`, `/api/scores` endpoints
- `data/leaderboard.json` — created by the optional Node server on the first successful score submission
- `test/` — engine and API tests

## MVP limitations

This workspace does not have the Android SDK, Gradle, or ADB, so this is **not a native APK**. The installable PWA is the closest runnable Android-compatible deliverable; it is playable in a mobile browser and can be added to the Android home screen on a secure origin. The GitHub Pages build has no shared server-side leaderboard; each browser keeps its own local scores. The optional Node server API remains a local single-process MVP, not concurrent production infrastructure.
