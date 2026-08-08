import { useRef, useState } from 'react'
import { Activity } from '../stores/useShiftStore'
import { timeToSeconds, secondsToHHMM } from '../hooks/useLiveShiftEngine'
import { getColors } from './Dashboard'

const PX_PER_HOUR = 64
const HOURS = 24
const GUTTER = 42
const DAY_PX = HOURS * PX_PER_HOUR
const SNAP = 5 * 60

interface VisualTimelineProps {
  activities: Activity[]
  onChange: (activities: Activity[]) => void
  onEdit: (act: Activity) => void
}

type DragMode = 'move' | 'left' | 'right'

export default function VisualTimeline({ activities, onChange, onEdit }: VisualTimelineProps) {
  const [drag, setDrag] = useState<{ id: string; mode: DragMode; startX: number; origStart: number; origEnd: number } | null>(null)
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null)
  const didDragRef = useRef(false)

  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))

  const beginDrag = (e: React.PointerEvent, act: Activity, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    didDragRef.current = false
    setDrag({
      id: act.id,
      mode,
      startX: e.clientX,
      origStart: timeToSeconds(`${act.startTime}:00`),
      origEnd: timeToSeconds(`${act.endTime}:00`)
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dxPx = e.clientX - drag.startX
    const dxSec = Math.round((dxPx / PX_PER_HOUR) * 3600 / SNAP) * SNAP

    const idx = sorted.findIndex(a => a.id === drag.id)
    const prevEnd = idx > 0 ? timeToSeconds(`${sorted[idx - 1].endTime}:00`) : 0
    const nextStart = idx < sorted.length - 1 ? timeToSeconds(`${sorted[idx + 1].startTime}:00`) : HOURS * 3600

    const dur = drag.origEnd - drag.origStart
    let newStart = drag.origStart
    let newEnd = drag.origEnd

    if (drag.mode === 'move') {
      newStart = drag.origStart + dxSec
      newStart = Math.max(0, Math.min(newStart, nextStart - dur))
      newStart = Math.max(prevEnd, newStart)
      newEnd = newStart + dur
    } else if (drag.mode === 'right') {
      newEnd = drag.origEnd + dxSec
      newEnd = Math.max(newStart + SNAP, Math.min(newEnd, nextStart))
    } else {
      newStart = drag.origStart + dxSec
      newStart = Math.max(prevEnd, Math.min(newStart, newEnd - SNAP))
    }

    if (newStart !== preview?.start || newEnd !== preview?.end) {
      didDragRef.current = true
    }
    setPreview({ start: newStart, end: newEnd })
  }

  const endDrag = () => {
    if (drag && preview) {
      const idx = sorted.findIndex(a => a.id === drag.id)
      if (idx >= 0) {
        const act = sorted[idx]
        const updated = [...sorted]
        updated[idx] = {
          ...act,
          startTime: secondsToHHMM(preview.start),
          endTime: secondsToHHMM(preview.end),
          duration: Math.max(5, Math.round((preview.end - preview.start) / 60))
        }
        onChange(updated.sort((a, b) => a.startTime.localeCompare(b.startTime)))
      }
    }
    setDrag(null)
    setPreview(null)
  }

  const handleClick = (act: Activity) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    onEdit(act)
  }

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 overflow-x-auto select-none">
      <div style={{ width: GUTTER + DAY_PX }}>
        <div className="flex">
          <div style={{ width: GUTTER }} />
          {Array.from({ length: HOURS }).map((_, h) => (
            <div
              key={h}
              className="text-[9px] text-slate-600 font-mono text-center leading-none pt-1.5"
              style={{ width: PX_PER_HOUR }}
            >
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="flex flex-col" style={{ width: GUTTER }}>
            {Array.from({ length: HOURS }).map((_, h) => (
              <div
                key={h}
                className="text-[9px] text-slate-700 font-mono flex items-start justify-end pr-1 leading-none"
                style={{ height: PX_PER_HOUR }}
              >
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>

          <div
            className="relative touch-none"
            style={{ width: DAY_PX, height: 96 }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {Array.from({ length: HOURS + 1 }).map((_, h) => (
              <div
                key={h}
                className="absolute top-0 bottom-0 border-l border-white/5"
                style={{ left: h * PX_PER_HOUR }}
              />
            ))}

            {sorted.map(act => {
              const colors = getColors(act.color)
              const isDragging = drag?.id === act.id && preview
              const start = timeToSeconds(`${act.startTime}:00`)
              const end = timeToSeconds(`${act.endTime}:00`)
              const left = isDragging ? (preview.start / 3600) * PX_PER_HOUR : (start / 3600) * PX_PER_HOUR
              const width = isDragging
                ? ((preview.end - preview.start) / 3600) * PX_PER_HOUR
                : Math.max(14, ((Math.max(0, end - start)) / 3600) * PX_PER_HOUR)

              return (
                <div
                  key={act.id}
                  className="absolute"
                  style={{ left, top: 16, width: Math.max(width, 28), height: 60 }}
                >
                  <div
                    className={`absolute inset-0 flex items-center gap-1.5 rounded-lg border pl-2 pr-1 overflow-hidden ${colors.bg} ${colors.border} cursor-move hover:brightness-110`}
                    title={`${act.name} — sürükleyerek taşı, kenarlarından sürükleyerek boyutlandır, tıklayarak düzenle`}
                    onPointerDown={e => beginDrag(e, act, 'move')}
                    onClick={() => handleClick(act)}
                  >
                    <div className={`w-1 h-6 rounded-full flex-shrink-0 ${colors.raw}`} />
                    <span className="text-sm flex-shrink-0 leading-none">{act.icon}</span>
                    <span className="text-[10px] font-semibold truncate text-slate-100">{act.name}</span>
                    <span className={`text-[9px] font-mono flex-shrink-0 ${colors.text}`}>
                      {secondsToHHMM(start)}–{secondsToHHMM(end)}
                    </span>
                  </div>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-l-lg"
                    title="Sol kenardan boyutlandır"
                    onPointerDown={e => beginDrag(e, act, 'left')}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r-lg"
                    title="Sağ kenardan boyutlandır"
                    onPointerDown={e => beginDrag(e, act, 'right')}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
