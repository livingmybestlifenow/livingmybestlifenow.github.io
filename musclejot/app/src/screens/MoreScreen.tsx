import { useState } from 'react'
import { playChime, unlockAudio } from '../chime'
import { csvFilename, setsToCsv } from '../csv'
import { InstallCard, isIos } from '../install'
import { cleanSettings } from '../logic'
import { deliverFile } from '../share'
import { useStore } from '../store'
import { CHIMES, REST_PRESETS, type ChimeId, type Settings, type Unit } from '../types'
import { BUILD_LABEL } from '../build'
import { NativeSelect } from '../native-select'
import { Button, Panel, SafetyPoints } from '../ui'

export function MoreScreen() {
  const store = useStore()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  const { settings } = store
  const plateKey = settings.unit === 'kg' ? 'plateStepKg' : 'plateStepLb'
  const dumbbellKey = settings.unit === 'kg' ? 'dumbbellStepKg' : 'dumbbellStepLb'

  function save(patch: Partial<Settings>) {
    void store.saveSettings(cleanSettings({ ...settings, ...patch }))
  }

  async function exportCsv() {
    setBusy(true)
    setError(null)
    try {
      const name = csvFilename()
      const csv = setsToCsv(store.sets, store.workouts, store.exercises, store.notes, settings.unit)
      const result = await deliverFile(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      if (result === 'canceled') return
      await store.markExported()
      setStatus(result === 'shared' ? `Shared ${name}` : `Downloaded ${name}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The CSV could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    setTheme(next)
    try {
      localStorage.setItem('musclejot-theme', next)
    } catch {
      /* theme still applies for this visit */
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', next === 'light' ? '#f3efe4' : '#12140f')
  }

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-semibold tracking-tight">More</h1>
        <p className="mt-1 text-mist">Export a copy often. This phone is the only place these workouts live.</p>
        <p className="mt-2 text-xs text-faint" data-testid="build-label">
          Build {BUILD_LABEL}
        </p>
      </header>
      {status ? (
        <p className="rounded-2xl bg-goodbg px-4 py-3 text-good" role="status" data-testid="export-status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-badbg px-4 py-3 text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Panel>
        <h2 className="text-lg font-semibold">Units and steps</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Weights on screen use this unit. Logged sets keep the unit they were saved in, and the + and − buttons follow the plate or dumbbell step for the unit you pick.
        </p>
        <div className="mt-3">
          <NativeSelect
            testId="weight-unit"
            label="Weight unit"
            value={settings.unit}
            onChange={(next) => {
              const unit: Unit = next === 'kg' ? 'kg' : 'lb'
              save({ unit })
            }}
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
          />
        </div>
        <div className="mt-3 grid gap-3">
          <NumberField
            testId="plate-step"
            label={`Plate step (${settings.unit})`}
            value={settings[plateKey]}
            onChange={(value) => save({ [plateKey]: value })}
          />
          <NumberField
            testId="dumbbell-step"
            label={`Dumbbell step (${settings.unit})`}
            value={settings[dumbbellKey]}
            onChange={(value) => save({ [dumbbellKey]: value })}
          />
          <div className="grid grid-cols-4 gap-2">
            {REST_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                data-testid={`rest-preset-${sec}`}
                aria-pressed={settings.restSeconds === sec}
                className={
                  settings.restSeconds === sec
                    ? 'min-h-12 rounded-2xl bg-amber font-semibold text-ink'
                    : 'min-h-12 rounded-2xl border border-line font-semibold'
                }
                onClick={() => save({ restSeconds: sec })}
              >
                {sec}s
              </button>
            ))}
          </div>
          <NumberField
            testId="rest-seconds"
            label="Custom rest seconds"
            value={settings.restSeconds}
            onChange={(value) => save({ restSeconds: value })}
          />
          <Toggle
            testId="rest-autostart"
            label="Start rest when a set is stopped or logged"
            on={settings.restAutoStart}
            onClick={() => save({ restAutoStart: !settings.restAutoStart })}
          />
          <NumberField
            testId="stall-sessions"
            label="Stall window (sessions)"
            value={settings.stallSessions}
            onChange={(value) => save({ stallSessions: value })}
          />
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Timer tone</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">Soft chimes are made in the browser. Nothing is downloaded.</p>
        <div className="mt-3 grid gap-3" data-testid="chime-panel">
          <NativeSelect
            testId="chime"
            label="Chime"
            value={settings.chime}
            onChange={(next) => save({ chime: next as ChimeId })}
            options={CHIMES.map((chime) => ({ value: chime.id, label: chime.label }))}
          />
          <Button
            variant="secondary"
            data-testid="chime-preview"
            onClick={() => {
              unlockAudio()
              playChime(settings.chime)
            }}
          >
            Preview chime
          </Button>
          <Toggle testId="mute" label="Mute timer chimes" on={settings.muted} onClick={() => save({ muted: !settings.muted })} />
          <Toggle
            testId="vibrate"
            label="Vibrate when rest ends"
            on={settings.vibrate}
            onClick={() => save({ vibrate: !settings.vibrate })}
          />
          <Toggle
            testId="set-milestones"
            label="Quiet chime every 30 seconds of a set"
            on={settings.setMilestoneChime}
            onClick={() => save({ setMilestoneChime: !settings.setMilestoneChime })}
          />
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Download CSV</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Every set, any time, in the unit selected above. The file also keeps the weight and unit that were logged. The file name starts with musclejot-. History in the app is never locked.
        </p>
        <p className="mt-2 text-sm text-mist">
          {store.sets.length === 1 ? '1 set' : `${store.sets.length} sets`}
          {store.lastExportAt ? ` · last export ${new Date(store.lastExportAt).toLocaleDateString()}` : ' · no export yet'}
        </p>
        {isIos() ? <p className="mt-2 text-sm text-mist">On iPhone, the share sheet opens so you can save the file to Files.</p> : null}
        <div className="mt-3">
          <Button data-testid="export-csv" disabled={busy || store.sets.length === 0} onClick={() => void exportCsv()}>
            Download CSV
          </Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">On this device</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {store.usageLabel ? `${store.usageLabel} used by this site on this device, including the app itself.` : 'Storage size is unavailable in this browser.'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist" data-testid="storage-status">
          {store.persistent
            ? 'Storage protection is on. The browser has been asked to keep this data.'
            : 'Storage protection is not on yet. Export a copy so a browser cleanup cannot take the only records.'}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </Button>
        </div>
      </Panel>
      <InstallCard />
      <Panel>
        <h2 className="text-lg font-semibold">Safety</h2>
        <div className="mt-3 text-sm" data-testid="safety-section">
          <SafetyPoints />
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Delete everything</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">This removes workouts, sets, routines, and custom exercises from this device.</p>
        {armed ? (
          <div className="mt-3 grid gap-3">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void store
                  .wipe()
                  .then(() => {
                    setArmed(false)
                    setStatus('Everything was deleted from this device.')
                  })
                  .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'The log could not be deleted.'))
                  .finally(() => setBusy(false))
              }}
            >
              Yes, delete the log
            </Button>
            <Button variant="secondary" onClick={() => setArmed(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button variant="danger" onClick={() => setArmed(true)}>
              Delete everything
            </Button>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Toggle({ testId, label, on, onClick }: { testId: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={on} onClick={onClick} className="flex min-h-12 items-center justify-between gap-3 text-left">
      <span>{label}</span>
      <span className={on ? 'font-semibold text-ambertext' : 'text-mist'}>{on ? 'On' : 'Off'}</span>
    </button>
  )
}

function NumberField({
  testId,
  label,
  value,
  onChange,
}: {
  testId: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-sm font-medium text-mist">
      {label}
      <input
        data-testid={testId}
        className="field mt-1 font-mono"
        inputMode="decimal"
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}
