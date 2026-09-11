import { useEffect, useState } from 'react'
import { HashRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useShiftStore } from './stores/useShiftStore'
import Titlebar from './components/Titlebar'
import Dashboard from './components/Dashboard'
import ShiftEditor from './views/ShiftEditor'
import History from './views/History'
import SettingsView from './views/Settings'
import DataView from './views/Data'
import ObserveView from './views/Observe'
import TodaySummary from './views/TodaySummary'
import { useBreakReminders, ReminderBanner } from './components/BreakReminders'
import { useT } from './i18n/useT'

export default function App() {
  const { loadFromStore, isLoading } = useShiftStore()
  const { t } = useT()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // While observation is recording, the app is locked to the Observe tab — the
  // user chose to collect pure data, so the shift tracker UI is put away.
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    loadFromStore()
  }, [])

  // Apply the selected theme (accent palette) to the root element.
  const theme = useShiftStore((s) => s.settings.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark')
  }, [theme])

  // Pay-mode break reminders run globally (any view, even minimized-to-tray).
  useBreakReminders()

  useEffect(() => {
    const poll = async () => {
      const s = await window.electronAPI?.surveillance?.getStatus?.()
      setRecording(!!s?.enabled)
    }
    void poll()
    const t = window.setInterval(poll, 3000)
    return () => window.clearInterval(t)
  }, [])

  // Tray quick actions — triggered from the system tray context menu
  useEffect(() => {
    const off = window.electronAPI?.tray?.onAction?.((action: string) => {
      const store = useShiftStore.getState()
      if (action === 'reset-idle') {
        store.resetIdle()
      } else if (action === 'complete-shift') {
        const d = new Date()
        const today = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
        store.completeShift(today)
      } else if (action === 'reset-breaks') {
        store.resetBreaks()
      }
    })
    return () => off?.()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-100">
        <div className="relative w-12 h-12">
          {/* Windows 11 style progress ring/spinner */}
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 accent-border border-t-transparent animate-spin" />
        </div>
        <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold mt-4">{t('sidebar.loading')}</span>
      </div>
    )
  }

  return (
    <Router>
      <div className="app-bg flex flex-col h-screen overflow-hidden text-slate-100">
        {/* Native custom title bar */}
        <Titlebar />

        {/* Global pay-mode break reminder banner */}
        <ReminderBanner />

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar */}
          <nav className={`flex flex-col justify-between py-6 px-3 flex-shrink-0 select-none transition-all duration-300 overflow-hidden ${
            sidebarOpen
              ? 'w-16 md:w-56 bg-slate-950/20 border-r border-white/5'
              : 'w-0 px-0 opacity-0 border-r-0'
          }`}>
            {/* Top Navigation Links */}
            <div className="flex flex-col gap-2">
              {!recording && (
                <>
                  <NavLink 
                    to="/dashboard"
                    className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? 'bg-white/8 text-white border-l-2 accent-border' 
                        : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">📊</span>
                    <span className="hidden md:inline">Dashboard</span>
                  </NavLink>

                  <NavLink 
                    to="/today"
                    className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? 'bg-white/8 text-white border-l-2 accent-border' 
                        : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">📋</span>
                    <span className="hidden md:inline">{t('sidebar.summary')}</span>
                  </NavLink>

                  <NavLink 
                    to="/history"
                    className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? 'bg-white/8 text-white border-l-2 accent-border' 
                        : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">🗓️</span>
                    <span className="hidden md:inline">{t('sidebar.history')}</span>
                  </NavLink>
                </>
              )}

              <NavLink 
                to="/observe"
                className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-white/8 text-white border-l-2 border-amber-500' 
                    : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">👁️</span>
                <span className="hidden md:inline">{t('sidebar.observe')}</span>
              </NavLink>

              {!recording && (
                <>
                  <NavLink 
                    to="/data"
                    className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? 'bg-white/8 text-white border-l-2 accent-border' 
                        : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">🛰️</span>
                    <span className="hidden md:inline">{t('sidebar.data')}</span>
                  </NavLink>

                  <NavLink 
                    to="/editor"
                    className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? 'bg-white/8 text-white border-l-2 accent-border' 
                        : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">⚙️</span>
                    <span className="hidden md:inline">{t('sidebar.shiftEditor')}</span>
                  </NavLink>
                </>
              )}
            </div>

            {/* Bottom Settings Link */}
            <div>
              {!recording && (
                <NavLink 
                  to="/settings"
                  className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-white/8 text-white border-l-2 accent-border' 
                      : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                  }`}
                >
                  <span className="text-lg">🛠️</span>
                  <span className="hidden md:inline">{t('sidebar.settings')}</span>
                </NavLink>
              )}

              <button
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/4 hover:text-slate-200 transition-all w-full"
                title={t('sidebar.hideMenu')}
              >
                <span className="text-lg">◀</span>
                <span className="hidden md:inline">{t('sidebar.hideMenu')}</span>
              </button>
            </div>
          </nav>

          {/* Core Page Content View */}
          <main className="flex-1 p-6 overflow-hidden relative">
            {/* Reopen sidebar button when collapsed */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute left-2 top-2 z-30 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 text-xs font-medium hover:bg-slate-700/80 transition-colors shadow-lg"
                title={t('sidebar.openMenu')}
              >
                <span className="text-sm">☰</span>
                <span className="hidden md:inline">{t('sidebar.openMenu')}</span>
              </button>
            )}
            {/* Smooth page fade transition container */}
            <div className="h-full overflow-hidden animate-in fade-in duration-300">
              <Routes>
                {recording ? (
                  <>
                    <Route path="/observe" element={<ObserveView />} />
                    <Route path="*" element={<Navigate to="/observe" replace />} />
                  </>
                ) : (
                  <>
                    <Route path="/today" element={<TodaySummary />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/observe" element={<ObserveView />} />
                    <Route path="/editor" element={<ShiftEditor />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/data" element={<DataView />} />
                    <Route path="/settings" element={<SettingsView />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </>
                )}
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  )
}
