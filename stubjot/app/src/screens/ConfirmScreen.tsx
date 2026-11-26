import { useEffect, useState } from 'react'
import { getReceipt, saveReceipt } from '../db'
import { draftFromReceipt, parseAmount } from '../format'
import type { Route } from '../route'
import { useStore } from '../store'
import { CONFIRM_NOTE, DISCLAIMER, type Draft, type Receipt } from '../types'
import { Button, PhotoView, ReceiptFields } from '../ui'

export function ConfirmScreen({ id, go }: { id: string; go: (route: Route) => void }) {
  const { reload } = useStore()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getReceipt(id)
      .then((row) => {
        if (cancelled) return
        if (!row) {
          setMissing(true)
          return
        }
        setReceipt(row)
        setDraft(draftFromReceipt(row))
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'That receipt could not be opened.')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function commit(verified: boolean) {
    if (!receipt || !draft || busy) return
    const amount = parseAmount(draft.amount)
    if (verified && amount === 'invalid') {
      setError('Enter an amount like 12.40, or clear it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveReceipt({
        ...receipt,
        amountCents: amount === 'invalid' ? receipt.amountCents : amount,
        date: draft.date || null,
        vendor: draft.vendor.trim().slice(0, 80),
        category: draft.category,
        note: draft.note.trim().slice(0, 500),
        verified,
      })
      await reload()
      go({
        name: 'list',
        flash: verified ? 'Receipt saved on this device.' : 'Saved as unverified. The photo is on this phone.',
      })
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : 'The receipt could not be saved on this device.')
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

  if (!receipt || !draft) {
    return <p className="pt-6 text-mist">{error ?? 'Opening the saved photo…'}</p>
  }

  const title = receipt.vendor.trim() || 'this receipt'
  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <p className="text-sm font-semibold tracking-wide text-ambertext uppercase">StubJot</p>
        <h1 className="text-3xl font-semibold tracking-tight">Check this receipt</h1>
      </header>
      <p className="rounded-2xl bg-goodbg px-4 py-3 text-good" role="status" data-testid="photo-saved">
        Photo saved on this device.
      </p>
      <PhotoView photoId={receipt.photoId} alt={`Receipt photo for ${title}`} className="max-h-80 w-full rounded-3xl" />
      {receipt.glare || receipt.blur ? (
        <p className="text-sm text-warn">
          Kept with {receipt.glare && receipt.blur ? 'glare and blur' : receipt.glare ? 'glare' : 'blur'}. A clearer photo is easier to read later.
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-mist">
        If a field is empty, type it. Reading happens on this phone and can miss a line.
      </p>
      <ReceiptFields
        draft={draft}
        onChange={setDraft}
        amountError={error?.startsWith('Enter an amount') ? error : null}
      />
      <p className="text-sm leading-relaxed text-mist">{CONFIRM_NOTE}</p>
      {receipt.ocrSnippet ? (
        <details className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-mist">
          <summary className="cursor-pointer font-medium text-cream">Text read on this device</summary>
          <p className="mt-2 whitespace-pre-wrap">{receipt.ocrSnippet}</p>
        </details>
      ) : null}
      {error && !error.startsWith('Enter an amount') ? (
        <p className="text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={busy} onClick={() => void commit(true)}>
        Save receipt
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => void commit(false)}>
        Skip for now
      </Button>
      <p className="text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  )
}
