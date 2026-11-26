import { fileStamp, formatWhen } from './format'
import { categoryLabel, type Receipt } from './types'

function cell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function receiptsToCsv(receipts: Receipt[]): string {
  const header = ['date', 'vendor', 'category', 'amount', 'note', 'verified', 'created', 'photo', 'id']
  const lines = [header.join(',')]
  for (const receipt of receipts) {
    lines.push(
      [
        receipt.date ?? '',
        receipt.vendor,
        categoryLabel(receipt.category),
        receipt.amountCents == null ? '' : (receipt.amountCents / 100).toFixed(2),
        receipt.note,
        receipt.verified ? 'yes' : 'no',
        formatWhen(receipt.createdAt),
        receipt.photoId ? 'yes' : 'no',
        receipt.id,
      ]
        .map(cell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function csvFilename(date = new Date()): string {
  return `stubjot-receipts-${fileStamp(date)}.csv`
}

export function zipFilename(date = new Date()): string {
  return `stubjot-photos-${fileStamp(date)}.zip`
}
