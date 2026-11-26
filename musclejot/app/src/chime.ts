import type { ChimeId } from './types'

type Tone = { freq: number; at: number; dur: number; gain: number }

const CHIME_TONES: Record<ChimeId, Tone[]> = {
  bell: [
    { freq: 523.25, at: 0, dur: 0.85, gain: 0.07 },
    { freq: 784, at: 0, dur: 0.6, gain: 0.028 },
  ],
  soft: [
    { freq: 392, at: 0, dur: 0.4, gain: 0.055 },
    { freq: 523.25, at: 0.14, dur: 0.5, gain: 0.045 },
  ],
  ding: [{ freq: 880, at: 0, dur: 0.38, gain: 0.06 }],
  glass: [
    { freq: 1174.66, at: 0, dur: 0.7, gain: 0.035 },
    { freq: 1567.98, at: 0.02, dur: 0.5, gain: 0.018 },
  ],
}

let audio: AudioContext | null = null

function context(): AudioContext | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audio) audio = new Ctx()
  return audio
}

export function unlockAudio(): void {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

export function playChime(id: ChimeId, quiet = false): void {
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(quiet ? 0.45 : 1, now)
    master.connect(ctx.destination)
    for (const tone of CHIME_TONES[id]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(tone.freq, now)
      const start = now + tone.at
      const peak = Math.max(0.0001, tone.gain)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + tone.dur + 0.02)
    }
  } catch {
    /* a missing audio device should not block the log */
  }
}

export function pulseVibrate(): void {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate([28, 50, 28])
  } catch {
    /* vibration is optional */
  }
}
