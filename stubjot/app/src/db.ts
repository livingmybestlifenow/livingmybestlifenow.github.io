import { formatBytes, parseAmount, todayISO } from './format'
import { asCategory, type Draft, type PhotoRecord, type Receipt } from './types'

const DB_NAME = 'stubjot'
const DB_VERSION = 1

let opening: Promise<IDBDatabase> | null = null

function explain(error: unknown, fallback: string): Error {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return new Error('This device is out of space. Export a CSV, then delete receipts you have already copied.')
  }
  if (error instanceof Error && error.message) return error
  return new Error(fallback)
}

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      resolve(db)
    }
    request.onerror = () => {
      opening = null
      reject(explain(request.error, 'The receipt store on this device could not be opened.'))
    }
  })
  return opening
}

function finish(tx: IDBTransaction, fallback: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(explain(tx.error, fallback))
    tx.onabort = () => reject(explain(tx.error, fallback))
  })
}

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<Receipt>
  return typeof record.id === 'string' && typeof record.createdAt === 'number'
}

function normalize(record: Receipt): Receipt {
  return {
    ...record,
    vendor: record.vendor ?? '',
    note: record.note ?? '',
    category: asCategory(record.category ?? 'other'),
    verified: record.verified === true,
    photoId: record.photoId ?? null,
    amountCents: typeof record.amountCents === 'number' ? record.amountCents : null,
    date: record.date ?? null,
    ocrSnippet: record.ocrSnippet ?? '',
    glare: record.glare === true,
    blur: record.blur === true,
    updatedAt: record.updatedAt ?? record.createdAt,
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storagePersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

export async function storageUsageLabel(): Promise<string | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (estimate?.usage == null) return null
    return formatBytes(estimate.usage)
  } catch {
    return null
  }
}

export async function listReceipts(): Promise<Receipt[]> {
  const db = await openDb()
  const tx = db.transaction('receipts', 'readonly')
  const request = tx.objectStore('receipts').getAll()
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as unknown[])
    request.onerror = () => reject(explain(request.error, 'The receipts on this device could not be read.'))
  })
  await finish(tx, 'The receipts on this device could not be read.')
  return rows
    .filter(isReceipt)
    .map(normalize)
    .sort((a, b) => {
      const aKey = `${a.date ?? todayISO(new Date(a.createdAt))}${String(a.createdAt).padStart(16, '0')}`
      const bKey = `${b.date ?? todayISO(new Date(b.createdAt))}${String(b.createdAt).padStart(16, '0')}`
      return bKey.localeCompare(aKey)
    })
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const db = await openDb()
  const tx = db.transaction('receipts', 'readonly')
  const request = tx.objectStore('receipts').get(id)
  const row = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(explain(request.error, 'That receipt could not be opened.'))
  })
  await finish(tx, 'That receipt could not be opened.')
  return isReceipt(row) ? normalize(row) : null
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await openDb()
  const tx = db.transaction('photos', 'readonly')
  const request = tx.objectStore('photos').get(id)
  const row = await new Promise<PhotoRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as PhotoRecord | undefined)
    request.onerror = () => reject(explain(request.error, 'The photo could not be opened.'))
  })
  await finish(tx, 'The photo could not be opened.')
  if (!row?.blob) return null
  return row
}

export async function listPhotos(): Promise<PhotoRecord[]> {
  const db = await openDb()
  const tx = db.transaction('photos', 'readonly')
  const request = tx.objectStore('photos').getAll()
  const rows = await new Promise<PhotoRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as PhotoRecord[])
    request.onerror = () => reject(explain(request.error, 'The photos could not be read.'))
  })
  await finish(tx, 'The photos could not be read.')
  return rows.filter((row) => row?.blob)
}

export type CapturedPhoto = {
  blob: Blob
  width: number
  height: number
  glare: boolean
  blur: boolean
  draft: Draft | null
}

export async function saveCapturedPhoto(input: CapturedPhoto): Promise<Receipt> {
  const db = await openDb()
  const now = Date.now()
  const photoId = crypto.randomUUID()
  const draft = input.draft
  const draftedAmount = draft ? parseAmount(draft.amount) : null
  const receipt: Receipt = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    amountCents: typeof draftedAmount === 'number' ? draftedAmount : null,
    date: draft?.date || todayISO(),
    vendor: draft?.vendor.trim().slice(0, 80) ?? '',
    category: draft?.category ?? 'other',
    note: draft?.note.trim().slice(0, 500) ?? '',
    verified: false,
    photoId,
    ocrSnippet: '',
    glare: input.glare,
    blur: input.blur,
  }
  const photo: PhotoRecord = {
    id: photoId,
    blob: input.blob,
    width: input.width,
    height: input.height,
    createdAt: now,
  }
  const tx = db.transaction(['receipts', 'photos'], 'readwrite')
  tx.objectStore('photos').put(photo)
  tx.objectStore('receipts').put(receipt)
  await finish(tx, 'The photo could not be saved on this device.')
  return receipt
}

export async function saveReceipt(receipt: Receipt): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('receipts', 'readwrite')
  tx.objectStore('receipts').put({ ...receipt, updatedAt: Date.now() })
  await finish(tx, 'The receipt could not be saved on this device.')
}

export async function deleteReceipt(id: string): Promise<void> {
  const existing = await getReceipt(id)
  const db = await openDb()
  const tx = db.transaction(['receipts', 'photos'], 'readwrite')
  tx.objectStore('receipts').delete(id)
  if (existing?.photoId) tx.objectStore('photos').delete(existing.photoId)
  await finish(tx, 'The receipt could not be deleted.')
}

export async function deleteEverything(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['receipts', 'photos', 'meta'], 'readwrite')
  tx.objectStore('receipts').clear()
  tx.objectStore('photos').clear()
  tx.objectStore('meta').clear()
  await finish(tx, 'The receipts could not be deleted.')
}

export async function getLastExportAt(): Promise<number | null> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readonly')
  const request = tx.objectStore('meta').get('lastExportAt')
  const row = await new Promise<{ value?: number } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as { value?: number } | undefined)
    request.onerror = () => reject(explain(request.error, 'Export history could not be read.'))
  })
  await finish(tx, 'Export history could not be read.')
  return typeof row?.value === 'number' ? row.value : null
}

export async function setLastExportAt(value = Date.now()): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'lastExportAt', value })
  await finish(tx, 'Export history could not be saved.')
}
