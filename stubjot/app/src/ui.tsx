import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { getPhoto } from './db'
import { CATEGORIES, type Draft } from './types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const look = {
    primary: 'bg-amber text-ink',
    secondary: 'border border-line bg-panel2 text-cream',
    quiet: 'bg-transparent text-ambertext',
    danger: 'border border-bad/40 bg-badbg text-bad',
  }[variant]
  return (
    <button
      type={type}
      {...props}
      className={cx(
        'inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-4 text-lg font-semibold disabled:opacity-45',
        look,
        className,
      )}
    />
  )
}

export function ReceiptFields({
  draft,
  onChange,
  amountError,
}: {
  draft: Draft
  onChange: (next: Draft) => void
  amountError?: string | null
}) {
  return (
    <div className="grid gap-3">
      <label className="block text-sm font-medium text-mist">
        Amount
        <input
          className="field mt-1 font-mono text-2xl"
          inputMode="decimal"
          autoComplete="off"
          value={draft.amount}
          aria-invalid={amountError ? true : undefined}
          onChange={(event) => onChange({ ...draft, amount: event.target.value })}
        />
      </label>
      {amountError ? (
        <p className="text-sm text-bad" role="alert">
          {amountError}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-mist">
        Date
        <input
          className="field mt-1"
          type="date"
          value={draft.date}
          onChange={(event) => onChange({ ...draft, date: event.target.value })}
        />
      </label>
      <label className="block text-sm font-medium text-mist">
        Vendor
        <input
          className="field mt-1"
          autoComplete="off"
          value={draft.vendor}
          onChange={(event) => onChange({ ...draft, vendor: event.target.value })}
        />
      </label>
      <label className="block text-sm font-medium text-mist">
        Category
        <select
          className="field mt-1"
          value={draft.category}
          onChange={(event) => onChange({ ...draft, category: event.target.value as Draft['category'] })}
        >
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-mist">
        Note
        <textarea
          className="field mt-1 min-h-24"
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </label>
    </div>
  )
}

export function PhotoView({
  photoId,
  alt,
  className,
}: {
  photoId: string | null
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!photoId) return
    let cancelled = false
    let objectUrl: string | null = null
    getPhoto(photoId)
      .then((photo) => {
        if (cancelled || !photo) {
          if (!cancelled) setFailed(true)
          return
        }
        objectUrl = URL.createObjectURL(photo.blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId])
  if (!photoId) return null
  if (failed) {
    return <p className="text-sm text-warn">The photo is saved on this device, but it could not be shown.</p>
  }
  if (!url) return <div className={cx('animate-pulse bg-panel2', className)} />
  return <img src={url} alt={alt} className={cx('bg-panel2 object-contain', className)} />
}

export function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path
        d="M7 3.5h10v14.2l-1.7 1.1L13.6 17.7 12 18.8 10.4 17.7 8.7 18.8 7 17.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M9 8h6M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function IconAdd() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function IconMore() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-3xl border border-line bg-panel p-4', className)}>{children}</section>
}
