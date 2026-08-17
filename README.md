# MyShift v1.0.0

**Personal Shift Management System** — a privacy-first, offline desktop app for Windows that manages your workday based on custom shift plans.

Everything runs locally on your machine. No cloud, no accounts, no data leaves your device.

![Electron](https://img.shields.io/badge/Electron-31-blue?logo=electron)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Three Shift Modes

| Mode | Description |
|------|-------------|
| **MyShift** | Unlimited custom templates with weekday/date/holiday scheduling, quick presets, JSON import/export |
| **Pay** | Fixed window (start–end time) or target duration mode; overtime (aşım) tracking with automatic payback |
| **Chrono** | Manual chronograph — start/stop work and breaks with buttons, no fixed schedule required |

### Core Engine

- **Live shift engine** — current/next activity, remaining time, and progress update every second
- **Confirmation gate** — each work activity after the first requires explicit confirmation; unconfirmed time counts as aşım
- **Aşım (idle) tracking** — measures time spent idle while working is expected; auto-resets at day start
- **Payback** — earn back your aşım time by working; finishes automatically when paid matches owed (no over-payment)
- **Break management** — short breaks (çay/kahve) and meal breaks with per-day budgets; over-budget breaks count as aşım
- **Chrono work/break reminders** — configurable alerts for continuous work or long breaks

### Dashboard & UI

- **Real-time clock** with AI-generated activity-aware comments (offline or via Ollama/OpenAI/OpenRouter)
- **Today's timeline** — visual hourly log with break, work, and idle segments
- **Day summary stats** — worked, idle, payback, break time at a glance
- **7-day weekly heatmap** — intensity-coded worked hours with completion markers
- **Special weather widget** — live weather data from Open-Meteo API with condition-based emoji and color themes
- **Quick mode switcher** — switch between MyShift/Pay/Chrono directly from the dashboard

### Data & Persistence

- **Full data export/import** — JSON backup of templates, settings, history, and AI profile
- **Factory reset** — typed confirmation ("reset") to wipe all data and start fresh
- **Auto-pruning** — history older than 90 days is automatically cleaned
- **Same-day persistence** — idle/payback/break counters, confirmation state, and daily logs survive app restarts

### System Integration

- **Windows notifications** — shift start, activity transitions, break reminders, completion
- **Synthesized sounds** — Web Audio API for notification sounds (bell, digital, default)
- **System tray** — live status tooltip with actions: Show, Complete Shift, Reset Aşım, Quit
- **Startup options** — launch with Windows, start minimized, auto-minimize to tray
- **Turkish public holidays** — one-click holiday template extension (2026 dates included)

### Customization

- **6 color themes** — Gece Mavisi, Zümrüt, Turkuaz, Menekşe, Kiraz, Kehribar
- **Birthday mode** — set your birthday as a day-off in the schedule
- **Time offset** — rewind/fast-forward the clock for testing or replay
- **Motivation engine** — context-aware status lines that change based on shift progress and idle time

---

## Requirements

- **Windows 10 or 11** (x64)
- **Node.js 18+** (for building from source)
- **npm** (comes with Node.js)

---

## Installation

### Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/ozandemircan/myshift.git
cd myshift

# Install dependencies
npm install

# Start in development mode (with hot-reload)
npm run dev
```

### Build for Production

```bash
# Build the renderer + main process
npm run build

# Create an unpacked build (portable)
npm run pack

# Create an NSIS installer (.exe)
npm run dist
```

The built application will be in the `dist/` directory.

### Pre-built Releases

Download the latest `.exe` installer from the [Releases](https://github.com/ozandemircan/myshift/releases) page, run it, and follow the prompts.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | Electron 31 |
| UI framework | React 19 |
| Language | TypeScript 5.6 |
| Bundler | Vite (electron-vite 2) |
| Styling | Tailwind CSS v4 |
| State management | Zustand 5 |
| Routing | React Router 6 |
| Persistence | electron-store 8 |
| Packaging | electron-builder 24 |

---

## Project Structure

```
MyShift/
├── src/
│   ├── main/                          # Electron main process
│   │   └── index.ts                   #   Window, tray, notifications, IPC, CSP
│   ├── preload/
│   │   └── index.ts                   #   contextBridge API (secure bridge)
│   ├── renderer/
│   │   └── src/
│   │       ├── App.tsx                #   Root: navigation, routes, tray actions
│   │       ├── components/
│   │       │   ├── Dashboard.tsx      #   Main dashboard with all mode-specific UI
│   │       │   ├── Timeline.tsx       #   Hourly today timeline with break/work/idle
│   │       │   ├── Titlebar.tsx       #   Custom Windows title bar
│   │       │   ├── BreakReminders.tsx #   Pay mode break/work reminders
│   │       │   ├── TypewriterText.tsx #   Animated typewriter effect for comments
│   │       │   └── WeatherWidget.tsx  #   Live weather widget (Open-Meteo API)
│   │       ├── hooks/
│   │       │   └── useLiveShiftEngine.ts  # Core shift engine (3 modes)
│   │       ├── stores/
│   │       │   └── useShiftStore.ts   #   Zustand store + persistence + actions
│   │       ├── utils/
│   │       │   ├── commentEngine.ts   #   AI comment generation (offline/online)
│   │       │   ├── motivationEngine.ts#   Context-aware motivational lines
│   │       │   └── soundEffects.ts    #   Web Audio notification sounds
│   │       └── views/
│   │           ├── ShiftEditor.tsx    #   Template editor (create/edit shifts)
│   │           ├── Settings.tsx       #   App settings (mode, pay, chrono, weather)
│   │           ├── TodaySummary.tsx   #   End-of-day detailed summary
│   │           ├── History.tsx        #   Historical shift data & weekly stats
│   │           ├── Data.tsx           #   Export/import data management
│   │           └── Observe.tsx        #   App usage surveillance & AI profiling
│   └── shared/
│       └── aiTypes.ts                 #   Shared AI types between main/renderer
├── resources/
│   ├── icon.ico / icon.png            #   App icons
│   └── scripts/                       #   Observe helpers (PowerShell)
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
└── index.css                          #   Theme palettes + global styles
```

---

## Data Storage

All data is stored locally via `electron-store` in the app's data directory:

| Key | Contents |
|-----|----------|
| `templates` | Shift templates (activities, schedules, holidays) |
| `settings` | All app settings (mode, pay config, chrono config, weather, theme) |
| `completedShifts` | List of completed shift dates |
| `idleState` | Live idle/payback/work counters + chrono state |
| `breakState` | Current break, usage budgets, break count |
| `todayDetail` | Hourly log, break log, idle log, confirmed activities |
| `dailyLogs` | Historical per-day records (worked/idle/break seconds) |

**Note:** Idle/payback counters measure real time only while the app is running. Closing the app pauses all timers.

---

## Settings

| Section | Options |
|---------|---------|
| **Startup** | Launch with Windows, start minimized, minimize to tray |
| **Notifications** | Default sound (bell/digital/none), per-mode work/break reminders |
| **Mode** | MyShift / Pay / Chrono — quick switcher on dashboard |
| **Pay Config** | Window or duration mode, shift times, break budgets |
| **Chrono Config** | Work/break reminder intervals |
| **AI Comments** | Offline generative / Ollama / OpenAI / OpenRouter |
| **Theme** | 6 color themes with live swatch preview |
| **Weather Widget** | Enable/disable, city search with geocoding |
| **Data** | Export, import, clear history, factory reset |

---

## Known Limitations

- Daily summaries are recorded only while the app is running
- Turkish holiday dates (Ramazan/Kurban) are approximate and should be verified yearly
- Weather widget requires an internet connection (data from Open-Meteo API, no API key needed)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

**Ozan Demircan** — [GitHub](https://github.com/ozandemircan)
