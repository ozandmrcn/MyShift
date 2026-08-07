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
