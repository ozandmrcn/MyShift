import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useShiftStore } from './stores/useShiftStore'
import Titlebar from './components/Titlebar'
import Dashboard from './components/Dashboard'
import ShiftEditor from './views/ShiftEditor'
import SettingsView from './views/Settings'

export default function App() {
  const { loadFromStore, isLoading } = useShiftStore()

  useEffect(() => {
    loadFromStore()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-100">
        <div className="relative w-12 h-12">
          {/* Windows 11 style progress ring/spinner */}
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        </div>
        <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold mt-4">Veriler Yükleniyor...</span>
      </div>
    )
  }

  return (
    <Router>
      <div className="flex flex-col h-screen overflow-hidden bg-transparent text-slate-100">
        {/* Native custom title bar */}
        <Titlebar />

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar */}
          <nav className="w-16 md:w-56 bg-slate-950/20 border-r border-white/5 flex flex-col justify-between py-6 px-3 flex-shrink-0 select-none">
            {/* Top Navigation Links */}
            <div className="flex flex-col gap-2">
              <NavLink 
                to="/dashboard"
                className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-white/8 text-white border-l-2 border-blue-500' 
                    : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">📊</span>
                <span className="hidden md:inline">Dashboard</span>
              </NavLink>

              <NavLink 
                to="/editor"
                className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-white/8 text-white border-l-2 border-blue-500' 
                    : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">⚙️</span>
                <span className="hidden md:inline">Vardiya Editörü</span>
              </NavLink>
            </div>

            {/* Bottom Settings Link */}
            <div>
              <NavLink 
                to="/settings"
                className={({ isActive }) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-white/8 text-white border-l-2 border-blue-500' 
                    : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">🛠️</span>
                <span className="hidden md:inline">Ayarlar</span>
              </NavLink>
            </div>
          </nav>

          {/* Core Page Content View */}
          <main className="flex-1 p-6 overflow-hidden relative">
            {/* Smooth page fade transition container */}
            <div className="h-full overflow-hidden animate-in fade-in duration-300">
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/editor" element={<ShiftEditor />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  )
}
