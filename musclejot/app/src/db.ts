import { STARTER_EXERCISES } from './catalog'
import { formatBytes } from './format'
import { cleanSettings } from './logic'
import { type Exercise, type LiftSet, type Routine, type Settings, type SetupNote, type Workout } from './types'

const DB_NAME = 'musclejot'
const DB_VERSION = 1

let opening: Promise<IDBDatabase> | null = null

function explain(error: unknown, fallback: string): Error {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return new Error('This device is out of space. Export a CSV, then delete workouts you have already copied.')
  }
  if (error instanceof Error && error.message) return error
  return new Error(fallback)
}

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('sets')) db.createObjectStore('sets', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('routines')) db.createObjectStore('routines', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'exerciseId' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      resolve(db)
    }
    request.onerror = () => {
      opening = null
      reject(explain(request.error, 'The workout log on this device could not be opened.'))
    }
  })
  return opening
}

function finish(tx: IDBTransaction, fallback: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(explain(tx.error, fallback))
    tx.onabort = () => reject(explain(tx.error, fallback))
  })
}

function requestOf<T>(request: IDBRequest<T>, fallback: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(explain(request.error, fallback))
  })
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storagePersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

export async function storageUsageLabel(): Promise<string | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (estimate?.usage == null) return null
    return formatBytes(estimate.usage)
  } catch {
    return null
  }
}

async function ensureSeed(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['exercises', 'meta'], 'readwrite')
  const meta = tx.objectStore('meta')
  const seeded = await requestOf(meta.get('seeded'), 'The exercise library could not be prepared.')
  if (!seeded) {
    const exercises = tx.objectStore('exercises')
    for (const exercise of STARTER_EXERCISES) exercises.put(exercise)
    meta.put({ key: 'seeded', value: true })
  }
  await finish(tx, 'The exercise library could not be prepared.')
}

export type Snapshot = {
  exercises: Exercise[]
  workouts: Workout[]
  sets: LiftSet[]
  routines: Routine[]
  notes: SetupNote[]
  settings: Settings
  lastExportAt: number | null
  safetyAckAt: number | null
}

function isExercise(value: unknown): value is Exercise {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<Exercise>
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.primary === 'string'
}

function isWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<Workout>
  return typeof row.id === 'string' && typeof row.startedAt === 'number'
}

function isSet(value: unknown): value is LiftSet {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<LiftSet>
  return typeof row.id === 'string' && typeof row.workoutId === 'string' && typeof row.exerciseId === 'string'
}

function normalizeWorkout(workout: Workout): Workout {
  return {
    ...workout,
    name: workout.name || 'Workout',
    finishedAt: workout.finishedAt ?? null,
    routineId: workout.routineId ?? null,
    plannedExerciseIds: Array.isArray(workout.plannedExerciseIds) ? workout.plannedExerciseIds : [],
    restEndsAt: workout.restEndsAt ?? null,
    updatedAt: workout.updatedAt ?? workout.startedAt,
  }
}

function normalizeExercise(exercise: Exercise): Exercise {
  return {
    ...exercise,
    secondary: Array.isArray(exercise.secondary) ? exercise.secondary : [],
    custom: exercise.custom === true,
    archived: exercise.archived === true,
    createdAt: exercise.createdAt ?? 0,
  }
}

export async function loadAll(): Promise<Snapshot> {
  await ensureSeed()
  const db = await openDb()
  const tx = db.transaction(['exercises', 'workouts', 'sets', 'routines', 'notes', 'meta'], 'readonly')
  const exercises = requestOf(tx.objectStore('exercises').getAll(), 'The exercises could not be read.')
  const workouts = requestOf(tx.objectStore('workouts').getAll(), 'The workouts could not be read.')
  const sets = requestOf(tx.objectStore('sets').getAll(), 'The sets could not be read.')
  const routines = requestOf(tx.objectStore('routines').getAll(), 'The routines could not be read.')
  const notes = requestOf(tx.objectStore('notes').getAll(), 'The setup notes could not be read.')
  const settingsRow = requestOf(tx.objectStore('meta').get('settings'), 'Settings could not be read.')
  const exportRow = requestOf(tx.objectStore('meta').get('lastExportAt'), 'Export history could not be read.')
  const safetyRow = requestOf(tx.objectStore('meta').get('safetyAckAt'), 'The safety note could not be read.')
  const [exerciseRows, workoutRows, setRows, routineRows, noteRows, settings, exported, safety] = await Promise.all([
    exercises,
    workouts,
    sets,
    routines,
    notes,
    settingsRow,
    exportRow,
    safetyRow,
  ])
  await finish(tx, 'The workout log could not be read.')
  const settingsValue =
    settings && typeof settings === 'object' && 'value' in settings ? (settings as { value?: Partial<Settings> }).value : null
  const exportValue =
    exported && typeof exported === 'object' && 'value' in exported ? (exported as { value?: number }).value : null
  const safetyValue = safety && typeof safety === 'object' && 'value' in safety ? (safety as { value?: number }).value : null
  return {
    exercises: (exerciseRows as unknown[]).filter(isExercise).map(normalizeExercise),
    workouts: (workoutRows as unknown[]).filter(isWorkout).map(normalizeWorkout),
    sets: (setRows as unknown[]).filter(isSet),
    routines: (routineRows as Routine[]).filter((row) => row && typeof row.id === 'string'),
    notes: (noteRows as SetupNote[]).filter((row) => row && typeof row.exerciseId === 'string'),
    settings: cleanSettings(settingsValue),
    lastExportAt: typeof exportValue === 'number' ? exportValue : null,
    safetyAckAt: typeof safetyValue === 'number' ? safetyValue : null,
  }
}

export async function putExercise(exercise: Exercise): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('exercises', 'readwrite')
  tx.objectStore('exercises').put(exercise)
  await finish(tx, 'The exercise could not be saved.')
}

export async function putRoutine(routine: Routine): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('routines', 'readwrite')
  tx.objectStore('routines').put(routine)
  await finish(tx, 'The routine could not be saved.')
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('routines', 'readwrite')
  tx.objectStore('routines').delete(id)
  await finish(tx, 'The routine could not be deleted.')
}

export async function putWorkout(workout: Workout): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('workouts', 'readwrite')
  tx.objectStore('workouts').put(workout)
  await finish(tx, 'The workout could not be saved.')
}

export async function patchWorkout(id: string, patch: Partial<Workout>): Promise<Workout> {
  const db = await openDb()
  const tx = db.transaction('workouts', 'readwrite')
  const store = tx.objectStore('workouts')
  const current = await requestOf(store.get(id), 'That workout could not be opened.')
  if (!isWorkout(current)) throw new Error('That workout is not on this device.')
  const next = normalizeWorkout({ ...current, ...patch, id, updatedAt: Date.now() })
  store.put(next)
  await finish(tx, 'The workout could not be saved.')
  return next
}

export async function putSetAndWorkout(set: LiftSet, workoutId: string, patch: Partial<Workout>): Promise<Workout> {
  const db = await openDb()
  const tx = db.transaction(['sets', 'workouts'], 'readwrite')
  const workouts = tx.objectStore('workouts')
  const current = await requestOf(workouts.get(workoutId), 'That workout could not be opened.')
  if (!isWorkout(current)) throw new Error('That workout is not on this device.')
  const next = normalizeWorkout({ ...current, ...patch, id: workoutId, updatedAt: Date.now() })
  tx.objectStore('sets').put(set)
  workouts.put(next)
  await finish(tx, 'The set could not be saved on this device.')
  return next
}

export async function deleteSet(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('sets', 'readwrite')
  tx.objectStore('sets').delete(id)
  await finish(tx, 'The set could not be deleted.')
}

export async function deleteWorkout(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['workouts', 'sets'], 'readwrite')
  const sets = tx.objectStore('sets')
  const all = await requestOf(sets.getAll(), 'The sets could not be read.')
  for (const set of (all as LiftSet[]).filter((row) => row?.workoutId === id)) sets.delete(set.id)
  tx.objectStore('workouts').delete(id)
  await finish(tx, 'The workout could not be deleted.')
}

export async function putNote(note: SetupNote): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('notes', 'readwrite')
  tx.objectStore('notes').put(note)
  await finish(tx, 'The setup note could not be saved.')
}

export async function putSettings(settings: Settings): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'settings', value: cleanSettings(settings) })
  await finish(tx, 'Settings could not be saved.')
}

export async function setSafetyAckAt(value = Date.now()): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'safetyAckAt', value })
  await finish(tx, 'The safety note could not be saved.')
}

export async function setLastExportAt(value = Date.now()): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'lastExportAt', value })
  await finish(tx, 'Export history could not be saved.')
}

export async function deleteEverything(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['exercises', 'workouts', 'sets', 'routines', 'notes', 'meta'], 'readwrite')
  tx.objectStore('exercises').clear()
  tx.objectStore('workouts').clear()
  tx.objectStore('sets').clear()
  tx.objectStore('routines').clear()
  tx.objectStore('notes').clear()
  tx.objectStore('meta').clear()
  await finish(tx, 'The log could not be deleted.')
}
