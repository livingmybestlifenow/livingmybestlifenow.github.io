import { describe, expect, it } from 'vitest'
import { csvFilename, receiptsToCsv, zipFilename } from './csv'
import { parseAmount } from './format'
import { assessGray, clampCrop, detectDocumentBox, moveCrop } from './image-math'
import { parseReceiptText } from './parse'
import type { Receipt } from './types'
import { zipStore } from './zip'

function fill(width: number, height: number, pixel: (x: number, y: number) => number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) gray[y * width + x] = pixel(x, y)
  }
  return gray
}

describe('document box', () => {
  it('finds a light receipt on a dark background', () => {
    const width = 200
    const height = 280
    const gray = fill(width, height, (x, y) => (x >= 40 && x <= 160 && y >= 48 && y <= 220 ? 240 : 24))
    const box = detectDocumentBox(gray, width, height)
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.x).toBeGreaterThan(0.08)
    expect(box.x).toBeLessThan(0.28)
    expect(box.y).toBeGreaterThan(0.08)
    expect(box.y).toBeLessThan(0.24)
    expect(box.x + box.w).toBeGreaterThan(0.72)
    expect(box.y + box.h).toBeGreaterThan(0.7)
  })

  it('returns null when the frame has no edges', () => {
    const gray = fill(80, 80, () => 30)
    expect(detectDocumentBox(gray, 80, 80)).toBeNull()
  })
})

describe('photo quality', () => {
  it('flags a flat frame as blur and a hard edge as sharp', () => {
    const flat = assessGray(fill(96, 96, () => 140), 96, 96)
    const sharp = assessGray(
      fill(128, 128, (x) => (Math.floor(x / 8) % 2 === 0 ? 20 : 230)),
      128,
      128,
    )
    expect(flat.blur).toBe(true)
    expect(sharp.blur).toBe(false)
  })

  it('flags a smooth clipped hotspot and ignores ordinary paper', () => {
    const paper = assessGray(
      fill(160, 160, (_x, y) => (y % 18 < 2 ? 20 : 242)),
      160,
      160,
    )
    const glare = assessGray(
      fill(160, 160, (x, y) => (x < 64 && y < 64 ? 255 : 150)),
      160,
      160,
    )
    expect(paper.glare).toBe(false)
    expect(glare.glare).toBe(true)
  })
})

describe('crop handles', () => {
  it('keeps the box inside the frame', () => {
    const moved = moveCrop({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 'move', 5, -5)
    expect(moved.x).toBeGreaterThanOrEqual(0)
    expect(moved.y).toBeGreaterThanOrEqual(0)
    expect(moved.x + moved.w).toBeLessThanOrEqual(1)
    expect(moved.w).toBeGreaterThanOrEqual(0.12)
    expect(clampCrop({ x: -1, y: 2, w: 0.01, h: 3 }).w).toBeGreaterThanOrEqual(0.12)
  })
})

describe('receipt text', () => {
  it('reads a cafe total, date, vendor, and category', () => {
    const parsed = parseReceiptText(`CAFE JOE
123 Main Street
11/26/2026
Latte 4.50
Sandwich 8.90
Subtotal 13.40
Tax 1.07
TOTAL 14.47`)
    expect(parsed.vendor).toBe('CAFE JOE')
    expect(parsed.amountCents).toBe(1447)
    expect(parsed.date).toBe('2026-11-26')
    expect(parsed.category).toBe('meals')
  })

  it('reads a fuel total on the following line', () => {
    const parsed = parseReceiptText(`SHELL
11/01/2026
PUMP 3
TOTAL
$42.18`)
    expect(parsed.vendor).toBe('SHELL')
    expect(parsed.amountCents).toBe(4218)
    expect(parsed.date).toBe('2026-11-01')
    expect(parsed.category).toBe('fuel')
  })
})

describe('amounts', () => {
  it('parses money the way a person types it', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('$12.40')).toBe(1240)
    expect(parseAmount('1,240.50')).toBe(124050)
    expect(parseAmount('abc')).toBe('invalid')
  })
})

describe('exports', () => {
  it('names files with the stubjot- prefix and escapes csv cells', () => {
    expect(csvFilename(new Date(2026, 10, 26, 9, 5))).toBe('stubjot-receipts-20261126-0905.csv')
    expect(zipFilename(new Date(2026, 10, 26, 9, 5))).toBe('stubjot-photos-20261126-0905.zip')
    const receipt: Receipt = {
      id: 'abc',
      createdAt: new Date(2026, 10, 26, 9, 5).getTime(),
      updatedAt: new Date(2026, 10, 26, 9, 5).getTime(),
      amountCents: 1447,
      date: '2026-11-26',
      vendor: 'Cafe "Joe"',
      category: 'meals',
      note: 'lunch, downtown',
      verified: false,
      photoId: 'photo',
      ocrSnippet: '',
      glare: false,
      blur: false,
    }
    const csv = receiptsToCsv([receipt])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Cafe ""Joe"""')
    expect(csv).toContain('"lunch, downtown"')
    expect(csv).toContain('14.47')
    expect(csv).toContain(',no,')
  })

  it('stores a zip the device can open', () => {
    const zipped = zipStore([{ name: 'stubjot-note.txt', data: new TextEncoder().encode('hello') }])
    expect(String.fromCharCode(zipped[0], zipped[1], zipped[2], zipped[3])).toBe('PK\u0003\u0004')
    expect(new TextDecoder().decode(zipped)).toContain('stubjot-note.txt')
  })
})
