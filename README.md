# MyShift

**Dynamic Shift Management System** — a privacy-first, offline-first desktop app for Windows that keeps your workday on track from custom shift plans, with an effective "schedule clock", pooled break accounts, overtime tracking and a real-time dashboard.

Everything runs on your machine by default: **no cloud, no accounts, no telemetry**. An optional Google/Firebase sync and a local-only admin panel exist, but they stay fully disabled until you explicitly configure them.

![Electron](https://img.shields.io/badge/Electron-31-blue?logo=electron)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-06d6d4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Three shift modes for any kind of workday

| Mode | Description |
|------|-------------|
| **MyShift** *(Template)* | Build unlimited shift templates with activities, breaks, weekday/date scheduling and holiday presets |
| **Pay** | A fixed work window (start–end) or a target amount of work minutes, with short-break and meal-break budgets |
| **Chrono** | A manual stopwatch mode — start, pause and resume working and breaks whenever you like |

### Core engine

- **Live shift engine** — current activity, next activity, remaining time and day progress update every second
- **Effective clock** — the engine tracks *scheduled time of day*, not wall time. A late arrival, a pause or a running flexible break shifts or freezes it
- **Confirmation gate** — every activity after the first waits for your explicit "done" confirm, so drifting never counts as planned work by accident
- **Overtime tracking** — time spent idle while work is expected (or after the scheduled shift end) accrues as overtime
- **Payback** — earn that overtime back by working; payback stops exactly when the debt reaches zero
- **Planned / Flexible breaks** — breaks run on the schedule clock (planned) or become a spendable minute pool you draw from whenever you want (flexible)
- **Work & break reminders** — configurable nudges for continuous work or long breaks in Pay/Chrono modes

### Dashboard & UI

- **Real-time clock** with context-aware AI comments (offline engine, or via Ollama / OpenAI / OpenRouter)
- **Today's timeline** — an hour-by-hour strip of work, break and idle segments
- **Day summary** — worked, idle, overtime, payback and break totals at a glance
- **7-day heatmap** — intensity-coded worked hours with completion markers
- **Live weather widget** — from the Open-Meteo API, **no API key needed**
- **Quick mode switcher** — flip between MyShift / Pay / Chrono right from the dashboard

### Data & persistence

- **Full export/import** — a single JSON backup of templates, settings, history and the AI profile
- **Same-day persistence** — counters, confirmation state and the daily log survive restarts
- **Auto-pruning** — history older than 90 days is cleaned automatically
- **Factory reset** — wipes everything after a typed confirmation

### System integration

- **Windows notifications** — shift start, activity changes, break reminders, day completion
- **Synthesized sounds** — bell, digital and default tones via the Web Audio API
- **System tray** — live status tooltip plus quick actions: show window, complete the shift, reset idle, reset breaks, quit
- **Startup options** — launch with Windows, start minimized, auto-minimize to tray
- **Public holiday presets** — one-click holiday template extension (Turkey, 2026 dates included)

### Customization

- **6 color themes** — Night Blue, Emerald, Turquoise, Violet, Cherry, Amber
- **Birthday mode** — designate your birthday as an automatic day off
- **Time offset** — rewind or fast-forward the clock for testing and review
- **Motivation engine** — status lines that react to your progress (and your procrastination)
- **Turkish & English UI** — switch the interface language in Settings

---

## Requirements

| Software | Version |
|----------|---------|
| Operating system | Windows 10 or 11 (x64) |
| Node.js | 18+ (20 LTS recommended) — only to run/build from source |
| npm | Bundled with Node.js |

No Node.js is needed if you use a pre-built installer (see [Option A](#option-a--pre-built-installer)).

---

## Getting Started

### Option A — Pre-built installer

1. Download the latest installer (`.exe`) from the [Releases](https://github.com/ozandmrcn/MyShift/releases) page.
2. Run the installer and follow the on-screen prompts.
3. Launch **MyShift** from your Start menu or desktop shortcut.

Done — no Node.js, no terminal, no configuration required.

### Option B — From source

If you want to run, tweak or develop the app yourself:

**Step 1 — Install Node.js**

Download the LTS installer from [nodejs.org](https://nodejs.org) and run it. Verify it afterwards:

```bash
node --version
npm --version
```

**Step 2 — Clone the repository**

```bash
git clone https://github.com/ozandmrcn/MyShift.git
cd MyShift
```

**Step 3 — Install dependencies**

```bash
npm install
```

**Step 4 — Start the app in development mode**

```bash
npm run dev
```

A window opens with hot-reload enabled: any change you make to the source is applied instantly.

> **First run:** pick your mode (MyShift / Pay / Chrono). In **MyShift** mode, create your first plan in **Shift Editor** (see [How to Use](#how-to-use)). No `.env` file is required — the app works fully offline out of the box.

---

## Building a production installer

```bash
npm run build   # compiles main process + renderer into out/
npm run pack    # creates an unpacked build (portable) in dist/
npm run dist    # compiles + builds the NSIS installer (.exe) in dist/
```

The output lands in the `dist/` directory.

---

## Optional: Firebase Cloud Sync

Cloud sync is **opt-in and off by default**. It signs you in with your Google account and keeps your settings, templates and history in sync across devices. Without configuration the app stays 100% local.

### Step-by-step setup

**1. Create a Firebase project**

Go to the [Firebase Console](https://console.firebase.google.com) → **Add project**. Give it any name (e.g. *myshift-sync*).

**2. Register a web app**

In **Project Settings → Your apps → Web** (the `</>` icon), register an app. The console shows a `firebaseConfig` object with 6 values. Keep this page open — you'll paste them into `.env` in step 5.

**3. Enable Google sign-in**

In **Authentication → Sign-in method**, enable **Google**, add your support email and save.

**4. Set Firestore security rules**

In **Firestore Database → Rules** (create the database first if asked), make sure the rules limit access to each user's own documents:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**5. Configure `.env`**

```bash
copy .env.example .env
```

Fill in the six `VITE_FIREBASE_*` values from step 2:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef1234567890
```

**6. Restart and sign in**

Closed settings are read at startup, so restart the app. Use **Data → Cloud** in the app to sign in with Google (the sign-in happens through a local loopback redirect — credentials never leave your machine except to Firebase).

### How sync behaves

- On login, the app pulls your cloud data and merges — **newer wins** per document (so a factory reset on one device won't wipe your cloud backup).
- Any local change is pushed automatically (debounced by ~2 seconds), day by day.
- Data layout: `users/{uid}/meta/current` holds settings, templates and completed-shift dates; `users/{uid}/days/{YYYY-MM-DD}` holds one document per tracked day.
- Sync diagnostics are appended to `data/cloud-sync.log` in the app's data directory.

---

## Optional: Local Admin Panel

A small, local-only web UI for browsing and editing the Firestore data behind the cloud sync. It runs on your machine, binds to `127.0.0.1`, and authenticates using your service-account key — there is **no login form**.

### Step-by-step setup

**1. Generate a service-account key**

In the Firebase Console: **Project Settings → Service accounts → Firebase Admin SDK → Generate new private key**. This downloads a `serviceAccountKey.json` file. Store it somewhere safe outside the repository.

**2. Add the key to `.env`**

```bash
copy .env.example .env
```

Point the admin panel at the key file:

```
FIREBASE_ADMIN_SERVICE_ACCOUNT=C:/secure/serviceAccountKey.json
```

Alternatively, instead of a file path you can provide the three inline values:

```
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**3. Install and start the panel**

```bash
cd admin
npm install
cd ..
npm run admin
```

**4. Open it**

Browse to `http://localhost:5100`. To use another port, set `ADMIN_PORT` in `.env`.
To manage a **second** Firebase project from the same panel, add the same variables prefixed with `FIREBASE_ADMIN2_` (e.g. `FIREBASE_ADMIN2_SERVICE_ACCOUNT`); a project picker then appears in the UI.

### Security notes

- The panel is **not meant to be deployed** — it has full Firestore access through the admin SDK and no user login.
- `FIREBASE_ADMIN_SERVICE_ACCOUNT` is read from `.env`, which is **git-ignored**. Never commit it.
- If a key ever leaks, **rotate it** in the Firebase Console and update `.env`.

---

## Environment variables

| Variable | Purpose | Required for | Example |
|----------|---------|--------------|---------|
| `VITE_FIREBASE_API_KEY` | Web SDK config — must match your Firebase web app | Cloud sync | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Web SDK config | Cloud sync | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Web SDK config | Cloud sync | `your-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Web SDK config | Cloud sync | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Web SDK config | Cloud sync | `1234567890` |
| `VITE_FIREBASE_APP_ID` | Web SDK config | Cloud sync | `1:1234567890:web:abcdef1234567890` |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT` | Path to a service-account key `.json` | Admin panel (preferred) | `C:/secure/serviceAccountKey.json` |
| `FIREBASE_ADMIN_PROJECT_ID` | Inline service-account fallback | Admin panel | `your-project-id` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Inline service-account fallback | Admin panel | `firebase-adminsdk-xxx@...` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Inline service-account fallback (keep the `\n` escapes) | Admin panel | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `FIREBASE_ADMIN2_*` | Same keys, prefixed, for a second project | Admin panel (optional) | `FIREBASE_ADMIN2_SERVICE_ACCOUNT=...` |
| `ADMIN_PORT` | HTTP port for the admin panel | Admin panel (defaults to `5100`) | `5100` |

> **If no `VITE_FIREBASE_*` values are present, the app silently runs fully local.** Missing or invalid optional config never breaks the app.

---

## How to Use

### 1. Pick a mode

Use the **quick mode switcher** at the top of the Dashboard (or **Settings → Mode**).

- **MyShift** — plan your day with activities and breaks (recommended for a routine schedule).
- **Pay** — a simple work window: fixed hours or a target total, plus short-break and meal-break budgets.
- **Chrono** — a manual stopwatch with no schedule.

### 2. MyShift: create your plan

Open **Shift Editor**:

1. **+ New** → name your template (e.g. "Dev shift").
2. **Add activities** in order. Each entry has:
   - a name and an emoji icon,
   - a start time (new activities stack right after the previous one ends),
   - a **Break?** toggle — real breaks are never counted as work,
   - an optional **notification** (with sound) when the activity starts,
   - optional **notes**.
3. **Schedule it:** choose active weekdays, add **custom dates**, or use the **public holiday** preset for Turkey's official 2026 holidays. Save and make sure the template is **active**.
4. Tip: build separated week blocks with the **Quick Templates** presets, then duplicate and tweak.

The engine resolves today's plan by priority: **birthday template** (if it exists and it's your birthday) → **custom date** → **weekday**.

### 3. The effective clock

Above the timeline you see the **effective clock** — scheduled time of day, not wall time. Everything else (progress, overtime, "next break") is computed from it.

- **Started late?** When you arrive after the plan start, a banner asks *"The day was planned to start at 07:00"* → choose **Start Late**. The whole schedule shifts forward to match your real arrival.
- **Pause** freezes the effective clock where it stands — no overtime, no breaks cut — and shifts the schedule forward when you resume.
- **Rewind / return to live** (time offset) jumps the clock for testing or review; it never records real work.

### 4. Breaks: planned or flexible

The toggle above the timeline chooses how scheduled breaks behave:

- **Planned** — breaks run automatically on the schedule clock. The day plays like a script; a break counts the moment its window arrives. Holding a break longer than planned shifts the remaining schedule accordingly.
- **Flexible** — scheduled break minutes become a **pool** you spend whenever you like:
  - A panel shows a pool bar (used / remaining) plus a **chip per break** (name + minutes left).
  - **Click a green chip** to start the break (☕). The effective clock freezes while it runs within its allowance. **Click it again** to stop (⏹) — unused minutes stay for later.
  - A chip turns **Depleted** (✔) when its allowance is fully spent; a partially used break stays partial and can be resumed.
  - During a break's original slot the engine still sees you "working", so no overtime accrues there and your shift end stays as scheduled.

> The pool is a **single shared ledger**: flexible and planned spending draw from the same per-break allowance, so switching modes mid-day never double-spends.

### 5. The confirmation gate

Work activities after the first don't auto-progress. When one finishes, the bar shows **Awaiting confirmation** until you press **Confirm and continue**; until then that time counts as overtime — this keeps you honest when you drift. You can also **skip to the next activity** early, without overtime.

### 6. Completing the day

- **Complete Shift** ends the day; a success card shows the totals.
- **Reopen** re-opens a finished day — the break ledger starts fresh, so you keep working without stuck "depleted" chips.
- A **Start Late** on a finished/overtime day reopens it too (same fresh-ledger behavior).
- If the schedule ran past its end without completing, the app keeps counting overtime every second until you finish.

### 7. Overtime and payback

- Overtime accrues while you're idle when work is expected, past the shift end without completing, and during over-budget breaks.
- **Start Payback** lets you work it off: the counter decreases while you're active and stops exactly when overtime reaches zero.
- **Reset breaks / Reset idle** (tray or UI) clears today's counters, e.g. after testing.

### 8. Pay mode

- **Window mode** — fixed shift start/end; progress is time-based.
- **Duration mode** — you owe a fixed number of **work minutes** (remaining decreases while you work, breaks don't count); completion triggers when the target is reached.
- Two budgets: **Short break** and **Meal break**. Remaining shrink per break; once a budget is empty, further breaks are logged as overtime. Start/stop breaks from the Dashboard with **Start Break / Back to Work**. Optional work/break reminders nudge you.

### 9. Chrono mode

Press **Start Working**, switch to **☕ on break**, and back. Counters accumulate automatically. No schedule, no overtime. Reminder intervals are configurable in **Settings → Chrono**.

### 10. Everyday niceties

- **Tray** — right-click the icon: Show / Complete Shift / Reset Idle / Reset Breaks / Quit; the tooltip shows live status.
- **Weather widget** — enable and pick a city in Settings; works without an API key.
- **Themes** — pick one of 6 palettes in Settings with a live preview.
- **AI comments** — the line under the clock is generated locally by default; plug in Ollama / OpenAI / OpenRouter in **Settings → AI** for richer text.
- **Observe** — an opt-in recording mode that profiles how you use the app to improve its comments. While recording, the app locks to the Observe page and keeps a clock; your profile can be exported/imported via **Data**.
- **Data view** — export/import a full JSON backup, clear history, or factory reset.

---

## Data & storage

All data is stored locally via `electron-store` in the app's data directory (`%APPDATA%\MyShift` for the packaged app):

| Key | Contents |
|-----|----------|
| `templates` | Shift templates (activities, schedules, holidays) |
| `settings` | App settings (mode, pay config, chrono config, weather, theme) |
| `completedShifts` | List of completed shift dates |
| `idleState` | Live idle/payback/work counters and chrono state |
| `breakState` | Current break, usage budgets, break count |
| `todayDetail` | Hourly log, break log, idle log, confirmed activities |
| `dailyLogs` | Historical per-day records (worked / idle / break seconds) |

**Note:** idle/payback counters measure real time only while the app is running. Closing the app pauses all timers.

---

## Settings reference

| Section | Options |
|---------|---------|
| **Startup** | Launch with Windows, start minimized, minimize to tray |
| **Notifications** | Default sound (bell / digital / none), per-mode work & break reminders |
| **Mode** | MyShift / Pay / Chrono — quick switcher on the dashboard |
| **Pay Config** | Window or duration mode, shift times, break budgets |
| **Chrono Config** | Work / break reminder intervals |
| **AI Comments** | Offline engine / Ollama / OpenAI / OpenRouter |
| **Theme** | 6 color themes with live swatch preview |
| **Weather Widget** | Enable/disable, city search with geocoding |
| **Data** | Export, import, clear history, factory reset |

---

## Tech stack

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
| Optional cloud | Firebase Web SDK 12 + Firebase Admin SDK (both opt-in) |
| Packaging | electron-builder 24 |

---

## Project structure

```
MyShift/
├── src/
│   ├── main/                          # Electron main process
│   │   └── index.ts                   #   Window, tray, notifications, IPC, CSP, surveillance
│   ├── preload/
│   │   └── index.ts                   #   contextBridge API (secure bridge)
│   ├── renderer/
│   │   └── src/
│   │       ├── App.tsx                #   Root: navigation, routes, tray action wiring
│   │       ├── components/
│   │       │   ├── Dashboard.tsx      #   Main dashboard with mode-specific UI
│   │       │   ├── Timeline.tsx       #   Today timeline + flexible-break chips
│   │       │   ├── Titlebar.tsx       #   Custom Windows title bar
│   │       │   ├── BreakReminders.tsx #   Pay/Chrono work & break reminders
│   │       │   ├── TypewriterText.tsx #   Animated typewriter text for comments
│   │       │   └── WeatherWidget.tsx  #   Live weather widget (Open-Meteo API)
│   │       ├── firebase/
│   │       │   ├── firebase.ts        #   Web SDK init + Google auth (gated by VITE_FIREBASE_*)
│   │       │   └── cloudSync.ts       #   Optional cloud sync helpers
│   │       ├── hooks/
│   │       │   ├── useLiveShiftEngine.ts # Core shift engine (3 modes)
│   │       │   └── useCloudSync.ts    #   Optional Firebase wiring (merge/push)
│   │       ├── stores/
│   │       │   └── useShiftStore.ts   #   Zustand store + persistence + actions
│   │       ├── utils/
│   │       │   ├── commentEngine.ts   #   AI comment generation (offline/online)
│   │       │   ├── motivationEngine.ts#   Context-aware motivational lines
│   │       │   ├── cloudLog.ts        #   Cloud-sync diagnostics (data/cloud-sync.log)
│   │       │   └── soundEffects.ts    #   Web Audio notification sounds
│   │       └── views/
│   │           ├── ShiftEditor.tsx    #   Template editor (create/edit shifts)
│   │           ├── Settings.tsx       #   App settings (mode, pay, chrono, weather, AI)
│   │           ├── TodaySummary.tsx   #   End-of-day detailed summary
│   │           ├── History.tsx        #   Historical data & weekly stats
│   │           ├── Data.tsx           #   Export/import, cloud, factory reset
│   │           └── Observe.tsx        #   Opt-in recording & AI profiling
│   └── shared/
│       └── aiTypes.ts                 #   Shared AI types between main/renderer
├── admin/                             # Local-only admin panel (Firestore web UI)
│   ├── server.js                      #   Express + Firebase Admin (127.0.0.1:5100)
│   └── public/index.html              #   Single-file panel UI
├── resources/
│   ├── icon.ico / icon.png            #   App icons
│   └── scripts/                       #   Observe helpers (PowerShell)
├── .env.example                       #   Optional Firebase/admin config template
├── package.json
├── electron.vite.config.ts
└── tsconfig.json
```

---

## Known limitations

- Daily summaries are recorded only while the app is running (closing the app pauses all timers).
- Religious holiday dates (Eid al-Fitr / Eid al-Adha) are approximate and should be verified each year.
- The weather widget needs an internet connection (Open-Meteo API, no key required).
- Cloud sync and the admin panel are single-user features per Google account.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

**Ozan Demircan** — [GitHub](https://github.com/ozandmrcn)