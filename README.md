# MyShift — Personal Shift Management

A privacy-first, offline desktop app for Windows that manages your workday based on your custom shift plan. Everything is computed live from the system clock — no manual timers.

## Features

- **Live shift engine** — current/next activity, remaining time and progress update every second; supports rewinding to any activity via the timeline.
- **Shift modes**
  - *MyShift*: unlimited custom templates with weekdays, specific dates or Turkish public holidays; quick presets (incl. break presets); JSON import/export.
  - *Pay*: fixed window (start–end) or target duration. Once the window/target passes, every extra second counts as aşım until the shift is completed manually.
- **Confirmation gate** — in templates, each work activity after the first one requires confirmation to start ("✔ Onayla ve Geç"); breaks switch automatically. Time spent unconfirmed counts as aşım.
- **Aşım (idle) tracking** — measures and logs time spent idle while an activity is expected (between activities / overtime); auto-resets at day start, resettable anytime.
- **Payback** — earn back your aşım time by working; the payback finishes automatically as soon as paid time matches the owed amount (no over-payment).
- **End-of-day summary** — start/end, planned vs. worked time, total idle log.
- **Rewind** — click any activity in the timeline to jump back as if you started it then.
- **Windows notifications** — shift start, activity transitions, break reminders, completion; synthesized sounds via Web Audio.
- **System tray** — live status tooltip plus actions: Show, Complete Shift, Reset Aşım, Quit.
- **History & statistics** — per-day worked/idle/payback for the last 30 days, plus 7-day totals.
- **Settings** — start with Windows, start minimized, minimize to tray, birthday day-off.
- **Themes** — multiple color themes switchable from Settings via a conic-gradient swatch picker.
- **Persistence** — idle/payback counters, the confirmation gate and daily logs survive restarts (same day); logs are pruned after 90 days.
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
    components/            Dashboard, Timeline, Titlebar, BreakReminders, TypewriterText
    hooks/                 useLiveShiftEngine (live shift logic)
    stores/                useShiftStore (Zustand store + persistence)
    utils/                 soundEffects, motivationEngine, commentEngine
    views/                 ShiftEditor, History, Settings, Data, Observe, TodaySummary
resources/
  icon.ico / icon.png      App/builder icons
  scripts/                 watch-focus.ps1, watch-typing.ps1 (Observe helpers)
```

## Data

Stored as JSON via electron-store in `userData`: `templates`, `settings`, `completedShifts`, `idleState`, `paybackState`, `dailyLogs`, `confirmedActivities`, `windowBounds`. Idle/payback counters measure real time only while the app is running.

## Known Limitations

- Overnight shifts (e.g. 23:00 – 01:00) are not yet supported.
- Daily summaries are recorded only while the app is running.

Made by Ozan Demircan
