# Flow Timer

A calm pomodoro timer, 24-hour countdown and stopwatch. It runs in the browser, keeps working offline, and can be installed as an app.

**Try it:** https://pomodoro-timer-five-pi.vercel.app/

## Features

- **Pomodoro flow:** a 20, 25 or 45 minute focus session, then a break. Sessions are counted.
- **24h mode:** count down from any time up to 23:59:59. Save it as a preset.
- **Stopwatch:** counts up.
- **Accurate timing:** the timer uses the clock, not tick counting, so it stays correct in a background tab and keeps running if you reload.
- **Alerts:** a choice of three sounds plus a browser notification when time is up.
- **Your settings are remembered:** theme, sound, break length, presets and wallpaper.
- **Focus mode:** hides everything except the timer.
- **Wallpaper:** use any image URL or upload a picture.
- **Keyboard:** <kbd>Space</kbd> starts and stops, <kbd>R</kbd> resets, <kbd>Esc</kbd> closes the editor. Tap the time to set a custom duration.
- **Works offline:** you can install it from the browser's install button or the address bar.

## Run locally

No build step. Serve the folder with any static server:

```bash
npm start            # or: python3 -m http.server 8000
```

Then open http://localhost:8000.

## Test

The smoke test opens the app in headless Chromium and checks startup, countdown, stopwatch, reload persistence and offline loading.

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | App markup |
| `styles.css` | Styling, light and dark themes, screen positions |
| `script.js` | Timer logic, settings and keyboard shortcuts |
| `sw.js` | Service worker for offline use (network-first) |
| `manifest.webmanifest` | Install metadata |
| `tests/smoke.js` | Browser smoke test |

## Deploying

Vercel deploys the `main` branch automatically. Other branches get their own preview URL.
