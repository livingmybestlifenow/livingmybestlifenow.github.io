import { useState } from 'react'
import { downloadCsv, downloadPhotoZip, exportMessage } from '../backup'
import { deleteEverything } from '../db'
import { monthKeyOf, todayISO } from '../format'
import { InstallCard, isIos } from '../install'
import { useStore } from '../store'
import { DISCLAIMER, type Receipt } from '../types'
import { Button, Panel } from '../ui'

type Range = 'all' | 'month' | 'year'

export function MoreScreen() {
  const { receipts, lastExportAt, persistent, usageLabel, reload, markExported } = useStore()
  const [range, setRange] = useState<Range>('all')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))

  const chosen = receipts.filter((receipt) => inRange(receipt, range))

  async function exportCsv() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const result = await downloadCsv(chosen)
      if (result !== 'canceled') await markExported()
      setStatus(exportMessage(result, 'csv'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export the CSV.')
    } finally {
      setBusy(false)
    }
  }

  async function exportZip() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const result = await downloadPhotoZip(receipts)
      if (result !== 'canceled' && result !== 'empty') await markExported()
      setStatus(exportMessage(result, 'zip'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export the photos.')
    } finally {
      setBusy(false)
    }
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('stubjot-theme', next)
    } catch {
      /* theme still applies for this visit */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f3efe4' : '#12140f')
    setTheme(next)
  }

  async function wipe() {
    setBusy(true)
    try {
      await deleteEverything()
      await reload()
      setArmed(false)
      setStatus('All receipts and photos were deleted from this device.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The receipts could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">More</h1>
        <p className="mt-1 text-mist">Export a copy often. This phone is the only place these receipts live.</p>
      </header>
      {status ? (
        <p className="rounded-2xl bg-goodbg px-4 py-3 text-good" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-badbg px-4 py-3 text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Panel>
        <h2 className="text-lg font-semibold">Download CSV</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          Columns: date, vendor, category, amount, note, verified, created, photo, id. The file name starts with stubjot-.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ['all', 'All'],
              ['month', 'This month'],
              ['year', 'This year'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={
                range === key
                  ? 'min-h-12 rounded-2xl border border-amber bg-panel2 px-2 font-semibold'
                  : 'min-h-12 rounded-2xl border border-line px-2 font-semibold'
              }
              onClick={() => setRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-mist">
          {chosen.length === 1 ? '1 receipt' : `${chosen.length} receipts`}
          {lastExportAt ? ` · last export ${new Date(lastExportAt).toLocaleDateString()}` : ' · no export yet'}
        </p>
        {isIos() ? <p className="mt-2 text-sm text-mist">On iPhone, the share sheet opens so you can save the file to Files.</p> : null}
        <div className="mt-3">
          <Button disabled={busy || chosen.length === 0} onClick={() => void exportCsv()}>
            Download CSV
          </Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">Photo ZIP</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">Optional. The photos are already on this phone. The ZIP is a second copy you can move.</p>
        <div className="mt-3">
          <Button variant="secondary" disabled={busy || receipts.every((receipt) => !receipt.photoId)} onClick={() => void exportZip()}>
            Download photo ZIP
          </Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">On this device</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {usageLabel ? `${usageLabel} used by this site on this device, including the app itself.` : 'Storage size is unavailable in this browser.'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {persistent
            ? 'Storage protection is on. The browser has been asked to keep this data.'
            : 'Storage protection is not on yet. Export a copy so a browser cleanup cannot take the only records.'}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
        </div>
      </Panel>
      <InstallCard />
      <Panel>
        <h2 className="text-lg font-semibold">Delete everything</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist">
          This removes every receipt and photo from this device. The installed app stays.
        </p>
        {armed ? (
          <div className="mt-3 grid gap-3">
            <Button variant="danger" disabled={busy} onClick={() => void wipe()}>
              Yes, delete all receipts
            </Button>
            <Button variant="secondary" onClick={() => setArmed(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button variant="danger" onClick={() => setArmed(true)}>
              Delete everything on this device
            </Button>
          </div>
        )}
      </Panel>
      <p className="text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  )
}

function inRange(receipt: Receipt, range: Range): boolean {
  if (range === 'all') return true
  const key = monthKeyOf(receipt.date, receipt.createdAt)
  const today = todayISO()
  if (range === 'month') return key === today.slice(0, 7)
  return key.slice(0, 4) === today.slice(0, 4)
}
