import { useState } from 'react'
import { moveItem } from '../logic'
import { useStore } from '../store'
import { EQUIPMENT, MUSCLES, equipmentLabel, muscleLabel, type Equipment, type Exercise, type Muscle, type Routine } from '../types'
import { NativeSelect } from '../native-select'
import { Button, Panel } from '../ui'

export function LibraryScreen() {
  const { exercises, routines, deleteRoutine, deleteExercise } = useStore()
  const [showExercise, setShowExercise] = useState(false)
  const [showRoutine, setShowRoutine] = useState(false)
  const [editExercise, setEditExercise] = useState<Exercise | null>(null)
  const [editRoutine, setEditRoutine] = useState<Routine | null>(null)
  const [dropExercise, setDropExercise] = useState<string | null>(null)
  const [dropRoutine, setDropRoutine] = useState<string | null>(null)

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Custom lifts and templates stay on this device. Deleting a template leaves logged workouts alone.
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
        {editExercise ? (
          <ExerciseForm
            initial={editExercise}
            onDone={() => setEditExercise(null)}
          />
        ) : null}
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
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className="min-h-12 font-semibold text-ambertext" onClick={() => setEditExercise(exercise)}>
                      Edit {exercise.name}
                    </button>
                    {dropExercise === exercise.id ? (
                      <>
                        <button
                          type="button"
                          data-testid="confirm-delete-exercise"
                          className="min-h-12 font-semibold text-bad"
                          onClick={() => {
                            void deleteExercise(exercise.id).then(() => setDropExercise(null))
                          }}
                        >
                          Delete exercise
                        </button>
                        <button type="button" className="min-h-12 font-semibold text-mist" onClick={() => setDropExercise(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="min-h-12 font-semibold text-mist" onClick={() => setDropExercise(exercise.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
        </ul>
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button type="button" data-testid="new-routine" className="min-h-12 font-semibold text-ambertext" onClick={() => setShowRoutine((open) => !open)}>
            {showRoutine ? 'Close' : 'New template'}
          </button>
        </div>
        {showRoutine ? <RoutineForm onDone={() => setShowRoutine(false)} /> : null}
        {editRoutine ? <RoutineForm initial={editRoutine} onDone={() => setEditRoutine(null)} /> : null}
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
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-12 font-semibold text-ambertext"
                    onClick={() => setEditRoutine(routine)}
                  >
                    Edit {routine.name}
                  </button>
                  {dropRoutine === routine.id ? (
                    <>
                      <p className="w-full text-sm text-mist">Delete this template? Workouts you already logged stay.</p>
                      <button
                        type="button"
                        data-testid="confirm-delete-template"
                        className="min-h-12 font-semibold text-bad"
                        onClick={() => {
                          void deleteRoutine(routine.id).then(() => setDropRoutine(null))
                        }}
                      >
                        Delete template
                      </button>
                      <button type="button" className="min-h-12 font-semibold text-mist" onClick={() => setDropRoutine(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="min-h-12 font-semibold text-mist" onClick={() => setDropRoutine(routine.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  )
}

function ExerciseForm({ initial, onDone }: { initial?: Exercise; onDone: () => void }) {
  const { saveExercise } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? 'barbell')
  const [primary, setPrimary] = useState<Muscle>(initial?.primary ?? 'chest')
  const [secondary, setSecondary] = useState<Muscle[]>(initial?.secondary ?? [])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    await saveExercise({
      id: initial?.id ?? crypto.randomUUID(),
      name: trimmed.slice(0, 80),
      equipment,
      primary,
      secondary: secondary.filter((muscle) => muscle !== primary),
      custom: true,
      archived: false,
      createdAt: initial?.createdAt ?? Date.now(),
    })
    onDone()
  }

  return (
    <div className="mt-3 grid gap-3">
      <label className="text-sm font-medium text-mist">
        Name
        <input data-testid="exercise-name" className="field mt-1" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <NativeSelect
        testId="exercise-equipment"
        label="Equipment"
        value={equipment}
        onChange={(next) => setEquipment(next as Equipment)}
        options={EQUIPMENT.map((item) => ({ value: item, label: equipmentLabel(item) }))}
      />
      <NativeSelect
        testId="exercise-primary"
        label="Primary muscle"
        value={primary}
        onChange={(next) => setPrimary(next as Muscle)}
        options={MUSCLES.map((item) => ({ value: item, label: muscleLabel(item) }))}
      />
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

function RoutineForm({ initial, onDone }: { initial?: Routine; onDone: () => void }) {
  const { exercises, saveRoutine } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [ids, setIds] = useState<string[]>(initial?.exerciseIds ?? [])
  const choices = exercises.filter((exercise) => !exercise.archived).slice().sort((a, b) => a.name.localeCompare(b.name))

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || ids.length === 0) return
    const now = Date.now()
    await saveRoutine({
      id: initial?.id ?? crypto.randomUUID(),
      name: trimmed.slice(0, 80),
      exerciseIds: ids,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    })
    onDone()
  }

  function move(index: number, direction: -1 | 1) {
    setIds((current) => moveItem(current, index, direction))
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
      {ids.length > 0 ? (
        <ol className="grid gap-1 text-sm">
          {ids.map((id, index) => (
            <li key={id} className="flex items-center justify-between gap-2">
              <span>{exercises.find((exercise) => exercise.id === id)?.name ?? 'Lift'}</span>
              <span>
                <button type="button" className="min-h-12 px-2" onClick={() => move(index, -1)}>
                  Up
                </button>
                <button type="button" className="min-h-12 px-2" onClick={() => move(index, 1)}>
                  Down
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
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
        {initial ? 'Save template' : 'Save routine'}
      </Button>
    </div>
  )
}
