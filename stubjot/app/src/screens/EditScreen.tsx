import { useEffect, useState } from 'react'
import { getReceipt, saveReceipt } from '../db'
import { draftFromReceipt, parseAmount } from '../format'
import type { Route } from '../route'
import { useStore } from '../store'
import { CONFIRM_NOTE, type Draft, type Receipt } from '../types'
import { Button, ReceiptFields } from '../ui'

export function EditScreen({ id, go }: { id: string; go: (route: Route) => void }) {
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

  async function save() {
    if (!receipt || !draft || busy) return
    const amount = parseAmount(draft.amount)
    if (amount === 'invalid') {
      setError('Enter an amount like 12.40, or clear it.')
      return
    }
    setBusy(true)
    try {
      await saveReceipt({
        ...receipt,
        amountCents: amount,
        date: draft.date || null,
        vendor: draft.vendor.trim().slice(0, 80),
        category: draft.category,
        note: draft.note.trim().slice(0, 500),
        verified: true,
      })
      await reload()
      go({ name: 'detail', id })
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
  if (!receipt || !draft) return <p className="pt-6 text-mist">{error ?? 'Opening the receipt…'}</p>

  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <button type="button" className="min-h-12 text-sm font-semibold text-ambertext" onClick={() => go({ name: 'detail', id })}>
          Back
        </button>
        <h1 className="text-3xl font-semibold tracking-tight">Edit receipt</h1>
      </header>
      <ReceiptFields draft={draft} onChange={setDraft} amountError={error} />
      <p className="text-sm leading-relaxed text-mist">{CONFIRM_NOTE}</p>
      <Button disabled={busy} onClick={() => void save()}>
        Save receipt
      </Button>
    </div>
  )
}
