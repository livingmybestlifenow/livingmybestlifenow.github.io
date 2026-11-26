import { useState } from 'react'
import { useStore } from '../store'
import { EQUIPMENT, MUSCLES, equipmentLabel, muscleLabel, type Equipment, type Muscle } from '../types'
import { Button, Panel } from '../ui'

export function LibraryScreen() {
  const { exercises, sets, routines, saveExercise, deleteRoutine } = useStore()
  const [showExercise, setShowExercise] = useState(false)
  const [showRoutine, setShowRoutine] = useState(false)

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Custom lifts and routines stay on this device. Credit follows each lift’s primary and secondary tags.
        </p>
      </header>
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Exercises</h2>
          <button type="button" className="min-h-12 font-semibold text-ambertext" onClick={() => setShowExercise((open) => !open)}>
            {showExercise ? 'Close' : 'Custom exercise'}
          </button>
        </div>
        {showExercise ? <ExerciseForm onDone={() => setShowExercise(false)} /> : null}
        <ul className="mt-3 grid gap-2">
          {exercises
            .filter((exercise) => !exercise.archived)
            .slice()
            .sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name))
            .map((exercise) => (
              <li key={exercise.id} className="rounded-2xl border border-line px-3 py-2">
                <p className="font-semibold">{exercise.name}</p>
                <p className="text-sm text-mist">
                  {equipmentLabel(exercise.equipment)} · {muscleLabel(exercise.primary)}
                  {exercise.secondary.length ? ` · also ${exercise.secondary.map(muscleLabel).join(', ')}` : ''}
                </p>
                {exercise.custom ? (
                  <button
                    type="button"
                    className="mt-1 min-h-12 text-sm font-semibold text-mist"
                    onClick={() => void saveExercise({ ...exercise, archived: true })}
                  >
                    {sets.some((set) => set.exerciseId === exercise.id) ? 'Archive' : 'Remove'}
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Routines</h2>
          <button type="button" data-testid="new-routine" className="min-h-12 font-semibold text-ambertext" onClick={() => setShowRoutine((open) => !open)}>
            {showRoutine ? 'Close' : 'New routine'}
          </button>
        </div>
        {showRoutine ? <RoutineForm onDone={() => setShowRoutine(false)} /> : null}
        <ul className="mt-3 grid gap-2">
          {routines.length === 0 ? <li className="text-sm text-mist">No routines yet.</li> : null}
          {routines
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((routine) => (
              <li key={routine.id} className="rounded-2xl border border-line px-3 py-2">
                <p className="font-semibold">{routine.name}</p>
                <p className="text-sm text-mist">
                  {routine.exerciseIds
                    .map((id) => exercises.find((exercise) => exercise.id === id)?.name ?? 'Lift')
                    .join(', ')}
                </p>
                <button type="button" className="mt-1 min-h-12 text-sm font-semibold text-mist" onClick={() => void deleteRoutine(routine.id)}>
                  Delete routine
                </button>
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  )
}

function ExerciseForm({ onDone }: { onDone: () => void }) {
  const { saveExercise } = useStore()
  const [name, setName] = useState('')
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [primary, setPrimary] = useState<Muscle>('chest')
  const [secondary, setSecondary] = useState<Muscle[]>([])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    await saveExercise({
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 80),
      equipment,
      primary,
      secondary: secondary.filter((muscle) => muscle !== primary),
      custom: true,
      archived: false,
      createdAt: Date.now(),
    })
    onDone()
  }

  return (
    <div className="mt-3 grid gap-3">
      <label className="text-sm font-medium text-mist">
        Name
        <input className="field mt-1" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="text-sm font-medium text-mist">
        Equipment
        <select className="field mt-1" value={equipment} onChange={(event) => setEquipment(event.target.value as Equipment)}>
          {EQUIPMENT.map((item) => (
            <option key={item} value={item}>
              {equipmentLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-mist">
        Primary muscle
        <select className="field mt-1" value={primary} onChange={(event) => setPrimary(event.target.value as Muscle)}>
          {MUSCLES.map((item) => (
            <option key={item} value={item}>
              {muscleLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-mist">Secondary muscles</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {MUSCLES.filter((muscle) => muscle !== primary).map((muscle) => {
            const on = secondary.includes(muscle)
            return (
              <button
                key={muscle}
                type="button"
                aria-pressed={on}
                className={on ? 'min-h-12 rounded-full bg-amber px-3 font-semibold text-ink' : 'min-h-12 rounded-full border border-line px-3'}
                onClick={() => setSecondary((current) => (current.includes(muscle) ? current.filter((item) => item !== muscle) : [...current, muscle]))}
              >
                {muscleLabel(muscle)}
              </button>
            )
          })}
        </div>
      </fieldset>
      <Button onClick={() => void save()} disabled={!name.trim()}>
        Save exercise
      </Button>
    </div>
  )
}

function RoutineForm({ onDone }: { onDone: () => void }) {
  const { exercises, saveRoutine } = useStore()
  const [name, setName] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const choices = exercises.filter((exercise) => !exercise.archived).slice().sort((a, b) => a.name.localeCompare(b.name))

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || ids.length === 0) return
    const now = Date.now()
    await saveRoutine({
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 80),
      exerciseIds: ids,
      createdAt: now,
      updatedAt: now,
    })
    onDone()
  }

  return (
    <div className="mt-3 grid gap-3">
      <label className="text-sm font-medium text-mist">
        Name
        <input
          data-testid="routine-name"
          className="field mt-1"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="grid gap-2">
        {choices.map((exercise) => {
          const on = ids.includes(exercise.id)
          return (
            <button
              key={exercise.id}
              type="button"
              data-testid={`routine-toggle-${exercise.id}`}
              aria-pressed={on}
              className={on ? 'min-h-12 rounded-2xl bg-amber px-3 text-left font-semibold text-ink' : 'min-h-12 rounded-2xl border border-line px-3 text-left'}
              onClick={() => setIds((current) => (current.includes(exercise.id) ? current.filter((id) => id !== exercise.id) : [...current, exercise.id]))}
            >
              {exercise.name}
            </button>
          )
        })}
      </div>
      <Button data-testid="save-routine" onClick={() => void save()} disabled={!name.trim() || ids.length === 0}>
        Save routine
      </Button>
    </div>
  )
}
