# Flow Timer

A calm, yoga-inspired pomodoro countdown timer with a dark theme, work/break flow, sound alerts, local persistence, and installable PWA support.

## Features
- 20-minute default focus timer
- 24-hour reusable countdown mode
- Work / break toggle with session tracking
- Custom break duration and quick presets
- Mute toggle and sound selection
- Progress ring and browser notifications
- Mobile responsive layout
- Offline-friendly behavior with service worker
- Installable as a standalone app
- Click-to-edit timer display

## Run locally

```bash
cd /Users/eddybrownii/pomodoro-timer
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project structure

- `index.html` — app structure
- `styles.css` — styling and responsive design
- `script.js` — timer logic and interactions
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker
- `icon.svg` — app icon

## GitHub

Create a GitHub repository and then run:

```bash
git remote add origin git@github.com:<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```
