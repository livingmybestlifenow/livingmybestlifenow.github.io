import { asCategory, type CategoryId } from './types'

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const CATEGORY_RULES: Array<[CategoryId, RegExp]> = [
  ['fuel', /\b(fuel|petrol|diesel|shell|chevron|exxon|mobil|sunoco|valero|circle k|speedway|pump|gas)\b/i],
  ['parking', /\b(parking|parkwhiz|spothero)\b/i],
  ['tolls', /\b(tolls?|ezpass|e-zpass|sunpass|fastrak)\b/i],
  ['phone', /\b(verizon|t-mobile|at&t|mint mobile|visible|cricket|wireless)\b/i],
  ['vehicle', /\b(oil change|autozone|jiffy lube|tires?|mechanic)\b/i],
  ['meals', /\b(cafe|café|coffee|restaurant|grill|diner|kitchen|starbucks|mcdonald|burger|pizza|doordash|uber eats|grubhub|deli|bakery)\b/i],
  ['supplies', /\b(supplies|supply|home depot|lowe'?s|staples|walmart|target|costco)\b/i],
  ['fees', /\b(fees?|dues|subscription|membership)\b/i],
]

export type ParsedReceipt = {
  amountCents: number | null
  date: string | null
  vendor: string
  category: CategoryId
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function iso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2099 || month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

export function parseDate(text: string): string | null {
  const isoMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (isoMatch) {
    const found = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
    if (found) return found
  }
  const named = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  )
  if (named) {
    const found = iso(Number(named[3]), MONTHS[named[1].toLowerCase().slice(0, 3)], Number(named[2]))
    if (found) return found
  }
  const namedDayFirst = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/i,
  )
  if (namedDayFirst) {
    const found = iso(
      Number(namedDayFirst[3]),
      MONTHS[namedDayFirst[2].toLowerCase().slice(0, 3)],
      Number(namedDayFirst[1]),
    )
    if (found) return found
  }
  const us = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (us) {
    let year = Number(us[3])
    if (year < 100) year += 2000
    return iso(year, Number(us[1]), Number(us[2]))
  }
  return null
}

function moneyOnLine(line: string): number | null {
  const matches = [...line.matchAll(/\$?\s*(\d{1,5})[.,](\d{2})\b/g)]
  if (!matches.length) return null
  const match = matches[matches.length - 1]
  const cents = Number(match[1]) * 100 + Number(match[2])
  if (!Number.isFinite(cents) || cents > 1_000_000_00) return null
  return cents
}

export function parseAmountFromText(text: string): number | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/\b(total|amount due|balance due|grand total)\b/i.test(line)) continue
    if (/\bsub-?total\b/i.test(line)) continue
    const onLine = moneyOnLine(line)
    if (onLine != null) return onLine
    const next = lines[index + 1]
    if (next && !/\b(sub-?total|tax|change|cash)\b/i.test(next)) {
      const onNext = moneyOnLine(next)
      if (onNext != null) return onNext
    }
  }
  const found: number[] = []
  for (const line of lines) {
    if (/\b(sub-?total|tax|change|cash|tip)\b/i.test(line)) continue
    const value = moneyOnLine(line)
    if (value != null) found.push(value)
  }
  return found.length ? found[found.length - 1] : null
}

function vendorFromLines(lines: string[]): string {
  const skip = /^(receipt|tax invoice|invoice|welcome|thank|tel|phone|date|time|cashier|total|subtotal|change|tax)\b/i
  for (const line of lines) {
    const letters = line.replace(/[^A-Za-z]/g, '')
    if (letters.length < 3) continue
    if (skip.test(line)) continue
    if (/^\$?\d/.test(line) && letters.length < 4) continue
    if (parseDate(line) && letters.length < 6) continue
    return line.replace(/\s+/g, ' ').slice(0, 60)
  }
  return ''
}

export function guessCategory(text: string): CategoryId {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category
  }
  return 'other'
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const vendor = vendorFromLines(lines)
  return {
    amountCents: parseAmountFromText(text),
    date: parseDate(text),
    vendor,
    category: asCategory(guessCategory(`${vendor}\n${text}`)),
  }
}
