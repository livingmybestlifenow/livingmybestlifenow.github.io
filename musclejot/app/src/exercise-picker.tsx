import { useMemo, useState } from 'react'
import { useStore } from './store'
import { MUSCLE_LABEL, equipmentLabel, muscleLabel, type Equipment, type Exercise, type Muscle } from './types'

function matches(exercise: Exercise, needle: string): boolean {
  return exercise.name.toLowerCase().includes(needle)
}

export function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { exercises } = useStore()
  const [query, setQuery] = useState('')
  const [browse, setBrowse] = useState<'muscle' | 'equipment'>('muscle')
  const available = exercises.filter((exercise) => !exercise.archived)
  const needle = query.trim().toLowerCase()
  const matchesList = available.filter((exercise) => matches(exercise, needle)).sort((a, b) => a.name.localeCompare(b.name))
  const groups = useMemo(() => groupExercises(available, browse), [available, browse])

  return (
    <div data-testid="exercise-picker" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Add a lift</h2>
        <button type="button" className="min-h-12 px-2 font-semibold text-ambertext" onClick={onClose}>
          Back
        </button>
      </div>
      <label className="block text-sm font-medium text-mist">
        Search
        <input
          data-testid="exercise-search"
          className="field mt-1 text-cream"
          placeholder="Type a lift"
          value={query}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {needle ? (
        <div className="grid gap-2" data-testid="exercise-matches">
          {matchesList.length === 0 ? (
            <p className="text-sm text-mist">No lift matches. Add a custom exercise in Library and it will show up here.</p>
          ) : (
            matchesList.map((exercise) => <PickButton key={exercise.id} exercise={exercise} onPick={onPick} />)
          )}
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium text-mist">
            Browse
            <select
              data-testid="browse-by"
              className="field mt-1 text-cream"
              value={browse}
              onChange={(event) => setBrowse(event.target.value === 'equipment' ? 'equipment' : 'muscle')}
            >
              <option value="muscle">Muscle</option>
              <option value="equipment">Equipment</option>
            </select>
          </label>
          {groups.map((group) => (
            <section key={group.id} className="grid gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-mist">{group.label}</h3>
              {group.exercises.map((exercise) => (
                <PickButton key={exercise.id} exercise={exercise} onPick={onPick} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function PickButton({ exercise, onPick }: { exercise: Exercise; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      data-testid={`pick-${exercise.id}`}
      aria-label={exercise.name}
      onClick={() => onPick(exercise.id)}
      className="min-h-14 rounded-2xl border border-line bg-panel px-4 py-2 text-left"
    >
      <span className="block font-semibold">{exercise.name}</span>
      <span className="text-sm text-mist">
        {equipmentLabel(exercise.equipment)} · {muscleLabel(exercise.primary)}
      </span>
    </button>
  )
}

function groupExercises(exercises: Exercise[], browse: 'muscle' | 'equipment') {
  const buckets = new Map<string, Exercise[]>()
  for (const exercise of exercises) {
    const key = browse === 'muscle' ? exercise.primary : exercise.equipment
    const list = buckets.get(key) ?? []
    list.push(exercise)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .map(([id, list]) => ({
      id,
      label: browse === 'muscle' ? (MUSCLE_LABEL[id as Muscle] ?? id) : equipmentLabel(id as Equipment),
      exercises: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
