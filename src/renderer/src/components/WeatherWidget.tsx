import { useState, useEffect, useCallback } from 'react'
import { useT } from '../i18n/useT'
import { useShiftStore } from '../stores/useShiftStore'

interface WeatherInfo {
  emoji: string
  label: string
  bg: string
  border: string
  text: string
}

function isNight(hour: number): boolean {
  return hour < 6 || hour >= 19
}

function wmoCode(code: number, night: boolean, t: any): WeatherInfo {
  if (code === 0) return night
    ? { emoji: '🌙', label: t('weather.wmo0'), bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-300' }
    : { emoji: '☀️', label: t('weather.wmo0'), bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-300' }
  if (code === 1) return night
    ? { emoji: '🌤️', label: t('weather.wmo1'), bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-300' }
    : { emoji: '🌤️', label: t('weather.wmo1'), bg: 'bg-amber-500/8', border: 'border-amber-500/15', text: 'text-amber-300' }
  if (code === 2) return night
    ? { emoji: '⛅', label: t('weather.wmo2'), bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-300' }
    : { emoji: '⛅', label: t('weather.wmo2'), bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-300' }
  if (code === 3) return { emoji: '☁️', label: t('weather.wmo3'), bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-300' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: t(`weather.wmo${code}` as any), bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-300' }
  if (code >= 51 && code <= 55) return { emoji: '🌦️', label: t(`weather.wmo${code}` as any), bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-300' }
  if (code === 56 || code === 57) return { emoji: '🌧️', label: t(`weather.wmo${code}` as any), bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-300' }
  if (code >= 61 && code <= 65) return { emoji: '🌧️', label: t(`weather.wmo${code}` as any), bg: 'bg-blue-500/12', border: 'border-blue-500/25', text: 'text-blue-300' }
  if (code === 66 || code === 67) return { emoji: '🧊', label: t(`weather.wmo${code}` as any), bg: 'bg-cyan-500/12', border: 'border-cyan-500/25', text: 'text-cyan-300' }
  if (code >= 71 && code <= 77) return { emoji: '❄️', label: t(`weather.wmo${code}` as any), bg: 'bg-white/10', border: 'border-white/20', text: 'text-white' }
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: t(`weather.wmo${code}` as any), bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-300' }
  if (code === 85 || code === 86) return { emoji: '🌨️', label: t(`weather.wmo${code}` as any), bg: 'bg-white/12', border: 'border-white/25', text: 'text-white' }
  if (code === 95) return { emoji: '⛈️', label: t('weather.wmo95'), bg: 'bg-purple-500/12', border: 'border-purple-500/25', text: 'text-purple-300' }
  if (code === 96 || code === 99) return { emoji: '⛈️', label: t(`weather.wmo${code}` as any), bg: 'bg-purple-500/15', border: 'border-purple-500/30', text: 'text-purple-300' }
  return { emoji: '🌡️', label: t(`weather.wmo${code}` as any), bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-300' }
}

interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  weatherCode: number
  windSpeed: number
  windDirection: number
  isDay: boolean
}

export default function WeatherWidget({ compact }: { compact?: boolean }) {
  const settings = useShiftStore((s) => s.settings)
  const { t, language } = useT()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const hasCoords = settings.widgetLat != null && settings.widgetLon != null

  const fetchWeather = useCallback(async () => {
    if (!settings.widgetEnabled || !hasCoords) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${settings.widgetLat}&longitude=${settings.widgetLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto&forecast_days=1`
      )
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const c = data.current
      setWeather({
        temperature: Math.round(c.temperature_2m),
        feelsLike: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        weatherCode: c.weather_code,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        isDay: c.is_day === 1,
      })
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [settings.widgetEnabled, settings.widgetLat, settings.widgetLon, hasCoords])

  useEffect(() => {
    fetchWeather()
    if (!hasCoords) return
    const id = setInterval(fetchWeather, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchWeather, hasCoords])

  // Not enabled → render nothing
  if (!settings.widgetEnabled) return null

  // Enabled but no city selected → show setup prompt
  if (!hasCoords) {
    return (
      <div className={`fluent-card ${compact ? 'p-3' : 'p-5'} bg-slate-500/5 border border-white/5`}>
        <div className={`flex ${compact ? 'flex-col items-start gap-1' : 'items-center gap-3'}`}>
          <span className={compact ? 'text-lg' : 'text-2xl'}>🌤️</span>
          <div>
            <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-slate-300`}>{t('dashboardUI.weatherTitle')}</p>
            <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500 ${compact ? '' : 'mt-0.5'}`}>{t('dashboardUI.weatherSetup')}</p>
          </div>
        </div>
      </div>
    )
  }

  const night = weather ? !weather.isDay : isNight(new Date().getHours())
  const info = weather ? wmoCode(weather.weatherCode, night, t) : null

  function windDir(deg: number): string {
    const dirs = language === 'tr'
      ? ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']
      : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(deg / 45) % 8]
  }

  return (
    <div className={`fluent-card ${compact ? 'p-3' : 'p-5'} ${info?.bg ?? 'bg-slate-500/10'} border ${info?.border ?? 'border-slate-500/20'} relative overflow-hidden`}>
      {!compact && (
        <div className="absolute -top-6 -right-6 text-7xl opacity-10 select-none pointer-events-none">
          {info?.emoji ?? '🌡️'}
        </div>
      )}

      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className={`${compact ? 'text-[9px]' : 'text-xs'} uppercase tracking-widest text-slate-400 font-semibold`}>{t('dashboardUI.weatherHeader')}</span>
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="flex items-center justify-center w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200 transition-all text-[9px]"
          title={t('weather.refresh')}
        >
          {loading ? <span className="animate-spin">↻</span> : '↻'}
        </button>
      </div>

      {error && (
        <div className={`flex ${compact ? 'flex-col gap-0.5' : 'items-center gap-2'} py-2 relative z-10`}>
          <span className={compact ? 'text-sm' : 'text-lg'}>⚠️</span>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-400`}>{t('weather.error')}</p>
        </div>
      )}

      {!error && !weather && (
        <div className={`flex ${compact ? 'flex-col gap-0.5' : 'items-center gap-2'} py-2 relative z-10`}>
          <span className={`${compact ? 'text-sm' : 'text-lg'} animate-pulse`}>🌡️</span>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-500`}>{t('weather.loading')}</p>
        </div>
      )}

      {weather && info && (
        <div className="relative z-10">
          {compact ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{info.emoji}</span>
                <p className={`text-xl font-bold font-mono ${info.text}`}>{weather.temperature}°</p>
                <p className={`text-[10px] font-medium ${info.text}`}>{info.label}</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-white/5">
                <div className="text-center">
                  <p className="text-[8px] text-slate-500">{t('weather.humidity')}</p>
                  <p className="text-[10px] font-mono text-slate-300">%{weather.humidity}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-slate-500">{t('weather.precipitation')}</p>
                  <p className="text-[10px] font-mono text-slate-300">{weather.precipitation}mm</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-slate-500">{t('weather.wind')}</p>
                  <p className="text-[10px] font-mono text-slate-300">{weather.windSpeed} km/{windDir(weather.windDirection)}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-4xl leading-none">{info.emoji}</span>
                <div>
                  <p className={`text-3xl font-bold font-mono ${info.text}`}>{weather.temperature}°</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{t('weather.feelsLike')}: {weather.feelsLike}°C</p>
                </div>
              </div>
              <p className={`text-xs font-medium mt-2 ${info.text}`}>{info.label}</p>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">{t('weather.humidity')}</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">%{weather.humidity}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">{t('weather.precipitation')}</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">{weather.precipitation}mm</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">{t('weather.wind')}</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">{weather.windSpeed} km/{windDir(weather.windDirection)}</p>
                </div>
              </div>

              {settings.widgetCity && (
                <p className="text-[10px] text-slate-600 mt-2 text-right">
                  📍 {settings.widgetCity}{settings.widgetDistrict ? `, ${settings.widgetDistrict}` : ''}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
