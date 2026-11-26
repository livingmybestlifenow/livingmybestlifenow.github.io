import { describe, expect, it } from 'vitest'
import { csvFilename, setsToCsv } from './csv'
import { formatClock, formatNumber, parseReps, parseWeight } from './format'
import {
  classifyPr,
  cleanSettings,
  epley,
  isStalled,
  muscleCredit,
  prCount,
  previousSessionSets,
  sessionPeaks,
  stepFor,
  stepWeight,
  toUnit,
  trainingStreak,
  volumeBetween,
  weekRange,
} from './logic'
import { DEFAULT_SETTINGS, type Exercise, type LiftSet, type Workout } from './types'

function set(partial: Partial<LiftSet> & Pick<LiftSet, 'id' | 'exerciseId' | 'weight' | 'reps'>): LiftSet {
  return {
    workoutId: partial.workoutId ?? 'w',
    unit: partial.unit ?? 'lb',
    createdAt: partial.createdAt ?? 1,
    order: partial.order ?? 1,
    ...partial,
  }
}

describe('epley', () => {
  it('uses weight × (1 + reps / 30) and treats a single as the weight', () => {
    expect(epley(100, 5)).toBeCloseTo(116.6666, 3)
    expect(epley(100, 1)).toBe(100)
    expect(epley(0, 5)).toBeNull()
    expect(epley(100, 0)).toBeNull()
  })

  it('converts pounds and kilograms', () => {
    expect(toUnit(100, 'lb', 'kg')).toBeCloseTo(45.3592, 3)
    expect(toUnit(toUnit(80, 'kg', 'lb'), 'lb', 'kg')).toBeCloseTo(80, 6)
  })
})

describe('personal records', () => {
  it('celebrates only a heavier estimated 1RM', () => {
    const first = set({ id: 'a', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: 1 })
    expect(classifyPr([], first, 'lb').kind).toBe('first')
    expect(classifyPr([first], { weight: 110, unit: 'lb', reps: 5 }, 'lb')).toMatchObject({
      kind: 'record',
      previous: expect.closeTo(116.666, 2),
    })
    expect(classifyPr([first], { weight: 100, unit: 'lb', reps: 5 }, 'lb').kind).toBe('none')
    expect(classifyPr([set({ id: 'b', exerciseId: 'ex-bench', weight: 110, reps: 5 })], { weight: 100, unit: 'lb', reps: 5 }, 'lb').kind).toBe(
      'none',
    )
  })

  it('counts each new best, including the first record', () => {
    const sets = [
      set({ id: 'a', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: 1 }),
      set({ id: 'b', exerciseId: 'ex-bench', weight: 110, reps: 5, createdAt: 2 }),
      set({ id: 'c', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: 3 }),
      set({ id: 'd', exerciseId: 'ex-squat', weight: 200, reps: 5, createdAt: 4 }),
    ]
    expect(prCount(sets)).toBe(3)
  })
})

describe('increment steps', () => {
  it('steps on the plate or dumbbell grid and never below zero', () => {
    expect(stepWeight(0, 2.5, 1)).toBe(2.5)
    expect(stepWeight(2.5, 2.5, 1)).toBe(5)
    expect(stepWeight(3, 2.5, 1)).toBe(5)
    expect(stepWeight(3, 2.5, -1)).toBe(2.5)
    expect(stepWeight(0, 5, -1)).toBe(0)
    expect(stepWeight(100, 5, 1)).toBe(105)
    expect(stepWeight(0.1 + 0.2, 0.1, 1)).toBeCloseTo(0.4, 5)
  })

  it('uses the dumbbell increment only for dumbbells', () => {
    const settings = { ...DEFAULT_SETTINGS, plateStepLb: 2.5, dumbbellStepLb: 5 }
    expect(stepFor('barbell', settings)).toBe(2.5)
    expect(stepFor('machine', settings)).toBe(2.5)
    expect(stepFor('dumbbell', settings)).toBe(5)
    expect(stepFor('dumbbell', { ...settings, unit: 'kg' })).toBe(2.5)
  })

  it('rejects a zero increment and keeps the default', () => {
    expect(cleanSettings({ plateStepLb: 0, stallSessions: 3, unit: 'kg' })).toMatchObject({
      plateStepLb: 5,
      stallSessions: 3,
      unit: 'kg',
    })
  })
})

describe('stall radar', () => {
  it('flags a lift whose latest peak is not above the start of the window', () => {
    expect(isStalled([100, 100, 100], 3)).toBe(true)
    expect(isStalled([110, 110, 110], 3)).toBe(true)
    expect(isStalled([100, 110, 110], 3)).toBe(false)
    expect(isStalled([100, 110], 3)).toBe(false)
    expect(isStalled([100, 90], 2)).toBe(true)
  })

  it('builds one peak per session', () => {
    const sets = [
      set({ id: '1', workoutId: 'a', exerciseId: 'ex-squat', weight: 200, reps: 5, createdAt: 10 }),
      set({ id: '2', workoutId: 'a', exerciseId: 'ex-squat', weight: 180, reps: 8, createdAt: 11 }),
      set({ id: '3', workoutId: 'b', exerciseId: 'ex-squat', weight: 185, reps: 5, createdAt: 20 }),
    ]
    const peaks = sessionPeaks(sets, 'ex-squat', 'lb', [
      { id: 'a', startedAt: 1 },
      { id: 'b', startedAt: 2 },
    ])
    expect(peaks).toHaveLength(2)
    expect(peaks[0].e1rm).toBeGreaterThan(peaks[1].e1rm)
    expect(isStalled(peaks.map((peak) => peak.e1rm), 2)).toBe(true)
  })
})

describe('volume and streaks', () => {
  const bench: Exercise = {
    id: 'ex-bench',
    name: 'Bench press',
    equipment: 'barbell',
    primary: 'chest',
    secondary: ['triceps', 'shoulders'],
    custom: false,
    archived: false,
    createdAt: 0,
  }

  it('gives primary muscles full credit and secondary muscles half', () => {
    const thursday = new Date(2026, 10, 26, 15, 0, 0)
    const range = weekRange(thursday)
    expect(new Date(range.start).getDay()).toBe(1)
    const inside = new Date(2026, 10, 24, 12).getTime()
    const outside = new Date(2026, 10, 22, 12).getTime()
    const sets = [
      set({ id: 'in', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: inside }),
      set({ id: 'out', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: outside }),
    ]
    expect(volumeBetween(sets, 'lb', range.start, range.end)).toBe(500)
    const credit = muscleCredit(sets, [bench], 'lb', range.start, range.end)
    expect(credit.find((row) => row.muscle === 'chest')?.volume).toBe(500)
    expect(credit.find((row) => row.muscle === 'triceps')?.volume).toBe(250)
    expect(credit.find((row) => row.muscle === 'shoulders')?.volume).toBe(250)
  })

  it('counts consecutive training days through today or yesterday', () => {
    const today = new Date(2026, 10, 26, 15)
    expect(trainingStreak(['2026-11-26', '2026-11-25'], today)).toBe(2)
    expect(trainingStreak(['2026-11-25'], today)).toBe(1)
    expect(trainingStreak(['2026-11-26'], today)).toBe(1)
    expect(trainingStreak(['2026-11-23'], today)).toBe(0)
  })

  it('recalls only the previous session for that lift', () => {
    const sets = [
      set({ id: '1', workoutId: 'old', exerciseId: 'ex-bench', weight: 95, reps: 5, createdAt: 1 }),
      set({ id: '2', workoutId: 'last', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: 2 }),
      set({ id: '3', workoutId: 'last', exerciseId: 'ex-bench', weight: 100, reps: 3, createdAt: 3 }),
      set({ id: '4', workoutId: 'now', exerciseId: 'ex-bench', weight: 110, reps: 5, createdAt: 4 }),
    ]
    const recalled = previousSessionSets(sets, 'ex-bench', 'now')
    expect(recalled.map((row) => row.id)).toEqual(['2', '3'])
  })
})

describe('csv', () => {
  it('prefixes the filename with musclejot- and escapes commas', () => {
    expect(csvFilename(new Date(2026, 10, 26, 9, 5))).toBe('musclejot-sets-20261126-0905.csv')
    const workout: Workout = {
      id: 'w1',
      name: 'Push, day',
      startedAt: 1,
      finishedAt: 2,
      routineId: null,
      plannedExerciseIds: [],
      restEndsAt: null,
      updatedAt: 2,
    }
    const exercise: Exercise = {
      id: 'ex-bench',
      name: 'Bench "press"',
      equipment: 'barbell',
      primary: 'chest',
      secondary: ['triceps'],
      custom: false,
      archived: false,
      createdAt: 0,
    }
    const csv = setsToCsv(
      [set({ id: 's1', workoutId: 'w1', exerciseId: 'ex-bench', weight: 100, reps: 5, createdAt: Date.UTC(2026, 10, 26) })],
      [workout],
      [exercise],
      [{ exerciseId: 'ex-bench', text: 'Seat 4', updatedAt: 1 }],
      'lb',
    )
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('weight,unit,reps,e1rm')
    expect(csv).toContain('"Push, day"')
    expect(csv).toContain('"Bench ""press"""')
    expect(csv).toContain('Seat 4')
    expect(csv).toContain('100,lb,5')
  })
})

describe('input parsing', () => {
  it('accepts a plate weight and whole reps', () => {
    expect(parseWeight('135')).toBe(135)
    expect(parseWeight('2.5')).toBe(2.5)
    expect(parseWeight('-1')).toBeNull()
    expect(parseReps('5')).toBe(5)
    expect(parseReps('5.5')).toBeNull()
    expect(formatNumber(116.666)).toBe('116.7')
    expect(formatClock(90_000)).toBe('1:30')
    expect(formatClock(0)).toBe('0:00')
  })
})
