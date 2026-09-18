# MyShift Agent Guidance

## Core Commands
- Dev (hot reload): `npm run dev`
- Build: `npm run build` → outputs to `out/`
- Portable build: `npm run pack` → outputs to `dist/win-unpacked`
- Installer: `npm run dist` → `dist\MyShift Setup x.x.x.exe`
- Local admin panel (Firestore UI): `npm run admin` → http://localhost:5100 (requires Firebase service account via `.env`)

## Data & Persistence Gotchas
- **Dev data**: `<project>\data\config.json` (electron-store). This folder is **tracked by git** (intentionally not gitignored).
- **Packaged data**: `<exe-folder>\data` (next to the .exe).  
  - **Critical**: `npm run dist` **deletes and recreates** `dist\win-unpacked\data` from scratch → any user data stored there (including shift history, settings, templates) is **lost**.  
  - To preserve data across rebuilds: either avoid repeated `dist` runs, or back up/restore `data\config.json` manually, or rely on Firebase sync (Push/Pull) if configured.
- **Never commit**: `.env`, service account keys (`*.serviceAccountKey.json`), or anything under `data/`.

## Effective Clock & Breaks (Non‑obvious Logic)
- **Effective time** (`effectiveSecs`) = `realTime + timeOffset − dayShift − pauseElapsed`. Drives schedule.
- **Planned breaks** consume automatically when `effectiveSecs` passes their window → increments `planUsedBy`.
- **Flexible breaks**: spending tracked via `flexUsedBy`; pool = total break minutes − `flexUsedBy`.
- **Switching planned → flexible**: carried planned consumption = `planUsedBy` (for breaks whose window already passed). See `enableFlex` in `useShiftStore.ts`.
- **Same‑day flex re‑enable**: keeps prior `flexUsedBy` (`keepUsage` path). Fresh day starts pool from zero unless `carriedSpent` is provided.
- **Confirmation gate**: after an activity ends, the next activity is pending until user confirms. Overtime/payback logic depends on whether the pending activity is a break (overtime) or work (payback).

## Architecture Highlights
- **Main process**: `src/main/index.ts` (window, tray, IPC, notifications).
- **Renderer entry**: `src/renderer/src/App.tsx` (routes, layout).
- **Core shift logic**: `src/renderer/src/hooks/useLiveShiftEngine.ts` (engine state, effectiveSecs, confirmation gate, auto‑payback).
- **State store**: `src/renderer/src/stores/useShiftStore.ts` (Zustand + persistence, actions like `enableFlex`, `syncFlexUsedFromPlan`).
- **UI**: Timeline (`Timeline.tsx`) shows per‑break chips; Dashboard (`Dashboard.tsx`) hosts confirmation and mode switcher.
- **Firebase**: optional; only active if `VITE_FIREBASE_*` are set in `.env`. Sync is manual (Push/Pull) via `useCloudSync.ts`.

## Verification & Quirks
- **No automated test suite**. Verify changes by running `npm run dev` and testing UI flows.
- **Type checking**: `npx tsc --noEmit` (build step includes TS check).
- **Manual offset (rewind/FF)**: the engine ignores `timeOffset` when computing planned‑break consumption (see `useLiveShiftEngine.ts: syncFlexUsedFromPlan` uses `planClockSecs = effectiveSecs − timeOffset`). This prevents kaydırma from falsely marking breaks as consumed.
- **Admin panel**: runs locally on `127.0.0.1:5100`; requires a Firebase service‑account key (JSON or inline) via `.env`. Never expose this key.
- **Environment variables**: only `VITE_FIREBASE_*` and `FIREBASE_ADMIN_*` (plus `ADMIN_PORT`) are read; missing values disable the related feature silently.

## Quick Checks
- **Where am I/what's next**: Dashboard header (effective clock, next break, overtime/payback counters).
- **Flex pool**: top‑left card in MyShift mode – chip per break shows remaining minutes.
- **Overtime vs payback**: overtime accrues when idle while work is expected; payback lets you work it back (Payback card in Dashboard).
- **Mode switch**: top‑left dropdown (or Settings → Mode). Changing modes does **not** clear today’s progress.