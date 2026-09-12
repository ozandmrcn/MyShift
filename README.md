# MyShift v1.0.0

**Personal Shift Management System** — a privacy-first, offline-first desktop app for Windows that manages your workday based on custom shift plans.

Everything runs locally on your machine by default: no cloud, no accounts, no data leaves your device. An optional, opt-in Google/Firebase sync and a local-only admin panel exist but are fully disabled until you configure them.

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
| **MyShift** | Unlimited custom templates with weekday/date/holiday scheduling, flexible/planned breaks, quick presets, JSON import/export |
| **Pay** | Fixed window (start–end time) or target duration mode; short/meal break budgets; overtime tracking with automatic payback |
| **Chrono** | Manual chronograph — start/stop work and breaks with buttons, no fixed schedule required |

### Core Engine

- **Live shift engine** — current/next activity, remaining time, and progress update every second
- **Effective clock** — the engine works on an "effective time of day": a late start (kaydırma), pausing, or a running flex break all shift/freeze it, never real wall time
- **Confirmation gate** — each work activity after the first requires explicit confirmation; unconfirmed time counts as overtime
- **Overtime (idle) tracking** — measures time spent idle while working is expected; auto-resets at day start
- **Payback** — earn back your overtime time by working; finishes automatically when paid matches owed (no over-payment)
- **Break management** — *Programlı* (scheduled on the window clock) or *Esnek* (pooled, spendable chip-by-chip) breaks with per-day budgets; over-budget breaks count as overtime
- **Chrono work/break reminders** — configurable alerts for continuous work or long breaks

### Dashboard & UI

- **Real-time clock** with activity-aware AI comments (offline or via Ollama/OpenAI/OpenRouter)
- **Today's timeline** — hourly log with break, work, and idle segments
- **Day summary stats** — worked, idle, payback, break time at a glance
- **7-day weekly heatmap** — intensity-coded worked hours with completion markers
- **Weather widget** — live weather from Open-Meteo API (no API key) with condition-based emoji and color themes
- **Quick mode switcher** — switch between MyShift/Pay/Chrono directly from the dashboard

### Data & Persistence

- **Full data export/import** — JSON backup of templates, settings, history, and AI profile
- **Factory reset** — typed confirmation ("reset") wipes all data and starts fresh
- **Auto-pruning** — history older than 90 days is automatically cleaned
- **Same-day persistence** — counters, confirmation state, and daily logs survive app restarts

### System Integration

- **Windows notifications** — shift start, activity transitions, break reminders, completion
- **Synthesized sounds** — Web Audio notification sounds (bell, digital, default)
- **System tray** — live status tooltip with actions: Show, Complete Shift, Reset Overtime, Quit
- **Startup options** — launch with Windows, start minimized, auto-minimize to tray
- **Turkish public holidays** — one-click holiday template extension (2026 dates included)

### Customization

- **6 color themes** — Night Blue, Emerald, Turquoise, Violet, Cherry, Amber
- **Birthday mode** — set your birthday as a day-off in the schedule
- **Time offset** — rewind/fast-forward the clock for testing or replay
- **Motivation engine** — context-aware status lines driven by shift progress and idle time

---

## Requirements

- **Windows 10 or 11** (x64)
- **Node.js 18+** (20+ recommended) — for building from source
- **npm** (comes with Node.js)

---

## Installation

### Option A — Pre-built Releases

Download the latest `.exe` installer from the [Releases](https://github.com/ozandemircan/myshift/releases) page, run it, and follow the prompts. No Node.js needed.

### Option B — From Source

```bash
# 1) Clone the repository
git clone https://github.com/ozandemircan/myshift.git
cd myshift

# 2) Install dependencies
npm install

# 3) Run in development mode (hot-reload)
npm run dev
```

**First run:** pick your mode (MyShift / Pay / Chrono) and, if you use MyShift, create your first shift plan in **Shift Editor** (see *How to Use*). No `.env` file is required — the app works fully offline out of the box.

### Build for Production

```bash
# Build the renderer + main process
npm run build

# Create an unpacked build (portable)
npm run pack

# Create an NSIS installer (.exe)
npm run dist
```

The built application lands in the `dist/` directory.

### Optional: Cloud Sync + Admin Panel

Both are **opt-in and off by default**. Copy `.env.example` → `.env` and fill in the values you need:

```bash
copy .env.example .env
```

- **Cloud sync (renderer):** define the `VITE_FIREBASE_*` web-app values from the Firebase Console. The Cloud button in the app then signs in with Google and back up/restores your settings, templates, and history per account. If these are missing/misconfigured, the app silently stays 100% local.
- **Admin panel (local-only web UI over your Firestore):** define `FIREBASE_ADMIN_SERVICE_ACCOUNT` (a service-account key file path) or the inline `FIREBASE_ADMIN_PROJECT_ID` / `CLIENT_EMAIL` / `PRIVATE_KEY` fields, then:

  ```bash
  cd admin
  npm install
  cd ..
  npm run admin
  ```

  Open `http://localhost:5100`. There is **no login** — authorization comes from the service-account key, which has full Firestore access. Keep the key private (`.env` is git-ignored) and rotate it if it ever leaks.

    > ⚠️ The `.env` file is excluded from git. **Never commit it** — it contains live credentials.

---

## How to Use

### 1. Pick a mode

Use the **quick mode switcher** on top of the Dashboard (or Settings → Mode):

- **MyShift** — you plan your day with activities and breaks (recommended if you follow a routine).
- **Pay** — a simple work window: fixed hours or a target total, plus two break budgets (short + meal).
- **Chrono** — a manual stopwatch (work/break) with no schedule.

### 2. MyShift: create your plan

Open **Vardiya Düzenleyici (Shift Editor)**:

1. **+ Yeni** → name your template, e.g. "Yazılım Vardiyam".
2. **Add activities** in order — each entry adds:
   - a name and an emoji icon,
   - a start time (new activities auto-stack right where the previous one ended),
   - a **🧘 Mola mı?** toggle — mark real breaks so they are never counted as work,
   - an optional **notification** (with sound) to alert you when the activity starts,
   - optional **notes**.
3. **Schedule it:** choose active weekdays, add **custom dates**, or use the **🇹🇷 TR Resmi Tatilleri** button for public holidays. Save and make sure the template is **active**.
4. Tip: build separated week blocks with the **⚡ Hızlı Şablonlar** presets, then duplicate and tweak.

The engine resolves today's plan by priority: **birthday** (if a "Doğum Günü" template exists and it's your birthday) → **custom date** → **weekday**.

### 3. The effective clock and "kaydırma"

Above the timeline you see **Efektif saat (effective clock)** — the schedule time, not the wall time. Everything else (progress, aşım, "next break") is computed from it.

- **Started late?** When you arrive after the plan start, a banner asks *"The day was planned to start at 07:00"* → **I Started Late / Kaydır**. The whole schedule shifts forward to match your real arrival (e.g. all 15-min breaks now show their shifted time in amber).
- **Pause (Duraklat)** freezes the effective clock where it stands — no aşım, no breaks cut — and shifts the schedule forward on resume.
- **Rewind / Return to live** (time offset) lets you jump the clock for testing or review; it never records real work.

### 4. Breaks: Programlı (planned) or Esnek (flexible)

The toggle above the timeline picks how scheduled breaks behave:

- **Programlı (Planned)** — breaks run automatically on the schedule clock: the day plays like a script, and a break counts the moment its window arrives. If you hold a break longer than planned, the remaining days shift accordingly.
- **Esnek (Flexible)** — scheduled break minutes become a **pool** you spend whenever you like:
  - The panel shows a pool bar (used/remaining) plus a **chip per break** (name + minutes left).
  - **Click a green chip** → the break starts (☕). The effective clock freezes while it runs within its allowance. **Click it again** → it stops (⏹), and the unused minutes stay for later.
  - A chip turns **✔ Tükendi** when its own allowance is fully spent; a partially used break stays partial and can be resumed.
  - During a break's original slot you keep "working" in the engine's eyes, so nothing counts as idle/aşım there, and your shift end stays as scheduled.

> The pool is a **shared ledger**: flex spending and planned spending both draw from the same per-break allowance, so switching modes mid-day never double-spends.

### 5. Confirmation gate

Work activities after the first don't auto-progress: when one finishes, the bar shows **Onay Bekliyor — Onayla ve Geç**. Until you confirm, that dead time counts as aşım (overtime) — this is what keeps you honest when you drift. You can also **Sıradaki Aktiviteye Geç** early to skip an activity without aşım.

### 6. Completing the day

- **Vardiyayı Tamamla** ends the day; a success card shows the totals.
- **↩ Geri Al / Devam Et** re-opens a finished day — the break ledger starts fresh, so you keep working without stuck "Tükendi" chips.
- A **kaydırma** on a finished/aşım day re-opens it too (same fresh-ledger behavior).
- If the schedule ran past its end without completing, the app keeps counting **aşım** every second until you finish.

### 7. Aşım (overtime) and payback

- Aşım accrues while you're idle when work is expected, while past the shift end without completing, and during over-budget breaks.
- **Payback Başlat** lets you work it off: the payback counter decreases every second while you're active, and it auto-stops exactly when aşım reaches zero (no negative overpay).
- **↺ Aşımı Sıfırla** clears today's aşım counter (e.g. after testing).

### 8. Pay mode

- **Window mode** — fixed *Başlangıç/Bitiş* times; progress is time-based.
- **Duration mode** — you owe a fixed number of **work minutes** (kalan azalır çalıştıkça, molalar sayılmaz); completion triggers when the target is reached.
- Two budgets (Kısa Mola + Yemek Molası). Remaining shrink per break; once a budget is empty, further breaks are logged as **aşım**. Start/stop breaks from the Dashboard with **☕ Mola Başlat / ⏱️ Çalışmaya Dön**. Optional work/break reminders nudge you.

### 9. Chrono mode

Press **▶ Çalışmaya Başla**, switch to **☕ on break**, and back — the counters accumulate automatically. No schedule, no aşım. Reminder intervals are configurable in Settings → Chrono.

### 10. Everyday niceties

- **Tray**: right-click the icon for Show / Complete Shift / Reset Overtime / Quit; the tooltip shows live status.
- **Weather widget**: enable + pick a city in Settings; works without an API key.
- **Themes**: choose one of 6 palettes in Settings with a live preview.
- **Comments**: the line under the clock is generated locally by default; plug Ollama/OpenAI/OpenRouter in Settings → AI for richer text.
- **Observe**: let the app profile your usage to improve comments (optional; export/import the AI profile via Data).
- **Data view**: export/import a full JSON backup, clear history, or factory reset ("reset").

---

## Data Storage

All data is stored locally via `electron-store` in the app's data directory:

| Key | Contents |
|-----|----------|
| `templates` | Shift templates (activities, schedules, holidays) |
| `settings` | App settings (mode, pay config, chrono config, weather, theme) |
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
| Optional cloud | Firebase Web SDK 12 (opt-in) |
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
│   │       │   ├── Timeline.tsx       #   Today timeline + (esnek) break chips
│   │       │   ├── Titlebar.tsx       #   Custom Windows title bar
│   │       │   ├── BreakReminders.tsx #   Pay mode break/work reminders
│   │       │   ├── TypewriterText.tsx #   Animated typewriter effect for comments
│   │       │   └── WeatherWidget.tsx  #   Live weather widget (Open-Meteo API)
│   │       ├── firebase/
│   │       │   └── cloudSync.ts       #   Optional cloud sync (opt-in, per account)
│   │       ├── hooks/
│   │       │   ├── useLiveShiftEngine.ts # Core shift engine (3 modes)
│   │       │   └── useCloudSync.ts    #   Optional Firebase wiring
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
├── admin/                             # Optional local-only admin panel (Firestore)
│   ├── server.js                      #   Express + Firebase Admin (port 5100)
│   └── public/index.html              #   Single-file panel UI
├── resources/
│   ├── icon.ico / icon.png            #   App icons
│   └── scripts/                       #   Observe helpers (PowerShell)
├── .env.example                       #   Optional Firebase/admin config template
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
└── index.css                          #   Theme palettes + global styles
```

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