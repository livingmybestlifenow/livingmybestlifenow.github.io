import { localDateKey } from './format'
import { DEFAULT_SETTINGS, type Equipment, type LiftSet, type Muscle, type Settings, type Unit } from './types'

export const LB_PER_KG = 2.2046226218
export const SECONDARY_CREDIT = 0.5

export function toUnit(weight: number, from: Unit, to: Unit): number {
  if (from === to) return weight
  return from === 'lb' ? weight / LB_PER_KG : weight * LB_PER_KG
}

/** Epley: weight × (1 + reps / 30). A single counts as the weight itself. */
export function epley(weight: number, reps: number): number | null {
  if (!(weight > 0) || !Number.isFinite(weight) || !Number.isFinite(reps)) return null
  const whole = Math.round(reps)
  if (Math.abs(reps - whole) > 1e-6 || whole < 1) return null
  if (whole === 1) return weight
  return weight * (1 + whole / 30)
}

export function e1rmInUnit(weight: number, from: Unit, reps: number, to: Unit): number | null {
  const value = epley(weight, reps)
  if (value == null) return null
  return toUnit(value, from, to)
}

export function e1rmKg(set: Pick<LiftSet, 'weight' | 'unit' | 'reps'>): number | null {
  return e1rmInUnit(set.weight, set.unit, set.reps, 'kg')
}

export type PrKind = 'none' | 'first' | 'record'

export function classifyPr(
  prior: LiftSet[],
  candidate: Pick<LiftSet, 'weight' | 'unit' | 'reps'>,
  displayUnit: Unit,
): { kind: PrKind; e1rm: number | null; previous: number | null } {
  const nextKg = e1rmKg(candidate)
  const e1rm = e1rmInUnit(candidate.weight, candidate.unit, candidate.reps, displayUnit)
  if (nextKg == null || e1rm == null) return { kind: 'none', e1rm: null, previous: null }
  let bestKg = -Infinity
  for (const set of prior) {
    const value = e1rmKg(set)
    if (value != null && value > bestKg) bestKg = value
  }
  if (bestKg === -Infinity) return { kind: 'first', e1rm, previous: null }
  const previous = toUnit(bestKg, 'kg', displayUnit)
  if (nextKg > bestKg + 1e-6) return { kind: 'record', e1rm, previous }
  return { kind: 'none', e1rm, previous }
}

export function prSetIds(sets: LiftSet[]): Set<string> {
  const best = new Map<string, number>()
  const ids = new Set<string>()
  const ordered = [...sets].sort(byTime)
  for (const set of ordered) {
    const value = e1rmKg(set)
    if (value == null) continue
    const prev = best.get(set.exerciseId)
    if (prev == null || value > prev + 1e-6) {
      ids.add(set.id)
      best.set(set.exerciseId, value)
    }
  }
  return ids
}

export function prCount(sets: LiftSet[]): number {
  return prSetIds(sets).size
}

export function stepWeight(value: number, step: number, direction: 1 | -1): number {
  if (!(step > 0) || !Number.isFinite(value)) return Math.max(0, value || 0)
  const current = Math.round(value * 100)
  const increment = Math.round(step * 100)
  if (increment <= 0) return Math.max(0, value)
  const onGrid = current % increment === 0
  let next = current
  if (direction > 0) next = onGrid ? current + increment : Math.ceil(current / increment) * increment
  else next = onGrid ? current - increment : Math.floor(current / increment) * increment
  if (next < 0) next = 0
  return next / 100
}

export function stepFor(equipment: Equipment, settings: Settings): number {
  if (settings.unit === 'kg') return equipment === 'dumbbell' ? settings.dumbbellStepKg : settings.plateStepKg
  return equipment === 'dumbbell' ? settings.dumbbellStepLb : settings.plateStepLb
}

export function cleanSettings(input: Partial<Settings> | null | undefined): Settings {
  const next: Settings = { ...DEFAULT_SETTINGS }
  if (!input) return next
  if (input.unit === 'lb' || input.unit === 'kg') next.unit = input.unit
  for (const key of ['plateStepLb', 'dumbbellStepLb', 'plateStepKg', 'dumbbellStepKg'] as const) {
    const value = input[key]
    if (typeof value === 'number' && value > 0 && value <= 100) next[key] = Math.round(value * 100) / 100
  }
  if (typeof input.restSeconds === 'number' && input.restSeconds >= 0 && input.restSeconds <= 600) {
    next.restSeconds = Math.round(input.restSeconds)
  }
  if (typeof input.stallSessions === 'number' && input.stallSessions >= 2 && input.stallSessions <= 12) {
    next.stallSessions = Math.round(input.stallSessions)
  }
  if (input.restAutoStart === true || input.restAutoStart === false) next.restAutoStart = input.restAutoStart
  if (input.chime === 'bell' || input.chime === 'soft' || input.chime === 'ding' || input.chime === 'glass') next.chime = input.chime
  if (input.muted === true || input.muted === false) next.muted = input.muted
  if (input.vibrate === true || input.vibrate === false) next.vibrate = input.vibrate
  if (input.setMilestoneChime === true || input.setMilestoneChime === false) next.setMilestoneChime = input.setMilestoneChime
  return next
}

export function exerciseOrder(planned: string[], sets: { exerciseId: string; order: number }[]): string[] {
  const ordered = [...planned]
  const sorted = [...sets].sort((a, b) => a.order - b.order)
  for (const set of sorted) {
    if (!ordered.includes(set.exerciseId)) ordered.push(set.exerciseId)
  }
  return ordered
}

export function moveItem(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction
  if (target < 0 || target >= ids.length) return ids
  const next = ids.slice()
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

type ClockWorkout = {
  startedAt: number
  finishedAt: number | null
  pausedMs?: number
  pausedAt?: number | null
}

function pausedMsAt(workout: ClockWorkout, now: number): number {
  const stored = workout.pausedMs ?? 0
  if (workout.pausedAt == null) return stored
  const end = workout.finishedAt ?? now
  return stored + Math.max(0, end - workout.pausedAt)
}

export function pausedSeconds(workout: ClockWorkout, now: number): number {
  return Math.max(0, Math.round(pausedMsAt(workout, now) / 1000))
}

export function workoutDurationSec(workout: ClockWorkout, now: number): number {
  const end = workout.finishedAt ?? now
  return Math.max(0, Math.round((end - workout.startedAt - pausedMsAt(workout, now)) / 1000))
}

export function activeSeconds(sets: { durationSec: number | null }[]): number {
  return sets.reduce((sum, set) => sum + (typeof set.durationSec === 'number' && set.durationSec > 0 ? set.durationSec : 0), 0)
}

export function restSeconds(totalSec: number, active: number): number {
  return Math.max(0, totalSec - active)
}

export function activePercent(totalSec: number, active: number): number | null {
  if (!(totalSec > 0)) return null
  return Math.min(100, Math.round((active / totalSec) * 100))
}

export type SessionPeak = { workoutId: string; at: number; e1rm: number }

export function sessionPeaks(
  sets: LiftSet[],
  exerciseId: string,
  unit: Unit,
  workouts: { id: string; startedAt: number }[],
): SessionPeak[] {
  const started = new Map(workouts.map((workout) => [workout.id, workout.startedAt]))
  const grouped = new Map<string, number>()
  for (const set of sets) {
    if (set.exerciseId !== exerciseId) continue
    const value = e1rmInUnit(set.weight, set.unit, set.reps, unit)
    if (value == null) continue
    const current = grouped.get(set.workoutId)
    if (current == null || value > current) grouped.set(set.workoutId, value)
  }
  return [...grouped.entries()]
    .map(([workoutId, e1rm]) => ({ workoutId, e1rm, at: started.get(workoutId) ?? 0 }))
    .sort((a, b) => a.at - b.at || a.workoutId.localeCompare(b.workoutId))
}

/** Latest session peak is not above the oldest peak in a window of n sessions. */
export function isStalled(peaks: number[], sessions: number): boolean {
  if (sessions < 2 || peaks.length < sessions) return false
  const window = peaks.slice(-sessions)
  return window[window.length - 1] <= window[0] + 1e-9
}

export function weekRange(now: Date): { start: number; end: number } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start: start.getTime(), end: end.getTime() }
}

export function setVolume(set: Pick<LiftSet, 'weight' | 'unit' | 'reps'>, unit: Unit): number {
  if (!(set.weight > 0) || !(set.reps > 0)) return 0
  return toUnit(set.weight, set.unit, unit) * set.reps
}

export function volumeBetween(sets: LiftSet[], unit: Unit, start: number, end: number): number {
  let total = 0
  for (const set of sets) {
    if (set.createdAt < start || set.createdAt >= end) continue
    total += setVolume(set, unit)
  }
  return total
}

export type MuscleCredit = { muscle: Muscle; volume: number }

export function muscleCredit(
  sets: LiftSet[],
  exercises: { id: string; primary: Muscle; secondary: Muscle[] }[],
  unit: Unit,
  start: number,
  end: number,
): MuscleCredit[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const totals = new Map<Muscle, number>()
  for (const set of sets) {
    if (set.createdAt < start || set.createdAt >= end) continue
    const volume = setVolume(set, unit)
    if (!(volume > 0)) continue
    const exercise = byId.get(set.exerciseId)
    if (!exercise) continue
    totals.set(exercise.primary, (totals.get(exercise.primary) ?? 0) + volume)
    const seen = new Set<Muscle>([exercise.primary])
    for (const muscle of exercise.secondary) {
      if (seen.has(muscle)) continue
      seen.add(muscle)
      totals.set(muscle, (totals.get(muscle) ?? 0) + volume * SECONDARY_CREDIT)
    }
  }
  return [...totals.entries()]
    .map(([muscle, volume]) => ({ muscle, volume }))
    .sort((a, b) => b.volume - a.volume || a.muscle.localeCompare(b.muscle))
}

export function trainingStreak(dayKeys: Iterable<string>, today: Date): number {
  const days = new Set(dayKeys)
  const cursor = new Date(today)
  cursor.setHours(12, 0, 0, 0)
  const todayKey = localDateKey(cursor.getTime())
  const yesterday = new Date(cursor)
  yesterday.setDate(yesterday.getDate() - 1)
  if (!days.has(todayKey) && !days.has(localDateKey(yesterday.getTime()))) return 0
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (days.has(localDateKey(cursor.getTime()))) {
    count += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

export function previousSessionSets(sets: LiftSet[], exerciseId: string, currentWorkoutId: string): LiftSet[] {
  const prior = sets
    .filter((set) => set.exerciseId === exerciseId && set.workoutId !== currentWorkoutId)
    .sort(byTime)
  const last = prior[prior.length - 1]
  if (!last) return []
  return prior.filter((set) => set.workoutId === last.workoutId)
}

export function activeWorkout<T extends { finishedAt: number | null; startedAt: number }>(workouts: T[]): T | null {
  const open = workouts.filter((workout) => workout.finishedAt == null)
  open.sort((a, b) => b.startedAt - a.startedAt)
  return open[0] ?? null
}

function byTime(a: LiftSet, b: LiftSet): number {
  return a.createdAt - b.createdAt || a.order - b.order || a.id.localeCompare(b.id)
}
