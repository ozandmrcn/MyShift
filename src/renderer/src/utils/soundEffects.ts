// Web Audio API Sound Synthesizer for custom notification sounds without external assets
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export function playSound(type: string): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    if (type === 'none') return

    if (type === 'digital') {
      // Short double beep
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(880, now) // A5
      osc.frequency.setValueAtTime(880, now + 0.08)
      osc.frequency.setValueAtTime(1200, now + 0.1) // Higher pitch
      
      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.25)
    } 
    else if (type === 'bell') {
      // Long fading warm bell tone
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now) // D5
      
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(880, now) // A5 (Overtones)
      
      gain.gain.setValueAtTime(0.1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
      
      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)
      
      osc1.start(now)
      osc2.start(now)
      
      osc1.stop(now + 1.2)
      osc2.stop(now + 1.2)
    }
    else if (type === 'soft') {
      // Gentle two-note chime — calm and pleasant
      const notes = [
        { f: 783.99, t: 0 },      // G5
        { f: 987.77, t: 0.15 },   // B5
      ]
      for (const n of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(n.f, now + n.t)
        gain.gain.setValueAtTime(0.07, now + n.t)
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + 0.6)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + n.t)
        osc.stop(now + n.t + 0.65)
      }
    }
    else if (type === 'elegant') {
      // Rich three-note descending — premium feel
      const notes = [
        { f: 1046.5, t: 0 },      // C6
        { f: 783.99, t: 0.18 },   // G5
        { f: 659.25, t: 0.36 },   // E5
      ]
      for (const n of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(n.f, now + n.t)
        gain.gain.setValueAtTime(0.09, now + n.t)
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + 0.8)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + n.t)
        osc.stop(now + n.t + 0.85)
      }
    }
    else if (type === 'urgent') {
      // Quick repeating double-beep — attention grabber
      for (let i = 0; i < 2; i++) {
        const offset = i * 0.3
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(1046.5, now + offset)       // C6
        osc.frequency.setValueAtTime(1046.5, now + offset + 0.06)
        osc.frequency.setValueAtTime(1318.5, now + offset + 0.08) // E6
        gain.gain.setValueAtTime(0.04, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.25)
      }
    }
    else if (type === 'minimal') {
      // Single soft click — ultra-minimal
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08)
      gain.gain.setValueAtTime(0.06, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.12)
    }
    else {
      // 'default' - Three-tone rising chime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc.type = 'sine'
      // Rising notes: C5 (523Hz), E5 (659Hz), G5 (784Hz)
      osc.frequency.setValueAtTime(523.25, now)
      osc.frequency.setValueAtTime(659.25, now + 0.12)
      osc.frequency.setValueAtTime(783.99, now + 0.24)
      
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.setValueAtTime(0.08, now + 0.24)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
      
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.5)
    }
  } catch (error) {
    console.error('Audio synthesizer error:', error)
  }
}

// Distinct "ding-dong" for pay-mode break reminders — deliberately different from
// the default chime, the bell and the digital beep so it reads as an alert.
export function playReminderSound(): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    const notes = [
      { f: 1046.5, at: 0 },    // C6
      { f: 783.99, at: 0.4 }   // G5
    ]
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(n.f, now + n.at)
      gain.gain.setValueAtTime(0.12, now + n.at)
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.at + 0.9)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + n.at)
      osc.stop(now + n.at + 0.95)
    }
  } catch (error) {
    console.error('Audio synthesizer error:', error)
  }
}
