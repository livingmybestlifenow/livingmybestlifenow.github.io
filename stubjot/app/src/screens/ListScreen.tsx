import { useMemo, useState } from 'react'
import { downloadCsv, exportMessage } from '../backup'
import { InstallBanner } from '../install'
import { monthKeyOf, formatDay, formatMoney, formatMonth } from '../format'
import type { Route } from '../route'
import { useStore } from '../store'
import { CATEGORIES, categoryLabel, DISCLAIMER, type CategoryId, type Receipt } from '../types'
import { Button, Panel, PhotoView } from '../ui'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function ListScreen({
  flash,
  go,
}: {
  flash?: string
  go: (route: Route) => void
}) {
  const { receipts, ready, loadError, lastExportAt, reload, markExported, retry } = useStore()
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('all')
  const [category, setCategory] = useState<'all' | CategoryId>('all')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const months = useMemo(() => {
    const keys = new Set(receipts.map((receipt) => monthKeyOf(receipt.date, receipt.createdAt)))
    return [...keys].sort().reverse()
  }, [receipts])

  const visible = receipts.filter((receipt) => matches(receipt, query, month, category, unverifiedOnly))
  const unverified = receipts.filter((receipt) => !receipt.verified).length
  const remind = receipts.length > 0 && (lastExportAt == null || Date.now() - lastExportAt > WEEK)

  async function exportAll() {
    setExportError(null)
    try {
      const result = await downloadCsv(receipts)
      if (result !== 'canceled') {
        await markExported()
        await reload()
      }
      setExportStatus(exportMessage(result, 'csv'))
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export the CSV.')
    }
  }

  if (loadError) {
    return (
      <Panel>
        <p role="alert">{loadError}</p>
        <div className="mt-4">
          <Button onClick={retry}>Try again</Button>
        </div>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <p className="text-sm font-semibold tracking-wide text-ambertext uppercase">StubJot</p>
        <h1 className="text-3xl font-semibold tracking-tight">Receipts</h1>
        <p className="mt-1 text-mist">Photos stay on this phone. Nothing is uploaded.</p>
      </header>
      {flash ? (
        <p className="rounded-2xl bg-goodbg px-4 py-3 text-good" role="status">
          {flash}
        </p>
      ) : null}
      <InstallBanner onOpen={() => go({ name: 'more' })} />
      {remind ? (
        <Panel className="border-amber/50">
          <p className="font-medium">Export a copy often. This phone is the only place these receipts live.</p>
          <div className="mt-3">
            <Button onClick={() => void exportAll()}>Download CSV</Button>
          </div>
          {exportStatus ? (
            <p className="mt-3 text-good" role="status">
              {exportStatus}
            </p>
          ) : null}
          {exportError ? (
            <p className="mt-3 text-bad" role="alert">
              {exportError}
            </p>
          ) : null}
        </Panel>
      ) : null}
      {unverified > 0 ? (
        <p className="text-sm text-warn">
          {unverified === 1 ? '1 receipt is unverified.' : `${unverified} receipts are unverified.`} Confirm the amount,
          date, vendor, and category when you can.
        </p>
      ) : null}
      <div className="grid gap-3">
        <label className="block text-sm font-medium text-mist">
          Search receipts
          <input
            className="field mt-1"
            value={query}
            placeholder="Vendor, note, or amount"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-mist">
            Month
            <select className="field mt-1" value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="all">All months</option>
              {months.map((key) => (
                <option key={key} value={key}>
                  {formatMonth(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-mist">
            Category
            <select
              className="field mt-1"
              value={category}
              onChange={(event) => setCategory(event.target.value as 'all' | CategoryId)}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className={
            unverifiedOnly
              ? 'min-h-12 rounded-2xl border border-amber bg-panel2 px-3 font-semibold'
              : 'min-h-12 rounded-2xl border border-line px-3 font-semibold'
          }
          aria-pressed={unverifiedOnly}
          onClick={() => setUnverifiedOnly((value) => !value)}
        >
          Unverified only
        </button>
      </div>
      {!ready ? <p className="text-mist">Opening receipts on this device…</p> : null}
      {ready && receipts.length === 0 ? (
        <Panel>
          <h2 className="text-xl font-semibold">No receipts yet</h2>
          <p className="mt-2 leading-relaxed text-mist">
            Take a photo and it is saved on this phone before anything reads it.
          </p>
          <div className="mt-4">
            <Button onClick={() => go({ name: 'capture', file: null, draft: null })}>Take a photo</Button>
          </div>
        </Panel>
      ) : null}
      {ready && receipts.length > 0 && visible.length === 0 ? <p className="text-mist">Nothing matches.</p> : null}
      <div className="grid gap-3">
        {visible.map((receipt) => (
          <ReceiptRow key={receipt.id} receipt={receipt} onOpen={() => go({ name: 'detail', id: receipt.id })} />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  )
}

function matches(
  receipt: Receipt,
  query: string,
  month: string,
  category: 'all' | CategoryId,
  unverifiedOnly: boolean,
): boolean {
  if (month !== 'all' && monthKeyOf(receipt.date, receipt.createdAt) !== month) return false
  if (category !== 'all' && receipt.category !== category) return false
  if (unverifiedOnly && receipt.verified) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    receipt.vendor,
    receipt.note,
    receipt.category,
    categoryLabel(receipt.category),
    receipt.amountCents == null ? '' : (receipt.amountCents / 100).toFixed(2),
    receipt.date ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return needle.split(/\s+/).every((part) => hay.includes(part))
}

function ReceiptRow({ receipt, onOpen }: { receipt: Receipt; onOpen: () => void }) {
  const title = receipt.vendor.trim() || 'Untitled receipt'
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-3xl border border-line bg-panel p-4 text-left">
      <div className="flex items-start gap-3">
        <PhotoView
          photoId={receipt.photoId}
          alt=""
          className="size-16 shrink-0 rounded-2xl object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="font-medium">{title}</span>
            {receipt.verified ? null : <span className="shrink-0 text-sm font-semibold text-warn">Unverified</span>}
          </span>
          <span className="mt-1 block text-sm text-mist">
            {formatDay(receipt.date, receipt.createdAt)} · {categoryLabel(receipt.category)}
          </span>
          <span className="mt-2 block font-mono text-lg">{formatMoney(receipt.amountCents)}</span>
        </span>
      </div>
    </button>
  )
}
