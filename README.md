# MyShift — Personal Shift Management

A privacy-first, offline desktop app for Windows that manages your workday based on your custom shift plan. Everything is computed live from the system clock — no manual timers.

## Features

- **Live shift engine** — current/next activity, remaining time and progress update every second.
- **Unlimited shift templates** — create, edit, duplicate, delete; assign weekdays, specific dates or Turkish public holidays; JSON import/export.
- **Idle tracking** — time spent idle between activities is measured and logged daily (never outside an active shift).
- **Payback** — earn back your idle time by working; finishing payback completes the shift.
- **End-of-day summary** — start/end, planned vs. worked time, total idle log.
- **Rewind** — click any activity in the timeline to jump back as if you started it then.
- **Windows notifications** — shift start, activity transitions, completion; synthesized sounds via Web Audio.
- **System tray** — live status tooltip plus actions: Show, Complete Shift, Reset Idle, Quit.
- **History & statistics** — per-day worked/idle/payback for the last 30 days, plus 7-day totals.
- **Settings** — start with Windows, start minimized, minimize to tray, birthday day-off.
- **Persistence** — idle/payback counters and daily logs survive restarts (same day); logs are pruned after 90 days.
- **Fluent design** — Mica background, rounded corners, custom title bar, Windows 10/11 look.

## Getting Started

```bash
npm install    # install dependencies
npm run dev    # start in development mode (hot-reload)
```

## Building

```bash
npm run build  # production build (out/)
npm run pack   # unpacked build (dist/)
npm run dist   # NSIS installer
```

## Tech Stack

Electron 31 · React 19 · TypeScript · Vite (electron-vite) · Tailwind CSS v4 · Zustand 5 · React Router 6 · electron-store · electron-builder

## Project Structure

```
src/
  main/index.ts            Main process: window, tray, notifications, IPC, CSP
  preload/index.ts         contextBridge API (secure bridge)
  renderer/src/
    App.tsx                Root component: navigation, routes, tray actions
    components/            Dashboard, Timeline, Titlebar
    hooks/                 useLiveShiftEngine (live shift logic)
    stores/                useShiftStore (Zustand store + persistence)
    views/                 ShiftEditor, History, Settings
    utils/                 soundEffects (Web Audio synthesizer)
```

## Data

Stored as JSON via electron-store in `userData`: `templates`, `settings`, `completedShifts`, `idleState`, `dailyLogs`, `windowBounds`. Idle/payback counters measure real time only while the app is running.

## Known Limitations

- Overnight shifts (e.g. 23:00 – 01:00) are not yet supported.
- Daily summaries are recorded only while the app is running.

MyShift is a desktop application for Windows that helps you manage your workday based on your custom shift plan.

Made by Ozan Demircan
