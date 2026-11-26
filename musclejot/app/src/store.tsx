import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createContext, useContext } from 'react'
import {
  deleteEverything,
  deleteExercise as deleteExerciseRow,
  deleteRoutine as deleteRoutineRow,
  deleteSet as deleteSetRow,
  deleteWorkout as deleteWorkoutRow,
  loadAll,
  patchWorkout,
  setSafetyAckAt,
  putExercise,
  putNote,
  putRoutine,
  putSet,
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
  safetyAckAt: number | null
  reload: () => Promise<void>
  acknowledgeSafety: () => Promise<void>
  startWorkout: (input: { name: string; routineId: string | null; plannedExerciseIds: string[] }) => Promise<Workout>
  updateWorkout: (id: string, patch: Partial<Workout>) => Promise<void>
  finishWorkout: (id: string) => Promise<void>
  deleteWorkout: (id: string) => Promise<void>
  updateSet: (set: LiftSet) => Promise<void>
  addSet: (input: { workoutId: string; exerciseId: string; weight: number; reps: number; durationSec: number | null }) => Promise<void>
  saveTemplate: (workoutId: string) => Promise<Routine>
  deleteExercise: (id: string) => Promise<void>
  removeExerciseFromWorkout: (workoutId: string, exerciseId: string) => Promise<void>
  undo: { id: string; label: string } | null
  runUndo: () => Promise<void>
  logSet: (input: { workoutId: string; exerciseId: string; weight: number; reps: number }) => Promise<LogResult>
  startSetTimer: (workoutId: string) => Promise<void>
  stopSetTimer: (workoutId: string) => Promise<void>
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
  const [safetyAckAt, setSafetyAck] = useState<number | null>(null)
  const [undo, setUndo] = useState<{ id: string; label: string; restore: () => Promise<void> } | null>(null)
  const queue = useRef(Promise.resolve())
  const undoTimer = useRef(0)
  const undoRef = useRef(undo)
  const setsRef = useRef(sets)
  const workoutsRef = useRef(workouts)
  const settingsRef = useRef(settings)
  const exercisesRef = useRef(exercises)
  const routinesRef = useRef(routines)
  setsRef.current = sets
  workoutsRef.current = workouts
  settingsRef.current = settings
  exercisesRef.current = exercises
  routinesRef.current = routines
  undoRef.current = undo

  const armUndo = useCallback((label: string, restore: () => Promise<void>) => {
    window.clearTimeout(undoTimer.current)
    const offer = { id: crypto.randomUUID(), label, restore }
    undoRef.current = offer
    setUndo(offer)
    undoTimer.current = window.setTimeout(() => {
      setUndo((current) => (current?.id === offer.id ? null : current))
      if (undoRef.current?.id === offer.id) undoRef.current = null
    }, 8000)
  }, [])

  const apply = useCallback((snapshot: Awaited<ReturnType<typeof loadAll>>) => {
    setExercises(snapshot.exercises)
    setWorkouts(snapshot.workouts)
    setSets(snapshot.sets)
    setRoutines(snapshot.routines)
    setNotes(snapshot.notes)
    setSettings(snapshot.settings)
    setExported(snapshot.lastExportAt)
    setSafetyAck(snapshot.safetyAckAt)
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
          setStartedAt: null,
          pendingSetSec: null,
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
        const next = await patchWorkout(id, { finishedAt: Date.now(), restEndsAt: null, setStartedAt: null, pendingSetSec: null })
        setWorkouts((current) => current.map((workout) => (workout.id === id ? next : workout)))
      }),
    [],
  )

  const deleteWorkout = useCallback(
    (id: string) =>
      enqueue(async () => {
        const workout = workoutsRef.current.find((item) => item.id === id)
        const rows = setsRef.current.filter((row) => row.workoutId === id)
        if (!workout) return
        await deleteWorkoutRow(id)
        workoutsRef.current = workoutsRef.current.filter((item) => item.id !== id)
        setsRef.current = setsRef.current.filter((row) => row.workoutId !== id)
        setWorkouts(workoutsRef.current)
        setSets(setsRef.current)
        armUndo('Workout deleted', async () => {
          await putWorkout(workout)
          for (const row of rows) await putSet(row)
          workoutsRef.current = [workout, ...workoutsRef.current.filter((item) => item.id !== workout.id)]
          setsRef.current = [...setsRef.current, ...rows]
          setWorkouts(workoutsRef.current)
          setSets(setsRef.current)
        })
      }),
    [armUndo],
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
          durationSec: null,
        }
        const workout = workoutsRef.current.find((item) => item.id === input.workoutId)
        if (workout?.setStartedAt) row.durationSec = Math.max(1, Math.round((now - workout.setStartedAt) / 1000))
        else if (workout?.pendingSetSec) row.durationSec = workout.pendingSetSec
        const planned = workout?.plannedExerciseIds.includes(input.exerciseId)
          ? workout.plannedExerciseIds
          : [...(workout?.plannedExerciseIds ?? []), input.exerciseId]
        const restEndsAt =
          currentSettings?.restAutoStart && currentSettings.restSeconds > 0 ? now + currentSettings.restSeconds * 1000 : null
        const saved = await putSetAndWorkout(row, input.workoutId, {
          restEndsAt,
          plannedExerciseIds: planned,
          setStartedAt: null,
          pendingSetSec: null,
        })
        const nextSets = [...setsRef.current, row]
        setsRef.current = nextSets
        workoutsRef.current = workoutsRef.current.map((item) => (item.id === input.workoutId ? saved : item))
        setSets(nextSets)
        setWorkouts(workoutsRef.current)
        return { set: row, kind: judged.kind, e1rm: judged.e1rm, previous: judged.previous }
      }),
    [],
  )

  const rememberWorkout = (next: Workout) => {
    workoutsRef.current = workoutsRef.current.map((item) => (item.id === next.id ? next : item))
    setWorkouts(workoutsRef.current)
  }

  const startSetTimer = useCallback(
    (id: string) =>
      enqueue(async () => {
        const next = await patchWorkout(id, { setStartedAt: Date.now(), pendingSetSec: null })
        rememberWorkout(next)
      }),
    [],
  )

  const stopSetTimer = useCallback(
    (id: string) =>
      enqueue(async () => {
        const workout = workoutsRef.current.find((item) => item.id === id)
        if (!workout?.setStartedAt) return
        const pendingSetSec = Math.max(1, Math.round((Date.now() - workout.setStartedAt) / 1000))
        const current = settingsRef.current
        const restEndsAt = current?.restAutoStart && current.restSeconds > 0 ? Date.now() + current.restSeconds * 1000 : null
        const next = await patchWorkout(id, { setStartedAt: null, pendingSetSec, restEndsAt })
        rememberWorkout(next)
      }),
    [],
  )

  const deleteSet = useCallback(
    (id: string) =>
      enqueue(async () => {
        const row = setsRef.current.find((item) => item.id === id)
        if (!row) return
        await deleteSetRow(id)
        setsRef.current = setsRef.current.filter((item) => item.id !== id)
        setSets(setsRef.current)
        armUndo('Set deleted', async () => {
          await putSet(row)
          setsRef.current = [...setsRef.current, row]
          setSets(setsRef.current)
        })
      }),
    [armUndo],
  )

  const updateSet = useCallback(
    (next: LiftSet) =>
      enqueue(async () => {
        await putSet(next)
        setsRef.current = setsRef.current.map((row) => (row.id === next.id ? next : row))
        setSets(setsRef.current)
      }),
    [],
  )

  const addSet = useCallback(
    (input: { workoutId: string; exerciseId: string; weight: number; reps: number; durationSec: number | null }) =>
      enqueue(async () => {
        const unit = settingsRef.current?.unit ?? 'lb'
        const now = Date.now()
        const row: LiftSet = {
          id: crypto.randomUUID(),
          workoutId: input.workoutId,
          exerciseId: input.exerciseId,
          weight: input.weight,
          unit,
          reps: input.reps,
          durationSec: input.durationSec,
          createdAt: now,
          order: setsRef.current.filter((item) => item.workoutId === input.workoutId).length + 1,
        }
        const workout = workoutsRef.current.find((item) => item.id === input.workoutId)
        const planned = workout?.plannedExerciseIds.includes(input.exerciseId)
          ? workout.plannedExerciseIds
          : [...(workout?.plannedExerciseIds ?? []), input.exerciseId]
        const saved = await putSetAndWorkout(row, input.workoutId, { plannedExerciseIds: planned })
        setsRef.current = [...setsRef.current, row]
        workoutsRef.current = workoutsRef.current.map((item) => (item.id === input.workoutId ? saved : item))
        setSets(setsRef.current)
        setWorkouts(workoutsRef.current)
      }),
    [],
  )

  const saveTemplate = useCallback(
    (workoutId: string) =>
      enqueue(async () => {
        const workout = workoutsRef.current.find((item) => item.id === workoutId)
        if (!workout) throw new Error('That workout is not on this device.')
        const seen: string[] = []
        for (const row of setsRef.current
          .filter((item) => item.workoutId === workoutId)
          .sort((a, b) => a.order - b.order)) {
          if (!seen.includes(row.exerciseId)) seen.push(row.exerciseId)
        }
        const exerciseIds = [...workout.plannedExerciseIds]
        for (const id of seen) if (!exerciseIds.includes(id)) exerciseIds.push(id)
        const now = Date.now()
        const routine: Routine = {
          id: crypto.randomUUID(),
          name: workout.name.trim().slice(0, 80) || 'Template',
          exerciseIds,
          createdAt: now,
          updatedAt: now,
        }
        await putRoutine(routine)
        routinesRef.current = [routine, ...routinesRef.current]
        setRoutines(routinesRef.current)
        return routine
      }),
    [],
  )

  const removeExerciseFromWorkout = useCallback(
    (workoutId: string, exerciseId: string) =>
      enqueue(async () => {
        const workout = workoutsRef.current.find((item) => item.id === workoutId)
        if (!workout) return
        const rows = setsRef.current.filter((row) => row.workoutId === workoutId && row.exerciseId === exerciseId)
        for (const row of rows) await deleteSetRow(row.id)
        const planned = workout.plannedExerciseIds.filter((id) => id !== exerciseId)
        const next = await patchWorkout(workoutId, { plannedExerciseIds: planned })
        setsRef.current = setsRef.current.filter((row) => !(row.workoutId === workoutId && row.exerciseId === exerciseId))
        workoutsRef.current = workoutsRef.current.map((item) => (item.id === workoutId ? next : item))
        setSets(setsRef.current)
        setWorkouts(workoutsRef.current)
        armUndo('Lift removed', async () => {
          for (const row of rows) await putSet(row)
          await putWorkout(workout)
          setsRef.current = [...setsRef.current, ...rows]
          const exists = workoutsRef.current.some((item) => item.id === workout.id)
          workoutsRef.current = exists
            ? workoutsRef.current.map((item) => (item.id === workout.id ? workout : item))
            : [workout, ...workoutsRef.current]
          setSets(setsRef.current)
          setWorkouts(workoutsRef.current)
        })
      }),
    [armUndo],
  )

  const deleteExercise = useCallback(
    (id: string) =>
      enqueue(async () => {
        const exercise = exercisesRef.current.find((item) => item.id === id)
        if (!exercise) return
        const used = setsRef.current.some((row) => row.exerciseId === id)
        if (used) {
          const archived = { ...exercise, archived: true }
          await putExercise(archived)
          exercisesRef.current = exercisesRef.current.map((item) => (item.id === id ? archived : item))
        } else {
          await deleteExerciseRow(id)
          exercisesRef.current = exercisesRef.current.filter((item) => item.id !== id)
        }
        setExercises(exercisesRef.current)
        armUndo('Exercise deleted', async () => {
          await putExercise(exercise)
          const exists = exercisesRef.current.some((item) => item.id === exercise.id)
          exercisesRef.current = exists
            ? exercisesRef.current.map((item) => (item.id === exercise.id ? exercise : item))
            : [exercise, ...exercisesRef.current]
          setExercises(exercisesRef.current)
        })
      }),
    [armUndo],
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
        const routine = routinesRef.current.find((item) => item.id === id)
        if (!routine) return
        await deleteRoutineRow(id)
        routinesRef.current = routinesRef.current.filter((item) => item.id !== id)
        setRoutines(routinesRef.current)
        armUndo('Template deleted', async () => {
          await putRoutine(routine)
          routinesRef.current = [routine, ...routinesRef.current.filter((item) => item.id !== routine.id)]
          setRoutines(routinesRef.current)
        })
      }),
    [armUndo],
  )

  const runUndo = useCallback(
    () =>
      enqueue(async () => {
        const current = undoRef.current
        if (!current) return
        window.clearTimeout(undoTimer.current)
        undoRef.current = null
        setUndo(null)
        await current.restore()
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

  const acknowledgeSafety = useCallback(
    () =>
      enqueue(async () => {
        const now = Date.now()
        await setSafetyAckAt(now)
        setSafetyAck(now)
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
      restAutoStart: true,
      chime: 'bell',
      muted: false,
      vibrate: true,
      setMilestoneChime: false,
      stallSessions: 4,
    },
    persistent,
    usageLabel,
    lastExportAt,
    safetyAckAt,
    reload,
    acknowledgeSafety,
    startWorkout,
    updateWorkout,
    finishWorkout,
    deleteWorkout,
    updateSet,
    addSet,
    saveTemplate,
    deleteExercise,
    removeExerciseFromWorkout,
    undo: undo ? { id: undo.id, label: undo.label } : null,
    runUndo,
    logSet,
    startSetTimer,
    stopSetTimer,
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
