import { fileStamp, localStamp } from './format'
import { e1rmInUnit, setVolume, toUnit } from './logic'
import { equipmentLabel, muscleLabel, type Exercise, type LiftSet, type SetupNote, type Unit, type Workout } from './types'

function cell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function setsToCsv(
  sets: LiftSet[],
  workouts: Workout[],
  exercises: Exercise[],
  notes: SetupNote[],
  displayUnit: Unit,
): string {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]))
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const noteById = new Map(notes.map((note) => [note.exerciseId, note.text]))
  const header = [
    'date',
    'workout',
    'exercise',
    'equipment',
    'primary',
    'secondary',
    'weight',
    'unit',
    'reps',
    'e1rm',
    'e1rm_unit',
    'volume',
    'setup',
    'set_id',
    'workout_id',
    'exercise_id',
    'logged_weight',
    'logged_unit',
  ]
  const lines = [header.join(',')]
  const ordered = [...sets].sort((a, b) => a.createdAt - b.createdAt || a.order - b.order)
  for (const set of ordered) {
    const exercise = exerciseById.get(set.exerciseId)
    const workout = workoutById.get(set.workoutId)
    const e1rm = e1rmInUnit(set.weight, set.unit, set.reps, displayUnit)
    const weight = Math.round(toUnit(set.weight, set.unit, displayUnit) * 10) / 10
    lines.push(
      [
        localStamp(set.createdAt),
        workout?.name ?? '',
        exercise?.name ?? '',
        exercise ? equipmentLabel(exercise.equipment) : '',
        exercise ? muscleLabel(exercise.primary) : '',
        exercise ? exercise.secondary.map(muscleLabel).join('|') : '',
        String(weight),
        displayUnit,
        String(set.reps),
        e1rm == null ? '' : String(Math.round(e1rm * 10) / 10),
        e1rm == null ? '' : displayUnit,
        String(Math.round(setVolume(set, displayUnit) * 10) / 10),
        noteById.get(set.exerciseId) ?? '',
        set.id,
        set.workoutId,
        set.exerciseId,
        String(set.weight),
        set.unit,
      ]
        .map(cell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function csvFilename(date = new Date()): string {
  return `musclejot-sets-${fileStamp(date)}.csv`
}
