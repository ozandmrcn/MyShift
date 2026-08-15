import { useEffect, useRef, useState } from 'react'

interface TypewriterTextProps {
  text: string
  baseColor: string
  highlight: string | null
  highlightColor?: string
}

const BURST_MS = 640

// Old comment bursts away: every letter becomes a particle that shoots outward,
// spins and fades to nothing before the new comment starts typing.
function BurstParticles({ text, baseColor }: { text: string; baseColor: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('[data-burst]'))) {
      const angle = Math.random() * Math.PI * 2
      const dist = 35 + Math.random() * 75
      const rot = (Math.random() - 0.5) * 280
      const dx = (Math.cos(angle) * dist).toFixed(1)
      const dy = (Math.sin(angle) * dist).toFixed(1)
      c.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot.toFixed(1)}deg)`, opacity: 0 }
        ],
        { duration: BURST_MS + Math.random() * 160, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' }
      )
    }
  }, [])
  return (
    <span ref={ref} className={`${baseColor} pointer-events-none select-none`} aria-hidden>
      {Array.from(text).map((ch, i) => (
        <span key={i} data-burst className="inline-block will-change-transform">
          {ch}
        </span>
      ))}
    </span>
  )
}

// New comment types out letter-by-letter with a small blinking caret.
function TypedComment({
  text,
  baseColor,
  highlight,
  highlightColor
}: {
  text: string
  baseColor: string
  highlight: string | null
  highlightColor: string
}) {
  const [count, setCount] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setCount(0)
    const chars = [...text]
    if (chars.length === 0) return
    let i = 0
    const tick = () => {
      i++
      setCount(i)
      if (i < chars.length) {
        timerRef.current = window.setTimeout(tick, 14 + Math.random() * 20)
      }
    }
    timerRef.current = window.setTimeout(tick, 40)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [text])

  const visible = [...text].slice(0, count).join('')
  const typing = count < text.length

  const renderVisible = () => {
    if (!highlight || !visible.includes(highlight)) return <>{visible}</>
    const idx = visible.indexOf(highlight)
    const before = visible.slice(0, idx)
    const hl = visible.slice(idx, idx + highlight.length)
    const after = visible.slice(idx + highlight.length)
    return (
      <>
        {before}
        <span className={`${highlightColor} font-semibold`}>{hl}</span>
        {after}
      </>
    )
  }

  return (
    <span className={baseColor}>
      {renderVisible()}
      {typing && <span className="inline-block w-px h-3 bg-slate-500/70 ml-0.5 align-middle animate-pulse" />}
    </span>
  )
}

// Renders a comment under the clock. When a new comment arrives the current one
// bursts into particles (BurstParticles), then the new text types itself in.
export default function TypewriterText({ text, baseColor, highlight, highlightColor = 'text-violet-300' }: TypewriterTextProps) {
  const [burstText, setBurstText] = useState('')
  const prevRef = useRef(text)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (text === prevRef.current) return
    const old = prevRef.current
    prevRef.current = text
    setBurstText(old)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setBurstText(''), BURST_MS + 40)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [text])

  if (burstText) {
    // key forces a fresh mount so the burst animation replays for each comment.
    return <BurstParticles key={burstText} text={burstText} baseColor={baseColor} />
  }
  return <TypedComment text={text} baseColor={baseColor} highlight={highlight} highlightColor={highlightColor} />
}
