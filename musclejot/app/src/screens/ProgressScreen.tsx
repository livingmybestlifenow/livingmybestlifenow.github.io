import { useState } from 'react'
import { formatDay, formatNumber, localDateKey } from '../format'
import { isStalled, muscleCredit, prCount, sessionPeaks, trainingStreak, volumeBetween, weekRange } from '../logic'
import { useStore } from '../store'
import { muscleLabel } from '../types'
import { Panel } from '../ui'

export function ProgressScreen() {
  const { exercises, workouts, sets, settings } = useStore()
  const range = weekRange(new Date())
  const volume = volumeBetween(sets, settings.unit, range.start, range.end)
  const streak = trainingStreak(
    sets.map((set) => localDateKey(set.createdAt)),
    new Date(),
  )
  const records = prCount(sets)
  const credit = muscleCredit(sets, exercises, settings.unit, range.start, range.end)
  const flagged = exercises
    .map((exercise) => {
      const peaks = sessionPeaks(sets, exercise.id, settings.unit, workouts)
      return { exercise, peaks, stalled: isStalled(peaks.map((peak) => peak.e1rm), settings.stallSessions) }
    })
    .filter((row) => row.stalled)
  const withData = exercises.filter((exercise) => sets.some((set) => set.exerciseId === exercise.id))
  const latest = sets.slice().sort((a, b) => b.createdAt - a.createdAt)[0]
  const [chosen, setChosen] = useState<string | null>(null)
  const chartId = chosen && withData.some((exercise) => exercise.id === chosen) ? chosen : (latest?.exerciseId ?? withData[0]?.id ?? '')
  const chartExercise = exercises.find((exercise) => exercise.id === chartId) ?? null
  const peaks = chartExercise ? sessionPeaks(sets, chartExercise.id, settings.unit, workouts) : []

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm leading-relaxed text-mist">Estimated 1RM uses Epley: weight × (1 + reps ÷ 30).</p>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Stat testId="weekly-volume" label="This week" value={`${formatNumber(volume)} ${settings.unit}`} />
        <Stat testId="streak" label="Streak" value={streak === 1 ? '1 day' : `${streak} days`} />
        <Stat testId="pr-count" label="PRs" value={String(records)} />
      </div>
      <Panel>
        <h2 className="text-lg font-semibold">Muscle credit</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Primary muscles get the full set. Secondary muscles get half. This is a log of the tags on each lift.
        </p>
        <ul className="mt-3 grid gap-1" data-testid="muscle-credit">
          {credit.length === 0 ? <li className="text-sm text-mist">No loaded sets this week.</li> : null}
          {credit.map((row) => (
            <li key={row.muscle} className="flex justify-between gap-3 font-mono">
              <span>{muscleLabel(row.muscle)}</span>
              <span>
                {formatNumber(row.volume)} {settings.unit}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Stall radar</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          A lift is listed when its estimated 1RM is not higher across the last {settings.stallSessions} sessions. This is a
          record of the numbers, not a suggestion.
        </p>
        {flagged.length === 0 ? (
          <p className="mt-3 text-sm text-mist" data-testid="stall-empty">
            No lift is flagged.
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {flagged.map((row) => (
              <article key={row.exercise.id} data-testid="stall-flag" className="rounded-2xl bg-warnbg px-3 py-3 text-warn">
                <h3 className="font-semibold">{row.exercise.name}</h3>
                <p className="mt-1 text-sm leading-relaxed">
                  No estimated 1RM increase across the last {settings.stallSessions} sessions.
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Estimated 1RM</h2>
        {withData.length === 0 ? (
          <p className="mt-2 text-sm text-mist">Log a few workouts and the chart will show one point per session.</p>
        ) : (
          <>
            <label className="mt-3 block text-sm font-medium text-mist">
              Lift
              <select
                data-testid="chart-exercise"
                className="field mt-1"
                value={chartId}
                onChange={(event) => setChosen(event.target.value)}
              >
                {withData
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
              </select>
            </label>
            <E1rmChart points={peaks.map((peak) => ({ label: formatDay(peak.at), y: peak.e1rm }))} unit={settings.unit} />
          </>
        )}
      </Panel>
    </div>
  )
}

function Stat({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-2 py-3 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-mist">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold" data-testid={testId}>
        {value}
      </p>
    </div>
  )
}

function E1rmChart({ points, unit }: { points: { label: string; y: number }[]; unit: string }) {
  const width = 320
  const height = 168
  const padX = 16
  const padY = 16
  if (points.length === 0) return <p className="mt-3 text-sm text-mist">No estimated 1RM yet for this lift.</p>
  const values = points.map((point) => point.y)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2)
    const y = padY + (1 - (point.y - min) / span) * (height - padY * 2)
    return { label: point.label, value: point.y, x, y }
  })
  const best = Math.max(...values)
  return (
    <div className="mt-3">
      <p className="font-mono text-lg" data-testid="best-e1rm">
        Best {formatNumber(best)} {unit}
      </p>
      <svg
        data-testid="progress-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Estimated 1RM by session"
        className="mt-2 h-40 w-full"
      >
        <polyline
          fill="none"
          stroke="#f0b429"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
        />
        {coords.map((point) => (
          <circle key={`${point.label}-${point.y}`} cx={point.x} cy={point.y} r="4.5" fill="#f4f1e6" stroke="#f0b429" strokeWidth="2" />
        ))}
      </svg>
      <p className="text-sm leading-relaxed text-mist" data-testid="chart-summary">
        {coords.map((point) => `${point.label}: ${formatNumber(point.value)} ${unit}`).join(' · ')}
      </p>
    </div>
  )
}
