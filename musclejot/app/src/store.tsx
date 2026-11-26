import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createContext, useContext } from 'react'
import {
  deleteEverything,
  deleteRoutine as deleteRoutineRow,
  deleteSet as deleteSetRow,
  deleteWorkout as deleteWorkoutRow,
  loadAll,
  patchWorkout,
  putExercise,
  putNote,
  putRoutine,
  putSetAndWorkout,
  putSettings,
  putWorkout,
  setLastExportAt,
  storagePersisted,
  storageUsageLabel,
} from './db'
import { activeWorkout, classifyPr, cleanSettings, type PrKind } from './logic'
import type { Exercise, LiftSet, Routine, Settings, SetupNote, Workout } from './types'

export type LogResult = {
  set: LiftSet
  kind: PrKind
  e1rm: number | null
  previous: number | null
}

type StoreValue = {
  ready: boolean
  error: string | null
  exercises: Exercise[]
  workouts: Workout[]
  sets: LiftSet[]
  routines: Routine[]
  notes: SetupNote[]
  settings: Settings
  persistent: boolean | null
  usageLabel: string | null
  lastExportAt: number | null
  reload: () => Promise<void>
  startWorkout: (input: { name: string; routineId: string | null; plannedExerciseIds: string[] }) => Promise<Workout>
  updateWorkout: (id: string, patch: Partial<Workout>) => Promise<void>
  finishWorkout: (id: string) => Promise<void>
  deleteWorkout: (id: string) => Promise<void>
  logSet: (input: { workoutId: string; exerciseId: string; weight: number; reps: number }) => Promise<LogResult>
  deleteSet: (id: string) => Promise<void>
  saveExercise: (exercise: Exercise) => Promise<void>
  saveRoutine: (routine: Routine) => Promise<void>
  deleteRoutine: (id: string) => Promise<void>
  saveNote: (exerciseId: string, text: string) => Promise<void>
  saveSettings: (settings: Settings) => Promise<void>
  markExported: () => Promise<void>
  wipe: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<LiftSet[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [notes, setNotes] = useState<SetupNote[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const [usageLabel, setUsageLabel] = useState<string | null>(null)
  const [lastExportAt, setExported] = useState<number | null>(null)
  const queue = useRef(Promise.resolve())
  const setsRef = useRef(sets)
  const workoutsRef = useRef(workouts)
  const settingsRef = useRef(settings)
  setsRef.current = sets
  workoutsRef.current = workouts
  settingsRef.current = settings

  const apply = useCallback((snapshot: Awaited<ReturnType<typeof loadAll>>) => {
    setExercises(snapshot.exercises)
    setWorkouts(snapshot.workouts)
    setSets(snapshot.sets)
    setRoutines(snapshot.routines)
    setNotes(snapshot.notes)
    setSettings(snapshot.settings)
    setExported(snapshot.lastExportAt)
  }, [])

  const reload = useCallback(async () => {
    const [snapshot, persisted, usage] = await Promise.all([loadAll(), storagePersisted(), storageUsageLabel()])
    apply(snapshot)
    setPersistent(persisted)
    setUsageLabel(usage)
    setError(null)
    setReady(true)
  }, [apply])

  useEffect(() => {
    let cancelled = false
    reload().catch((caught: unknown) => {
      if (cancelled) return
      setError(caught instanceof Error ? caught.message : 'The workout log could not be opened.')
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.current.then(task, task)
    queue.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const startWorkout = useCallback(
    (input: { name: string; routineId: string | null; plannedExerciseIds: string[] }) =>
      enqueue(async () => {
        const now = Date.now()
        const workout: Workout = {
          id: crypto.randomUUID(),
          name: input.name.trim().slice(0, 80) || 'Workout',
          startedAt: now,
          finishedAt: null,
          routineId: input.routineId,
          plannedExerciseIds: input.plannedExerciseIds,
          restEndsAt: null,
          updatedAt: now,
        }
        await putWorkout(workout)
        setWorkouts((current) => [workout, ...current])
        return workout
      }),
    [],
  )

  const updateWorkout = useCallback(
    (id: string, patch: Partial<Workout>) =>
      enqueue(async () => {
        const next = await patchWorkout(id, patch)
        setWorkouts((current) => current.map((workout) => (workout.id === id ? next : workout)))
      }),
    [],
  )

  const finishWorkout = useCallback(
    (id: string) =>
      enqueue(async () => {
        const next = await patchWorkout(id, { finishedAt: Date.now(), restEndsAt: null })
        setWorkouts((current) => current.map((workout) => (workout.id === id ? next : workout)))
      }),
    [],
  )

  const deleteWorkout = useCallback(
    (id: string) =>
      enqueue(async () => {
        await deleteWorkoutRow(id)
        setWorkouts((current) => current.filter((workout) => workout.id !== id))
        setSets((current) => current.filter((row) => row.workoutId !== id))
      }),
    [],
  )

  const logSet = useCallback(
    (input: { workoutId: string; exerciseId: string; weight: number; reps: number }) =>
      enqueue(async () => {
        const currentSets = setsRef.current
        const currentSettings = settingsRef.current
        const unit = currentSettings?.unit ?? 'lb'
        const prior = currentSets.filter((row) => row.exerciseId === input.exerciseId)
        const judged = classifyPr(prior, { weight: input.weight, unit, reps: input.reps }, unit)
        const order = currentSets.filter((row) => row.workoutId === input.workoutId).length + 1
        const now = Date.now()
        const row: LiftSet = {
          id: crypto.randomUUID(),
          workoutId: input.workoutId,
          exerciseId: input.exerciseId,
          weight: input.weight,
          unit,
          reps: input.reps,
          createdAt: now,
          order,
        }
        const workout = workoutsRef.current.find((item) => item.id === input.workoutId)
        const planned = workout?.plannedExerciseIds.includes(input.exerciseId)
          ? workout.plannedExerciseIds
          : [...(workout?.plannedExerciseIds ?? []), input.exerciseId]
        const restEndsAt = currentSettings && currentSettings.restSeconds > 0 ? now + currentSettings.restSeconds * 1000 : null
        const saved = await putSetAndWorkout(row, input.workoutId, { restEndsAt, plannedExerciseIds: planned })
        const nextSets = [...setsRef.current, row]
        setsRef.current = nextSets
        workoutsRef.current = workoutsRef.current.map((item) => (item.id === input.workoutId ? saved : item))
        setSets(nextSets)
        setWorkouts(workoutsRef.current)
        return { set: row, kind: judged.kind, e1rm: judged.e1rm, previous: judged.previous }
      }),
    [],
  )

  const deleteSet = useCallback(
    (id: string) =>
      enqueue(async () => {
        await deleteSetRow(id)
        setSets((current) => current.filter((row) => row.id !== id))
      }),
    [],
  )

  const saveExercise = useCallback(
    (exercise: Exercise) =>
      enqueue(async () => {
        await putExercise(exercise)
        setExercises((current) => {
          const exists = current.some((item) => item.id === exercise.id)
          return exists ? current.map((item) => (item.id === exercise.id ? exercise : item)) : [exercise, ...current]
        })
      }),
    [],
  )

  const saveRoutine = useCallback(
    (routine: Routine) =>
      enqueue(async () => {
        await putRoutine(routine)
        setRoutines((current) => {
          const exists = current.some((item) => item.id === routine.id)
          return exists ? current.map((item) => (item.id === routine.id ? routine : item)) : [routine, ...current]
        })
      }),
    [],
  )

  const deleteRoutine = useCallback(
    (id: string) =>
      enqueue(async () => {
        await deleteRoutineRow(id)
        setRoutines((current) => current.filter((routine) => routine.id !== id))
      }),
    [],
  )

  const saveNote = useCallback(
    (exerciseId: string, text: string) =>
      enqueue(async () => {
        const note: SetupNote = { exerciseId, text: text.slice(0, 400), updatedAt: Date.now() }
        await putNote(note)
        setNotes((current) => {
          const exists = current.some((item) => item.exerciseId === exerciseId)
          return exists ? current.map((item) => (item.exerciseId === exerciseId ? note : item)) : [...current, note]
        })
      }),
    [],
  )

  const saveSettings = useCallback(
    (next: Settings) =>
      enqueue(async () => {
        const cleaned = cleanSettings(next)
        await putSettings(cleaned)
        setSettings(cleaned)
        settingsRef.current = cleaned
      }),
    [],
  )

  const markExported = useCallback(
    () =>
      enqueue(async () => {
        const now = Date.now()
        await setLastExportAt(now)
        setExported(now)
      }),
    [],
  )

  const wipe = useCallback(
    () =>
      enqueue(async () => {
        await deleteEverything()
        await reload()
      }),
    [reload],
  )

  const value: StoreValue = {
    ready,
    error,
    exercises,
    workouts,
    sets,
    routines,
    notes,
    settings: settings ?? {
      unit: 'lb',
      plateStepLb: 5,
      dumbbellStepLb: 5,
      plateStepKg: 2.5,
      dumbbellStepKg: 2.5,
      restSeconds: 90,
      stallSessions: 4,
    },
    persistent,
    usageLabel,
    lastExportAt,
    reload,
    startWorkout,
    updateWorkout,
    finishWorkout,
    deleteWorkout,
    logSet,
    deleteSet,
    saveExercise,
    saveRoutine,
    deleteRoutine,
    saveNote,
    saveSettings,
    markExported,
    wipe,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('The log is not ready.')
  return value
}

export function useActiveWorkout(): Workout | null {
  const { workouts } = useStore()
  return activeWorkout(workouts)
}
