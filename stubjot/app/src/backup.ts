import { csvFilename, receiptsToCsv, zipFilename } from './csv'
import { listPhotos } from './db'
import { deliverFile } from './share'
import type { Receipt } from './types'
import { safeFilePart, zipStore } from './zip'

export async function downloadCsv(receipts: Receipt[]): Promise<'shared' | 'downloaded' | 'canceled'> {
  const blob = new Blob([receiptsToCsv(receipts)], { type: 'text/csv;charset=utf-8' })
  return deliverFile(csvFilename(), blob)
}

export async function downloadPhotoZip(receipts: Receipt[]): Promise<'shared' | 'downloaded' | 'canceled' | 'empty'> {
  const photos = await listPhotos()
  if (!photos.length) return 'empty'
  const byId = new Map(receipts.filter((receipt) => receipt.photoId).map((receipt) => [receipt.photoId as string, receipt]))
  const entries = []
  for (const photo of photos) {
    const receipt = byId.get(photo.id)
    const ext = photo.blob.type.includes('webp') ? 'webp' : 'jpg'
    const name = `${receipt?.date ?? 'undated'}-${safeFilePart(receipt?.vendor || 'receipt')}-${photo.id.slice(0, 8)}.${ext}`
    entries.push({ name, data: new Uint8Array(await photo.blob.arrayBuffer()) })
  }
  const zipped = zipStore(entries)
  const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
  return deliverFile(zipFilename(), new Blob([buffer], { type: 'application/zip' }))
}

export function exportMessage(result: 'shared' | 'downloaded' | 'canceled' | 'empty', kind: 'csv' | 'zip'): string | null {
  if (result === 'canceled') return null
  if (result === 'empty') return 'No photos to export.'
  if (result === 'shared') {
    return kind === 'csv'
      ? 'Choose Files or Mail in the share sheet to keep the CSV.'
      : 'Choose Files in the share sheet to keep the photo ZIP.'
  }
  return kind === 'csv' ? 'CSV downloaded. It opens in Excel and Google Sheets.' : 'Photo ZIP downloaded.'
}
