import { useEffect, useState } from 'react'
import { deleteReceipt, getReceipt } from '../db'
import { formatDay, formatMoney } from '../format'
import type { Route } from '../route'
import { useStore } from '../store'
import { categoryLabel, DISCLAIMER, type Receipt } from '../types'
import { Button, PhotoView } from '../ui'

export function DetailScreen({ id, go }: { id: string; go: (route: Route) => void }) {
  const { reload } = useStore()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getReceipt(id)
      .then((row) => {
        if (cancelled) return
        if (!row) setMissing(true)
        else setReceipt(row)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'That receipt could not be opened.')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function remove() {
    setBusy(true)
    try {
      await deleteReceipt(id)
      await reload()
      go({ name: 'list', flash: 'Receipt deleted from this device.' })
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : 'The receipt could not be deleted.')
    }
  }

  if (missing) {
    return (
      <div className="grid gap-4 pt-2">
        <p>That receipt is not on this device.</p>
        <Button onClick={() => go({ name: 'list' })}>Back to receipts</Button>
      </div>
    )
  }
  if (!receipt) return <p className="pt-6 text-mist">{error ?? 'Opening the receipt…'}</p>
  const title = receipt.vendor.trim() || 'Untitled receipt'
  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <button type="button" className="min-h-12 text-sm font-semibold text-ambertext" onClick={() => go({ name: 'list' })}>
          Receipts
        </button>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {receipt.verified ? null : <span className="text-sm font-semibold text-warn">Unverified</span>}
        </div>
      </header>
      <PhotoView photoId={receipt.photoId} alt={`Receipt photo for ${title}`} className="max-h-[28rem] w-full rounded-3xl" />
      <dl className="grid gap-3 rounded-3xl border border-line bg-panel p-4">
        <div>
          <dt className="text-sm text-mist">Amount</dt>
          <dd className="font-mono text-2xl">{formatMoney(receipt.amountCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-mist">Date</dt>
          <dd>{formatDay(receipt.date, receipt.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-sm text-mist">Category</dt>
          <dd>{categoryLabel(receipt.category)}</dd>
        </div>
        {receipt.note ? (
          <div>
            <dt className="text-sm text-mist">Note</dt>
            <dd>{receipt.note}</dd>
          </div>
        ) : null}
      </dl>
      {error ? (
        <p className="text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Button onClick={() => go({ name: 'edit', id })}>Edit</Button>
      {confirming ? (
        <div className="grid gap-3 rounded-3xl border border-bad/40 bg-badbg p-4">
          <p>Delete this receipt and its photo from this device? This cannot be undone.</p>
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>
            Delete receipt
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
      <p className="text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  )
}
