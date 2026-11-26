import { useState } from 'react'
import { formatDay, formatNumber } from '../format'
import { e1rmInUnit, toUnit } from '../logic'
import { useStore } from '../store'
import type { Workout } from '../types'
import { Button, Panel } from '../ui'

export function HistoryScreen() {
  const { workouts, sets, exercises } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const ordered = workouts.slice().sort((a, b) => b.startedAt - a.startedAt)
  const open = ordered.find((workout) => workout.id === openId) ?? null

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm leading-relaxed text-mist" data-testid="history-unlocked">
          Every workout stays on this device. History is not locked.
        </p>
      </header>
      {open ? (
        <WorkoutDetail workout={open} onBack={() => setOpenId(null)} />
      ) : ordered.length === 0 ? (
        <Panel>
          <p className="text-mist">No workouts yet. A finished session, and any session still in progress, shows up here.</p>
        </Panel>
      ) : (
        <div className="grid gap-2">
          {ordered.map((workout) => {
            const rows = sets.filter((set) => set.workoutId === workout.id)
            const names = [...new Set(rows.map((set) => exercises.find((exercise) => exercise.id === set.exerciseId)?.name ?? 'Lift'))]
            return (
              <button
                key={workout.id}
                type="button"
                data-testid={`workout-${workout.id}`}
                onClick={() => setOpenId(workout.id)}
                className="rounded-3xl border border-line bg-panel px-4 py-3 text-left"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold">{workout.name}</span>
                  <span className="text-sm text-mist">{formatDay(workout.startedAt)}</span>
                </span>
                <span className="mt-1 block text-sm text-mist">
                  {workout.finishedAt == null ? 'In progress · ' : ''}
                  {rows.length === 1 ? '1 set' : `${rows.length} sets`}
                  {names.length ? ` · ${names.join(', ')}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WorkoutDetail({ workout, onBack }: { workout: Workout; onBack: () => void }) {
  const { sets, exercises, settings, deleteWorkout } = useStore()
  const [armed, setArmed] = useState(false)
  const rows = sets.filter((set) => set.workoutId === workout.id).sort((a, b) => a.order - b.order)
  const groups = new Map<string, typeof rows>()
  for (const set of rows) {
    const list = groups.get(set.exerciseId) ?? []
    list.push(set)
    groups.set(set.exerciseId, list)
  }

  return (
    <div className="grid gap-3">
      <button type="button" className="min-h-12 self-start font-semibold text-ambertext" onClick={onBack}>
        All workouts
      </button>
      <h2 className="text-2xl font-semibold">{workout.name}</h2>
      <p className="text-sm text-mist">{formatDay(workout.startedAt)}</p>
      {[...groups.entries()].map(([exerciseId, group]) => {
        const exercise = exercises.find((item) => item.id === exerciseId)
        return (
          <Panel key={exerciseId}>
            <h3 className="font-semibold">{exercise?.name ?? 'Lift'}</h3>
            <ul className="mt-2 grid gap-1">
              {group.map((set, index) => {
                const e1rm = e1rmInUnit(set.weight, set.unit, set.reps, settings.unit)
                return (
                  <li key={set.id} className="font-mono text-lg">
                    {index + 1}. {formatNumber(toUnit(set.weight, set.unit, settings.unit))} {settings.unit} × {set.reps}
                    {e1rm == null ? '' : ` · ${formatNumber(e1rm)} e1RM`}
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
      {armed ? (
        <div className="grid gap-2">
          <Button
            variant="danger"
            onClick={() => {
              void deleteWorkout(workout.id).then(onBack)
            }}
          >
            Yes, delete this workout
          </Button>
          <Button variant="secondary" onClick={() => setArmed(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setArmed(true)}>
          Delete workout
        </Button>
      )}
    </div>
  )
}
