import { useState } from 'react'
import { formatDay, formatDuration, formatNumber, parseReps, parseWeight } from '../format'
import { activePercent, activeSeconds, e1rmInUnit, exerciseOrder, moveItem, pausedSeconds, restSeconds, toUnit, workoutDurationSec } from '../logic'
import { ExercisePicker } from '../exercise-picker'
import { useStore } from '../store'
import type { LiftSet, Workout } from '../types'
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
            const timing = timeSummary(workout, rows)
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
                  {timing ? ` · ${timing.total} · ${timing.paused} paused · ${timing.percent}% active` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function timeSummary(workout: Workout, rows: { durationSec: number | null }[]) {
  const totalSec = workoutDurationSec(workout, Date.now())
  const active = activeSeconds(rows)
  const percent = activePercent(totalSec, active)
  if (percent == null) return null
  return {
    total: formatDuration(totalSec),
    active: formatDuration(active),
    rest: formatDuration(restSeconds(totalSec, active)),
    paused: formatDuration(pausedSeconds(workout, Date.now())),
    percent,
  }
}

function WorkoutDetail({ workout, onBack }: { workout: Workout; onBack: () => void }) {
  const store = useStore()
  const { sets, exercises, deleteWorkout, updateWorkout, saveTemplate, removeExerciseFromWorkout } = store
  const [armed, setArmed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [templateNote, setTemplateNote] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const rows = sets.filter((set) => set.workoutId === workout.id).sort((a, b) => a.order - b.order)
  const timing = timeSummary(workout, rows)
  const order = exerciseOrder(workout.plannedExerciseIds, rows)

  async function saveName(name: string) {
    await updateWorkout(workout.id, { name: name.slice(0, 80) })
  }

  return (
    <div className="grid gap-3" data-testid="workout-editor">
      <button type="button" className="min-h-12 self-start font-semibold text-ambertext" onClick={onBack}>
        All workouts
      </button>
      <label className="block text-sm font-medium text-mist">
        Workout name
        <input
          data-testid="edit-workout-name"
          className="field mt-1 text-lg font-semibold"
          value={workout.name}
          maxLength={80}
          onChange={(event) => void saveName(event.target.value)}
        />
      </label>
      <p className="text-sm text-mist">{formatDay(workout.startedAt)}</p>
      {timing ? (
        <p className="text-sm leading-relaxed" data-testid="workout-time">
          {timing.total} total · {timing.active} active · {timing.rest} rest · {timing.paused} paused · {timing.percent}% active
        </p>
      ) : null}
      <Button
        variant="secondary"
        data-testid="save-template"
        onClick={() => {
          void saveTemplate(workout.id).then((routine) => setTemplateNote(`Saved “${routine.name}” as a template.`))
        }}
      >
        Save as template
      </Button>
      {templateNote ? (
        <p className="text-sm text-good" data-testid="template-saved" role="status">
          {templateNote}
        </p>
      ) : null}
      {order.map((exerciseId, index) => {
        const exercise = exercises.find((item) => item.id === exerciseId)
        const group = rows.filter((set) => set.exerciseId === exerciseId)
        return (
          <Panel key={exerciseId}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{exercise?.name ?? 'Lift'}</h3>
              <div className="flex gap-1">
                <button
                  type="button"
                  data-testid={`move-up-${exerciseId}`}
                  className="min-h-12 px-2 font-semibold text-ambertext disabled:opacity-40"
                  disabled={index === 0}
                  onClick={() => void updateWorkout(workout.id, { plannedExerciseIds: moveItem(order, index, -1) })}
                >
                  Up
                </button>
                <button
                  type="button"
                  data-testid={`move-down-${exerciseId}`}
                  className="min-h-12 px-2 font-semibold text-ambertext disabled:opacity-40"
                  disabled={index === order.length - 1}
                  onClick={() => void updateWorkout(workout.id, { plannedExerciseIds: moveItem(order, index, 1) })}
                >
                  Down
                </button>
              </div>
            </div>
            <ul className="mt-2 grid gap-2">
              {group.map((set, setIndex) => (
                <SetRow key={set.id} set={set} index={setIndex} />
              ))}
            </ul>
            <AddSetForm workoutId={workout.id} exerciseId={exerciseId} />
            {dropId === exerciseId ? (
              <div className="mt-3 grid gap-2">
                <p className="text-sm text-mist">
                  Remove {exercise?.name ?? 'this lift'}
                  {group.length ? ' and its sets from this workout?' : ' from this workout?'} Logged history in other workouts stays.
                </p>
                <Button
                  variant="danger"
                  data-testid="confirm-remove-exercise"
                  onClick={() => {
                    void removeExerciseFromWorkout(workout.id, exerciseId).then(() => setDropId(null))
                  }}
                >
                  Remove lift
                </Button>
                <Button variant="secondary" onClick={() => setDropId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button type="button" className="mt-1 block min-h-12 text-left text-sm font-semibold text-mist" onClick={() => setDropId(exerciseId)}>
                Remove lift
              </button>
            )}
          </Panel>
        )
      })}
      {adding ? (
        <ExercisePicker
          onPick={(id) => {
            const next = order.includes(id) ? order : [...order, id]
            void updateWorkout(workout.id, { plannedExerciseIds: next })
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <Button variant="secondary" data-testid="add-exercise-history" onClick={() => setAdding(true)}>
          Add exercise
        </Button>
      )}
      {armed ? (
        <div className="grid gap-2">
          <p className="text-sm text-mist">Delete this workout from this device?</p>
          <Button
            variant="danger"
            data-testid="confirm-delete-workout"
            onClick={() => {
              void deleteWorkout(workout.id).then(onBack)
            }}
          >
            Delete workout
          </Button>
          <Button variant="secondary" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="danger" data-testid="delete-workout" onClick={() => setArmed(true)}>
          Delete workout
        </Button>
      )}
    </div>
  )
}

function SetRow({ set, index }: { set: LiftSet; index: number }) {
  const { settings, updateSet, deleteSet } = useStore()
  const [editing, setEditing] = useState(false)
  const [armed, setArmed] = useState(false)
  const e1rm = e1rmInUnit(set.weight, set.unit, set.reps, settings.unit)
  if (editing) {
    return (
      <li>
        <SetForm
          set={set}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            void updateSet(next).then(() => setEditing(false))
          }}
        />
      </li>
    )
  }
  return (
    <li className="grid gap-1">
      <p className="font-mono text-lg">
        {index + 1}. {formatNumber(toUnit(set.weight, set.unit, settings.unit))} {settings.unit} × {set.reps}
        {e1rm == null ? '' : ` · ${formatNumber(e1rm)} ${settings.unit} e1RM`}
        {set.durationSec != null ? ` · ${formatDuration(set.durationSec)}` : ''}
      </p>
      <div className="flex gap-2">
        <button type="button" data-testid="edit-set" className="min-h-12 px-2 font-semibold text-ambertext" onClick={() => setEditing(true)}>
          Edit
        </button>
        {armed ? (
          <button
            type="button"
            data-testid="confirm-delete-set"
            className="min-h-12 px-2 font-semibold text-bad"
            onClick={() => void deleteSet(set.id)}
          >
            Delete set
          </button>
        ) : (
          <button type="button" className="min-h-12 px-2 text-sm font-semibold text-mist" onClick={() => setArmed(true)}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

function SetForm({ set, onSave, onCancel }: { set: LiftSet; onSave: (next: LiftSet) => void; onCancel: () => void }) {
  const { settings } = useStore()
  const [weight, setWeight] = useState(formatNumber(toUnit(set.weight, set.unit, settings.unit)))
  const [reps, setReps] = useState(String(set.reps))
  const [duration, setDuration] = useState(set.durationSec == null ? '' : String(set.durationSec))
  const parsedWeight = parseWeight(weight)
  const parsedReps = parseReps(reps)
  const parsedDuration = duration.trim() === '' ? null : Number(duration)
  const durationOk = parsedDuration == null || (Number.isInteger(parsedDuration) && parsedDuration >= 0 && parsedDuration <= 36000)
  const shownWeight = formatNumber(toUnit(set.weight, set.unit, settings.unit))
  const weightUnchanged = weight.trim() === shownWeight
  return (
    <div className="grid gap-2 rounded-2xl border border-line p-3">
      <label className="text-sm text-mist">
        Weight ({settings.unit})
        <input data-testid="set-weight" className="field mt-1" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
      </label>
      <label className="text-sm text-mist">
        Reps
        <input data-testid="set-reps" className="field mt-1" inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} />
      </label>
      <label className="text-sm text-mist">
        Duration seconds
        <input
          data-testid="set-duration"
          className="field mt-1"
          inputMode="numeric"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      <Button
        data-testid="save-set"
        disabled={parsedWeight == null || parsedReps == null || !durationOk}
        onClick={() =>
          onSave({
            ...set,
            weight: weightUnchanged ? set.weight : (parsedWeight ?? set.weight),
            unit: weightUnchanged ? set.unit : settings.unit,
            reps: parsedReps ?? set.reps,
            durationSec: durationOk ? parsedDuration : set.durationSec,
          })
        }
      >
        Save set
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

function AddSetForm({ workoutId, exerciseId }: { workoutId: string; exerciseId: string }) {
  const { settings, addSet } = useStore()
  const [open, setOpen] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('5')
  const [duration, setDuration] = useState('')
  if (!open) {
    return (
      <button type="button" className="mt-3 block min-h-12 text-left font-semibold text-ambertext" onClick={() => setOpen(true)}>
        Add set
      </button>
    )
  }
  const parsedWeight = parseWeight(weight)
  const parsedReps = parseReps(reps)
  const parsedDuration = duration.trim() === '' ? null : Number(duration)
  const durationOk = parsedDuration == null || (Number.isInteger(parsedDuration) && parsedDuration >= 0 && parsedDuration <= 36000)
  return (
    <div className="mt-2 grid gap-2">
      <input className="field" inputMode="decimal" placeholder={`Weight (${settings.unit})`} value={weight} onChange={(event) => setWeight(event.target.value)} />
      <input className="field" inputMode="numeric" placeholder="Reps" value={reps} onChange={(event) => setReps(event.target.value)} />
      <input className="field" inputMode="numeric" placeholder="Duration seconds" value={duration} onChange={(event) => setDuration(event.target.value)} />
      <Button
        disabled={parsedWeight == null || parsedReps == null || !durationOk}
        onClick={() => {
          if (parsedWeight == null || parsedReps == null || !durationOk) return
          void addSet({ workoutId, exerciseId, weight: parsedWeight, reps: parsedReps, durationSec: parsedDuration }).then(() => setOpen(false))
        }}
      >
        Save added set
      </Button>
    </div>
  )
}

