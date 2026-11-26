import { useState } from 'react'
import { parseAmount } from '../format'
import { saveReceipt } from '../db'
import type { Route } from '../route'
import { useStore } from '../store'
import { CONFIRM_NOTE, DISCLAIMER, type Draft, type Receipt } from '../types'
import { Button, ReceiptFields } from '../ui'

export function ManualScreen({ draft, go }: { draft: Draft; go: (route: Route) => void }) {
  const { reload } = useStore()
  const [fields, setFields] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function amountProblem(): string | null {
    return parseAmount(fields.amount) === 'invalid' ? 'Enter an amount like 12.40, or clear it.' : null
  }

  function goCapture(file: File | null) {
    const problem = amountProblem()
    if (problem) {
      setError(problem)
      return
    }
    go({ name: 'capture', file, draft: fields })
  }

  async function save() {
    const problem = amountProblem()
    if (problem) {
      setError(problem)
      return
    }
    const amount = parseAmount(fields.amount)
    const vendor = fields.vendor.trim()
    const note = fields.note.trim()
    if (amount == null && !vendor && !note) {
      setError('Add an amount, a vendor, or a note.')
      return
    }
    setBusy(true)
    setError(null)
    const now = Date.now()
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      amountCents: typeof amount === 'number' ? amount : null,
      date: fields.date || null,
      vendor: vendor.slice(0, 80),
      category: fields.category,
      note: note.slice(0, 500),
      verified: true,
      photoId: null,
      ocrSnippet: '',
      glare: false,
      blur: false,
    }
    try {
      await saveReceipt(receipt)
      await reload()
      go({ name: 'list', flash: 'Receipt saved on this device.' })
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : 'The receipt could not be saved on this device.')
    }
  }

  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <button type="button" className="min-h-12 text-sm font-semibold text-ambertext" onClick={() => go({ name: 'add' })}>
          Back
        </button>
        <h1 className="text-3xl font-semibold tracking-tight">Type a receipt</h1>
        <p className="mt-1 text-mist">This stays on this phone. A photo is optional.</p>
      </header>
      <ReceiptFields draft={fields} onChange={setFields} amountError={error} />
      <p className="text-sm leading-relaxed text-mist">{CONFIRM_NOTE}</p>
      <Button disabled={busy} onClick={() => void save()}>
        Save receipt
      </Button>
      <Button variant="secondary" onClick={() => goCapture(null)}>
        Take a photo
      </Button>
      <label className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl border border-line bg-panel2 px-4 text-lg font-semibold">
        Attach a photo
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) goCapture(file)
          }}
        />
      </label>
      <p className="text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  )
}
