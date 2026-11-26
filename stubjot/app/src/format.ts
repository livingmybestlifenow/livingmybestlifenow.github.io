import type { Draft } from './types'

export function todayISO(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function emptyDraft(date = new Date()): Draft {
  return { amount: '', date: todayISO(date), vendor: '', category: 'other', note: '' }
}

export function fileStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

export function formatWhen(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${todayISO(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDay(iso: string | null, fallback: number): string {
  const value = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO(new Date(fallback))
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  if (!year || !month) return key
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatMoney(cents: number | null): string {
  if (cents == null) return 'Amount missing'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function centsToInput(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

export function parseAmount(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[$\s]/g, '').replace(/,/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return 'invalid'
  const [dollars, fraction = ''] = cleaned.split('.')
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  if (!Number.isFinite(cents) || cents > 1_000_000_00) return 'invalid'
  return cents
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function monthKeyOf(date: string | null, createdAt: number): string {
  if (date && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7)
  return todayISO(new Date(createdAt)).slice(0, 7)
}

export function draftFromReceipt(receipt: {
  amountCents: number | null
  date: string | null
  vendor: string
  category: Draft['category']
  note: string
}): Draft {
  return {
    amount: centsToInput(receipt.amountCents),
    date: receipt.date ?? '',
    vendor: receipt.vendor,
    category: receipt.category,
    note: receipt.note,
  }
}
