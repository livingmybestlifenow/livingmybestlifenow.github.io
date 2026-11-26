import { useEffect, useRef, useState } from 'react'
import { playChime, pulseVibrate, unlockAudio } from '../chime'
import { formatClock, formatDay, formatDuration, formatNumber, parseReps, parseWeight, weekdayName } from '../format'
import { InstallBanner } from '../install'
import { e1rmInUnit, moveItem, pausedSeconds, previousSessionSets, prSetIds, stepFor, stepWeight, toUnit, workoutDurationSec } from '../logic'
import { ExercisePicker } from '../exercise-picker'
import { NativeSelect } from '../native-select'
import { useActiveWorkout, useStore } from '../store'
import { REST_PRESETS, equipmentLabel, muscleLabel, type Exercise } from '../types'
import { Button, Panel, Wordmark, cx } from '../ui'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function LogScreen({ goMore }: { goMore: () => void }) {
  const store = useStore()
  const workout = useActiveWorkout()
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ name: string; e1rm: number; previous: number | null } | null>(null)

  const remind = store.sets.length > 0 && (store.lastExportAt == null || Date.now() - store.lastExportAt > WEEK)

  async function startEmpty(name: string) {
    setError(null)
    setBanner(null)
    await store.startWorkout({ name, routineId: null, plannedExerciseIds: [] })
    setSelected(null)
    setPicking(true)
  }

  async function startRoutine(routineId: string) {
    const routine = store.routines.find((item) => item.id === routineId)
    if (!routine) return
    setError(null)
    setBanner(null)
    await store.startWorkout({
      name: routine.name,
      routineId: routine.id,
      plannedExerciseIds: routine.exerciseIds,
    })
    setSelected(routine.exerciseIds[0] ?? null)
    setPicking(false)
  }

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1>
          <Wordmark className="text-3xl" />
        </h1>
        <p className="mt-1 text-mist">Weightlifting log. Sets save on this device as you go.</p>
      </header>
      <InstallBanner onOpen={goMore} />
      {remind ? (
        <button
          type="button"
          data-testid="export-reminder"
          className="rounded-3xl border border-amber/40 bg-warnbg px-4 py-3 text-left text-sm leading-relaxed text-warn"
          onClick={goMore}
        >
          Export a copy often. This phone is the only place these workouts live.
        </button>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-badbg px-4 py-3 text-bad" role="alert">
          {error}
        </p>
      ) : null}
      {workout ? (
        <ActiveWorkout
          picking={picking}
          selected={selected}
          busy={busy}
          banner={banner}
          onPickMode={setPicking}
          onSelect={setSelected}
          onBanner={setBanner}
          onBusy={setBusy}
          onError={setError}
        />
      ) : (
        <StartList onEmpty={(name) => void startEmpty(name)} onRoutine={(id) => void startRoutine(id)} />
      )}
    </div>
  )
}

function StartList({ onEmpty, onRoutine }: { onEmpty: (name: string) => void; onRoutine: (id: string) => void }) {
  const { routines } = useStore()
  const [choice, setChoice] = useState('')
  const [name, setName] = useState(weekdayName())
  const nameInput = useRef<HTMLInputElement>(null)
  const sorted = routines.slice().sort((a, b) => a.name.localeCompare(b.name))
  const ready = choice === 'new' ? name.trim().length > 0 : choice.length > 0
  function choose(next: string) {
    setChoice(next)
    if (next === 'new') window.setTimeout(() => nameInput.current?.focus(), 0)
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-mist" data-testid="start-hint">
        {ready ? 'Ready to start.' : 'Pick a workout to start'}
      </p>
      <NativeSelect
        testId="workout-choice"
        label="Workout"
        value={choice}
        onChange={choose}
        options={[
          { value: '', label: 'Pick a workout' },
          { value: 'new', label: 'New workout' },
          ...sorted.map((routine) => ({ value: routine.id, label: routine.name })),
        ]}
      />
      {choice === 'new' ? (
        <div>
          <label htmlFor="new-workout-name" className="block text-sm font-medium text-cream">
            Name
          </label>
          <input
            id="new-workout-name"
            ref={nameInput}
            data-testid="new-workout-name"
            className="field mt-1 text-cream"
            value={name}
            maxLength={80}
            autoFocus
            autoComplete="off"
            enterKeyHint="done"
            inputMode="text"
            readOnly={false}
            disabled={false}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      ) : null}
      <Button
        data-testid="start-empty"
        disabled={!ready}
        onClick={() => {
          if (!ready) return
          unlockAudio()
          if (choice === 'new') onEmpty(name.trim())
          else onRoutine(choice)
        }}
      >
        Start workout
      </Button>
    </div>
  )
}

function ActiveWorkout({
  picking,
  selected,
  busy,
  banner,
  onPickMode,
  onSelect,
  onBanner,
  onBusy,
  onError,
}: {
  picking: boolean
  selected: string | null
  busy: boolean
  banner: { name: string; e1rm: number; previous: number | null } | null
  onPickMode: (open: boolean) => void
  onSelect: (id: string) => void
  onBanner: (banner: { name: string; e1rm: number; previous: number | null } | null) => void
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
}) {
  const store = useStore()
  const workout = useActiveWorkout()
  const now = useVisibleNow(workout != null && workout.finishedAt == null)
  if (!workout) return null
  const active = workout
  const paused = active.pausedAt != null
  const clock = paused && active.pausedAt != null ? active.pausedAt : now
  const elapsedSec = workoutDurationSec(active, clock)
  const pausedSec = pausedSeconds(active, now)
  const planned = active.plannedExerciseIds.filter((id) => store.exercises.some((exercise) => exercise.id === id))
  const exerciseId = selected && planned.includes(selected) ? selected : (planned[0] ?? null)
  const exercise = store.exercises.find((item) => item.id === exerciseId) ?? null

  async function addExercise(id: string) {
    const next = planned.includes(id) ? planned : [...planned, id]
    await store.updateWorkout(active.id, { plannedExerciseIds: next })
    onSelect(id)
    onPickMode(false)
    onBanner(null)
  }

  return (
    <div className="grid gap-3">
      <label className="block text-sm font-medium text-mist">
        Workout
        <input
          data-testid="workout-name"
          className="field mt-1 text-lg font-semibold"
          value={active.name}
          maxLength={80}
          onChange={(event) => {
            void store.updateWorkout(active.id, { name: event.target.value })
          }}
        />
      </label>
      <div className="rounded-3xl border border-line bg-panel px-4 py-3" data-testid="workout-timer">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-mist">{paused ? 'Paused' : 'Workout'}</p>
            <p className="font-mono text-4xl font-semibold" data-testid="workout-clock">
              {formatDuration(elapsedSec)}
            </p>
            <p className="text-sm text-mist" data-testid="paused-time">
              {formatDuration(pausedSec)} paused
            </p>
          </div>
          {paused ? (
            <button
              type="button"
              data-testid="resume-workout"
              className="min-h-14 rounded-2xl bg-amber px-5 text-lg font-semibold text-ink"
              onClick={() => void store.resumeWorkout(active.id)}
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              data-testid="pause-workout"
              className="min-h-14 rounded-2xl border border-line bg-panel2 px-5 text-lg font-semibold"
              onClick={() => void store.pauseWorkout(active.id)}
            >
              Pause
            </button>
          )}
        </div>
      </div>
      {picking ? (
        <ExercisePicker onPick={(id) => void addExercise(id)} onClose={() => onPickMode(false)} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {planned.map((id) => {
              const item = store.exercises.find((exercise) => exercise.id === id)
              if (!item) return null
              const on = id === exerciseId
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`exercise-chip-${id}`}
                  aria-pressed={on}
                  onClick={() => {
                    onSelect(id)
                    onBanner(null)
                  }}
                  className={cx(
                    'min-h-12 shrink-0 rounded-full px-4 font-semibold',
                    on ? 'bg-amber text-ink' : 'border border-line bg-panel text-cream',
                  )}
                >
                  {item.name}
                </button>
              )
            })}
            <button
              type="button"
              data-testid="add-exercise"
              onClick={() => onPickMode(true)}
              className="min-h-12 shrink-0 rounded-full border border-amber px-4 font-semibold text-ambertext"
            >
              Add
            </button>
          </div>
          {exercise ? (
            <Logger
              exercise={exercise}
              busy={busy}
              banner={banner}
              now={clock}
              paused={paused}
              onBanner={onBanner}
              onBusy={onBusy}
              onError={onError}
            />
          ) : (
            <Panel>
              <p className="text-mist">Add a lift, then log weight and reps. Each set is saved immediately.</p>
            </Panel>
          )}
          <Button
            variant="secondary"
            data-testid="save-template-live"
            onClick={() => {
              void store.saveTemplate(active.id)
            }}
          >
            Save as template
          </Button>
          {exerciseId ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-12 flex-1 rounded-2xl border border-line font-semibold disabled:opacity-40"
                disabled={planned.indexOf(exerciseId) <= 0}
                onClick={() =>
                  void store.updateWorkout(active.id, {
                    plannedExerciseIds: moveItem(planned, planned.indexOf(exerciseId), -1),
                  })
                }
              >
                Move up
              </button>
              <button
                type="button"
                className="min-h-12 flex-1 rounded-2xl border border-line font-semibold disabled:opacity-40"
                disabled={planned.indexOf(exerciseId) === planned.length - 1}
                onClick={() =>
                  void store.updateWorkout(active.id, {
                    plannedExerciseIds: moveItem(planned, planned.indexOf(exerciseId), 1),
                  })
                }
              >
                Move down
              </button>
              <button
                type="button"
                className="min-h-12 flex-1 rounded-2xl border border-line font-semibold"
                onClick={() => {
                  const hasSets = store.sets.some((set) => set.workoutId === active.id && set.exerciseId === exerciseId)
                  if (hasSets && !window.confirm('Remove this lift and its sets from this workout?')) return
                  void store.removeExerciseFromWorkout(active.id, exerciseId)
                }}
              >
                Remove lift
              </button>
            </div>
          ) : null}
          <Button
            variant="secondary"
            data-testid="finish-workout"
            onClick={() => {
              void store.finishWorkout(active.id)
              onBanner(null)
            }}
          >
            End workout
          </Button>
        </>
      )}
    </div>
  )
}

function Logger({
  exercise,
  busy,
  banner,
  now,
  paused,
  onBanner,
  onBusy,
  onError,
}: {
  exercise: Exercise
  busy: boolean
  banner: { name: string; e1rm: number; previous: number | null } | null
  now: number
  paused: boolean
  onBanner: (banner: { name: string; e1rm: number; previous: number | null } | null) => void
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
}) {
  const store = useStore()
  const workout = useActiveWorkout()
  const unit = store.settings.unit
  const recalled = workout ? previousSessionSets(store.sets, exercise.id, workout.id) : []
  const recent = recalled[recalled.length - 1]
  const recallKey = `${exercise.id}:${unit}:${recent?.id ?? 'none'}`
  const [draft, setDraft] = useState({ key: '', weight: '0', reps: '5' })
  if (draft.key !== recallKey) {
    setDraft({
      key: recallKey,
      weight: recent ? formatNumber(toUnit(recent.weight, recent.unit, unit)) : '0',
      reps: recent ? String(recent.reps) : '5',
    })
  }
  const storedNote = store.notes.find((note) => note.exerciseId === exercise.id)?.text ?? ''
  const [noteState, setNoteState] = useState({ id: exercise.id, text: storedNote })
  if (noteState.id !== exercise.id) setNoteState({ id: exercise.id, text: storedNote })

  const step = stepFor(exercise.equipment, store.settings)
  const stepName = exercise.equipment === 'dumbbell' ? 'Dumbbell' : 'Plate'
  const weight = parseWeight(draft.weight)
  const reps = parseReps(draft.reps)
  const preview = weight != null && reps != null ? e1rmInUnit(weight, unit, reps, unit) : null
  const sessionSets = store.sets
    .filter((set) => set.workoutId === workout?.id && set.exerciseId === exercise.id)
    .sort((a, b) => a.order - b.order)
  const records = prSetIds(store.sets)
  const ends = workout?.restEndsAt ?? null
  const remaining = ends != null ? Math.max(0, ends - now) : 0
  const setStartedAt = workout?.setStartedAt ?? null
  const setElapsed = setStartedAt ? Math.max(0, Math.round((now - setStartedAt) / 1000)) : (workout?.pendingSetSec ?? 0)
  const chimed = useRef<number | null>(null)
  const milestone = useRef<number | null>(null)
  useEffect(() => {
    if (paused || !workout || !ends || now < ends) return
    if (chimed.current === ends) return
    chimed.current = ends
    if (!store.settings.muted) playChime(store.settings.chime)
    if (store.settings.vibrate) pulseVibrate()
    void store.updateWorkout(workout.id, { restEndsAt: null })
  }, [ends, now, paused, store, workout])
  useEffect(() => {
    if (!setStartedAt || !store.settings.setMilestoneChime) {
      milestone.current = null
      return
    }
    const mark = Math.floor(setElapsed / 30)
    if (milestone.current == null) {
      milestone.current = mark
      return
    }
    if (mark > milestone.current) {
      milestone.current = mark
      if (!store.settings.muted && mark > 0) playChime(store.settings.chime, true)
    }
  }, [setElapsed, setStartedAt, store.settings.chime, store.settings.muted, store.settings.setMilestoneChime])

  function bumpWeight(direction: 1 | -1) {
    const next = stepWeight(weight ?? 0, step, direction)
    setDraft({ ...draft, weight: formatNumber(next) })
  }

  function bumpReps(direction: 1 | -1) {
    const start = reps ?? (direction > 0 ? 0 : 2)
    const next = Math.min(100, Math.max(1, start + direction))
    setDraft({ ...draft, reps: String(next) })
  }

  async function log() {
    if (!workout || weight == null || reps == null || busy) return
    onBusy(true)
    onError(null)
    try {
      const result = await store.logSet({ workoutId: workout.id, exerciseId: exercise.id, weight, reps })
      if (result.kind === 'record' && result.e1rm != null) {
        onBanner({ name: exercise.name, e1rm: result.e1rm, previous: result.previous })
      } else {
        onBanner(null)
      }
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'The set could not be saved.')
    } finally {
      onBusy(false)
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void log()
      }}
    >
      <Panel>
        <h2 className="text-lg font-semibold">{exercise.name}</h2>
        <p className="mt-1 text-sm text-mist">
          {equipmentLabel(exercise.equipment)} · {muscleLabel(exercise.primary)}
          {exercise.secondary.length ? ` · secondary ${exercise.secondary.map(muscleLabel).join(', ')}` : ''}
        </p>
        <label className="mt-3 block text-sm font-medium text-mist">
          Machine setup
          <textarea
            data-testid="machine-note"
            className="field mt-1 min-h-20"
            placeholder="Seat height, pin, pad"
            value={noteState.text}
            onChange={(event) => {
              const text = event.target.value
              setNoteState({ id: exercise.id, text })
              void store.saveNote(exercise.id, text)
            }}
          />
        </label>
      </Panel>
      <p className="rounded-2xl bg-panel px-4 py-3 text-sm leading-relaxed" data-testid="last-sets">
        {recalled.length === 0
          ? 'No earlier sets for this lift.'
          : `Last time · ${formatDay(recalled[0].createdAt)} · ${recalled
              .map((set) => `${formatNumber(toUnit(set.weight, set.unit, unit))} ${unit} × ${set.reps}`)
              .join(', ')}`}
      </p>
      {banner && banner.name === exercise.name ? (
        <div className="rounded-3xl bg-goodbg px-4 py-3 text-good" data-testid="pr-banner" role="status">
          <p className="text-lg font-semibold">New estimated 1RM</p>
          <p className="mt-1">
            {exercise.name} · {formatNumber(banner.e1rm)} {unit}
            {banner.previous != null ? ` · previous ${formatNumber(banner.previous)} ${unit}` : ''}
          </p>
          <p className="mt-1 text-sm">Epley: weight × (1 + reps ÷ 30).</p>
          <p className="mt-1 text-sm" data-testid="safety-reminder">
            Informational only. Never push through pain.
          </p>
        </div>
      ) : null}
      {remaining > 0 && workout ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-amber/50 bg-panel px-4 py-3" data-testid="rest-timer">
          <p className="font-mono text-3xl font-semibold text-ambertext">{formatClock(remaining)}</p>
          <button
            type="button"
            className="min-h-12 px-3 font-semibold"
            onClick={() => void store.updateWorkout(workout.id, { restEndsAt: null })}
          >
            Skip rest
          </button>
        </div>
      ) : null}
      {workout ? (
        <div className="rounded-3xl border border-line bg-panel px-4 py-3" data-testid="set-timer">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-mist">Set</p>
              <p className="font-mono text-4xl font-semibold">{formatDuration(setElapsed)}</p>
            </div>
            {setStartedAt ? (
              <button
                type="button"
                data-testid="stop-set-timer"
                className="min-h-14 rounded-2xl bg-amber px-5 text-lg font-semibold text-ink"
                onClick={() => {
                  unlockAudio()
                  void store.stopSetTimer(workout.id)
                }}
              >
                Stop set
              </button>
            ) : (
              <button
                type="button"
                data-testid="start-set-timer"
                disabled={paused}
                className="min-h-14 rounded-2xl border border-line bg-panel2 px-5 text-lg font-semibold disabled:opacity-40"
                onClick={() => {
                  unlockAudio()
                  void store.startSetTimer(workout.id)
                }}
              >
                Start set
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {REST_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                data-testid={`rest-preset-${sec}`}
                aria-pressed={store.settings.restSeconds === sec}
                className={
                  store.settings.restSeconds === sec
                    ? 'min-h-12 rounded-2xl bg-amber font-semibold text-ink'
                    : 'min-h-12 rounded-2xl border border-line font-semibold'
                }
                onClick={() => void store.saveSettings({ ...store.settings, restSeconds: sec })}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] items-center gap-2">
        <IconStep label="Decrease weight" testId="weight-minus" onClick={() => bumpWeight(-1)} />
        <label className="block text-center text-sm text-mist">
          Weight ({unit})
          <input
            data-testid="weight-value"
            className="stepper-value mt-1"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Weight"
            value={draft.weight}
            onChange={(event) => setDraft({ ...draft, weight: event.target.value })}
          />
        </label>
        <IconStep label="Increase weight" testId="weight-plus" onClick={() => bumpWeight(1)} />
      </div>
      <p className="text-center text-sm text-mist" data-testid="weight-step">
        {stepName} step {formatNumber(step)} {unit}
      </p>
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] items-center gap-2">
        <IconStep label="Decrease reps" testId="reps-minus" onClick={() => bumpReps(-1)} />
        <label className="block text-center text-sm text-mist">
          Reps
          <input
            data-testid="reps-value"
            className="stepper-value mt-1"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Reps"
            value={draft.reps}
            onChange={(event) => setDraft({ ...draft, reps: event.target.value })}
          />
        </label>
        <IconStep label="Increase reps" testId="reps-plus" onClick={() => bumpReps(1)} />
      </div>
      <p className="text-center font-mono text-lg" data-testid="e1rm-preview">
        {preview == null ? 'Est. 1RM —' : `Est. 1RM ${formatNumber(preview)} ${unit}`}
      </p>
      <Button type="submit" data-testid="log-set" disabled={paused || busy || weight == null || reps == null}>
        {busy ? 'Saving…' : 'Log set'}
      </Button>
      {sessionSets.length ? (
        <ul className="grid gap-2" data-testid="session-sets">
          {sessionSets.map((set, index) => {
            const e1rm = e1rmInUnit(set.weight, set.unit, set.reps, unit)
            return (
              <li key={set.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-3 py-2">
                <span className="font-mono text-lg">
                  {index + 1}. {formatNumber(toUnit(set.weight, set.unit, unit))} {unit} × {set.reps}
                  {set.durationSec != null ? ` · ${formatDuration(set.durationSec)}` : ''}
                </span>
                <span className="text-sm text-mist">
                  {e1rm == null ? '' : `${formatNumber(e1rm)} ${unit} e1RM`}
                  {records.has(set.id) ? ' · PR' : ''}
                </span>
                <button type="button" className="min-h-12 px-2 text-sm font-semibold text-mist" onClick={() => void store.deleteSet(set.id)}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </form>
  )
}

function IconStep({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
  const plus = label.startsWith('Increase')
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex size-[4.75rem] items-center justify-center rounded-2xl border border-line bg-panel2 text-3xl font-semibold text-ambertext"
    >
      {plus ? '+' : '−'}
    </button>
  )
}

function useVisibleNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    let timer = 0
    const tick = () => {
      setNow(Date.now())
      if (document.hidden) return
      timer = window.setTimeout(tick, 1000)
    }
    const onVisibility = () => {
      window.clearTimeout(timer)
      tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    tick()
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [running])
  return now
}
